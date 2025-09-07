import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { onAuthStateChanged, updateProfile, signOut, sendPasswordResetEmail } from "firebase/auth";
import { auth, db, app, functions, appCheck, storage } from "../firebase";
import { doc, getDoc, deleteDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getToken } from "firebase/app-check";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import "./UserSettingsSlideOver.css";

const functionsBaseUrl =
  import.meta.env.VITE_FUNCTIONS_BASE_URL ||
  `https://us-central1-${import.meta.env.VITE_FIREBASE_PROJECT_ID}.cloudfunctions.net`;

export default function UserSettingsSlideOver({ onClose }) {
  const [uid, setUid] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [gmailConnected, setGmailConnected] = useState(false);
  const [imapConnected, setImapConnected] = useState(false);
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState("");
  const [imapSmtpHost, setImapSmtpHost] = useState("");
  const [imapSmtpPort, setImapSmtpPort] = useState("");
  const [imapUser, setImapUser] = useState("");
  const [imapPass, setImapPass] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [resetErr, setResetErr] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [emailOpen, setEmailOpen] = useState(true);
  const [showConnectOptions, setShowConnectOptions] = useState(false);
  const [editingImap, setEditingImap] = useState(false);
  const fileInput = useRef(null);
  const [avatarError, setAvatarError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUid(user.uid);
        setAvatarUrl(user.photoURL || "");
        const gmailSnap = await getDoc(doc(db, "users", user.uid, "emailTokens", "gmail"));
        setGmailConnected(gmailSnap.exists());
        const imapSnap = await getDoc(
          doc(db, "users", user.uid, "emailTokens", "imap"),
        );
        if (imapSnap.exists()) {
          const data = imapSnap.data();
          setImapConnected(true);
          setImapHost(data.host || "");
          setImapPort(String(data.port || ""));
          setImapSmtpHost(data.smtpHost || "");
          setImapSmtpPort(String(data.smtpPort || ""));
          setImapUser(data.user || "");
        }
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !uid) return;
    setAvatarError("");
    try {
      const ref = storageRef(storage, `avatars/${uid}`);
      await uploadBytes(ref, file);
      const url = await getDownloadURL(ref);
      await updateProfile(auth.currentUser, { photoURL: url });
      try { await auth.currentUser?.reload(); } catch {}
      setAvatarUrl(url);
      // Notify other components (e.g., NavBar) to refresh avatar
      window.dispatchEvent(new Event("userProfileUpdated"));
    } catch (err) {
      console.error("Avatar upload error:", err);
      setAvatarError(
        err?.code === "storage/unauthorized"
          ? "Permission denied. Please make sure you’re signed in and storage rules allow avatar uploads."
          : (err?.message || "Failed to upload avatar.")
      );
    }
  };

  const initials = useMemo(() => {
    const name = auth.currentUser?.displayName || "";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0];
    const last = parts.length > 1 ? parts[parts.length - 1][0] : (auth.currentUser?.email?.[0] || "");
    const letters = ((first || "").toUpperCase() + (last || "").toUpperCase()).slice(0, 2) || "U";
    return letters;
  }, [auth.currentUser?.displayName, auth.currentUser?.email]);

  const computedAvatar = useMemo(() => {
    return avatarUrl || `https://placehold.co/80x80/764ba2/FFFFFF?text=${encodeURIComponent(initials)}`;
  }, [avatarUrl, initials]);

  const handleSendReset = async () => {
    setResetMsg("");
    setResetErr("");
    const email = auth.currentUser?.email;
    if (!email) {
      setResetErr("No email associated with this account.");
      return;
    }
    try {
      setResetBusy(true);
      await sendPasswordResetEmail(auth, email);
      setResetMsg("Password reset email sent.");
    } catch (e) {
      console.error("Reset email error:", e);
      setResetErr(e.message || "Could not send reset email.");
    } finally {
      setResetBusy(false);
    }
  };

  const connectGmail = () => {
    if (!uid) return;
    window.open(
      `${functionsBaseUrl}/getEmailAuthUrl?provider=gmail&state=${uid}`,
      "_blank",
      "width=500,height=600"
    );
  };

  const disconnectGmail = async () => {
    if (!uid) return;
    await deleteDoc(doc(db, "users", uid, "emailTokens", "gmail"));
    setGmailConnected(false);
  };

  const saveCredentials = async (data) => {
    if (!auth.currentUser) return;
    if (appCheck) await getToken(appCheck);
    await auth.currentUser.getIdToken(true);
    const saveFn = httpsCallable(functions, "saveEmailCredentials");
    await saveFn(data);
  };

  const saveImap = async () => {
    if (!uid) return;
    await saveCredentials({
      provider: "imap",
      host: imapHost.trim(),
      port: imapPort,
      smtpHost: imapSmtpHost.trim(),
      smtpPort: imapSmtpPort,
      user: imapUser.trim(),
      pass: imapPass,
    });
    setImapConnected(true);
  };

  const disconnectImap = async () => {
    if (!uid) return;
    await deleteDoc(doc(db, "users", uid, "emailTokens", "imap"));
    setImapConnected(false);
    setImapHost("");
    setImapPort("");
    setImapSmtpHost("");
    setImapSmtpPort("");
    setImapUser("");
    setImapPass("");
  };

  // POP3 support removed per design

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Error signing out:", e);
    } finally {
      if (onClose) onClose();
    }
  };

  return createPortal(
    <div className="slide-over-overlay" onClick={onClose}>
      <div className="slide-over-panel" onClick={(e) => e.stopPropagation()}>
        <h2>User Settings</h2>
        <section
          className="settings-section"
          style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 16 }}
        >
          <img src={computedAvatar} alt="User Avatar" className="settings-avatar" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button type="button" onClick={() => fileInput.current?.click()}>
              Edit Avatar
            </button>
            <button onClick={handleSignOut}>Sign Out</button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleAvatarChange}
          />
          {avatarError && (
            <p style={{ color: "#E64A78", marginTop: 8 }}>{avatarError}</p>
          )}
        </section>

        <section className="settings-section">
          <h3 style={{ cursor: "pointer" }} onClick={() => setEmailOpen((v) => !v)}>
            Email Settings {emailOpen ? "▾" : "▸"}
          </h3>
          {emailOpen && (
            <div>
              {gmailConnected ? (
                <div>
                  <p>Gmail account connected.</p>
                  <button onClick={disconnectGmail}>Disconnect Gmail</button>
                </div>
              ) : imapConnected ? (
                <div>
                  <p>IMAP account connected.</p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => setEditingImap((v) => !v)}>
                      {editingImap ? "Close IMAP Settings" : "Edit IMAP Settings"}
                    </button>
                    <button onClick={disconnectImap}>Disconnect IMAP</button>
                  </div>
                  {editingImap && (
                    <div style={{ marginTop: 12 }}>
                      <label className="generator-input" style={{ display: "block" }}>
                        <input
                          className="generator-input"
                          type="text"
                          placeholder="IMAP Username"
                          value={imapUser}
                          onChange={(e) => setImapUser(e.target.value)}
                        />
                      </label>
                      <label className="generator-input" style={{ display: "block" }}>
                        <input
                          className="generator-input"
                          type="password"
                          placeholder="IMAP Password"
                          value={imapPass}
                          onChange={(e) => setImapPass(e.target.value)}
                        />
                      </label>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          className="generator-input"
                          type="text"
                          placeholder="IMAP Host"
                          value={imapHost}
                          onChange={(e) => setImapHost(e.target.value)}
                        />
                        <input
                          className="generator-input"
                          type="text"
                          placeholder="IMAP Port"
                          value={imapPort}
                          onChange={(e) => setImapPort(e.target.value)}
                        />
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          className="generator-input"
                          type="text"
                          placeholder="SMTP Host"
                          value={imapSmtpHost}
                          onChange={(e) => setImapSmtpHost(e.target.value)}
                        />
                        <input
                          className="generator-input"
                          type="text"
                          placeholder="SMTP Port"
                          value={imapSmtpPort}
                          onChange={(e) => setImapSmtpPort(e.target.value)}
                        />
                      </div>
                      <button onClick={saveImap} style={{ marginTop: 8 }}>Save Settings</button>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  {!showConnectOptions ? (
                    <button onClick={() => setShowConnectOptions(true)}>Connect Email</button>
                  ) : (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button onClick={connectGmail}>Continue with Google</button>
                      <button onClick={() => { setEditingImap(true); }}>Use IMAP</button>
                    </div>
                  )}
                  {editingImap && (
                    <div style={{ marginTop: 12 }}>
                      <label className="generator-input" style={{ display: "block" }}>
                        <input
                          className="generator-input"
                          type="text"
                          placeholder="IMAP Username"
                          value={imapUser}
                          onChange={(e) => setImapUser(e.target.value)}
                        />
                      </label>
                      <label className="generator-input" style={{ display: "block" }}>
                        <input
                          className="generator-input"
                          type="password"
                          placeholder="IMAP Password"
                          value={imapPass}
                          onChange={(e) => setImapPass(e.target.value)}
                        />
                      </label>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          className="generator-input"
                          type="text"
                          placeholder="IMAP Host"
                          value={imapHost}
                          onChange={(e) => setImapHost(e.target.value)}
                        />
                        <input
                          className="generator-input"
                          type="text"
                          placeholder="IMAP Port"
                          value={imapPort}
                          onChange={(e) => setImapPort(e.target.value)}
                        />
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          className="generator-input"
                          type="text"
                          placeholder="SMTP Host"
                          value={imapSmtpHost}
                          onChange={(e) => setImapSmtpHost(e.target.value)}
                        />
                        <input
                          className="generator-input"
                          type="text"
                          placeholder="SMTP Port"
                          value={imapSmtpPort}
                          onChange={(e) => setImapSmtpPort(e.target.value)}
                        />
                      </div>
                      <button onClick={async () => { await saveImap(); setShowConnectOptions(false); setEditingImap(false); }} style={{ marginTop: 8 }}>Save Settings</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="settings-section">
          <h3>Account</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={handleSendReset} disabled={resetBusy}>
              {resetBusy ? "Sending…" : "Email Password Reset"}
            </button>
          </div>
          {resetMsg && <p style={{ marginTop: 8 }}>{resetMsg}</p>}
          {resetErr && <p style={{ marginTop: 8, color: "#c0392b" }}>{resetErr}</p>}
        </section>
        <div>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
