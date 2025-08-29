import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { onAuthStateChanged, updateProfile } from "firebase/auth";
import { auth, db, app, functions } from "../firebase";
import { doc, getDoc, deleteDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import "./UserSettingsSlideOver.css";

const functionsBaseUrl =
  import.meta.env.VITE_FUNCTIONS_BASE_URL ||
  `https://us-central1-${import.meta.env.VITE_FIREBASE_PROJECT_ID}.cloudfunctions.net`;

export default function UserSettingsSlideOver({ onClose }) {
  const [uid, setUid] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("https://placehold.co/80x80/764ba2/FFFFFF?text=ID");
  const [gmailConnected, setGmailConnected] = useState(false);
  const [imapConnected, setImapConnected] = useState(false);
  const [popConnected, setPopConnected] = useState(false);
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState("");
  const [imapSmtpHost, setImapSmtpHost] = useState("");
  const [imapSmtpPort, setImapSmtpPort] = useState("");
  const [imapUser, setImapUser] = useState("");
  const [imapPass, setImapPass] = useState("");
  const [popHost, setPopHost] = useState("");
  const [popPort, setPopPort] = useState("");
  const [popSmtpHost, setPopSmtpHost] = useState("");
  const [popSmtpPort, setPopSmtpPort] = useState("");
  const [popUser, setPopUser] = useState("");
  const [popPass, setPopPass] = useState("");
  const fileInput = useRef(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUid(user.uid);
        setAvatarUrl(user.photoURL || avatarUrl);
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
        const popSnap = await getDoc(
          doc(db, "users", user.uid, "emailTokens", "pop3"),
        );
        if (popSnap.exists()) {
          const data = popSnap.data();
          setPopConnected(true);
          setPopHost(data.host || "");
          setPopPort(String(data.port || ""));
          setPopSmtpHost(data.smtpHost || "");
          setPopSmtpPort(String(data.smtpPort || ""));
          setPopUser(data.user || "");
        }
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !uid) return;
    const storage = getStorage(app);
    const ref = storageRef(storage, `avatars/${uid}`);
    await uploadBytes(ref, file);
    const url = await getDownloadURL(ref);
    await updateProfile(auth.currentUser, { photoURL: url });
    setAvatarUrl(url);
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

  const savePop = async () => {
    if (!uid) return;
    await saveCredentials({
      provider: "pop3",
      host: popHost.trim(),
      port: popPort,
      smtpHost: popSmtpHost.trim(),
      smtpPort: popSmtpPort,
      user: popUser.trim(),
      pass: popPass,
    });
    setPopConnected(true);
  };

  const disconnectPop = async () => {
    if (!uid) return;
    await deleteDoc(doc(db, "users", uid, "emailTokens", "pop3"));
    setPopConnected(false);
    setPopHost("");
    setPopPort("");
    setPopSmtpHost("");
    setPopSmtpPort("");
    setPopUser("");
    setPopPass("");
  };

  return createPortal(
    <div className="slide-over-overlay" onClick={onClose}>
      <div className="slide-over-panel" onClick={(e) => e.stopPropagation()}>
        <h2>User Settings</h2>
        <section className="settings-section">
          <img src={avatarUrl} alt="User Avatar" className="settings-avatar" />
          <button type="button" onClick={() => fileInput.current?.click()}>
            Edit Avatar
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleAvatarChange}
          />
        </section>
        <section className="settings-section">
          <h3>Email Accounts</h3>
          {gmailConnected ? (
            <div>
              <p>Gmail account connected.</p>
              <button onClick={disconnectGmail}>Disconnect Gmail</button>
            </div>
          ) : (
            <button onClick={connectGmail}>Connect Gmail</button>
          )}
          {imapConnected ? (
            <div>
              <p>IMAP account connected.</p>
              <button onClick={disconnectImap}>Disconnect IMAP</button>
            </div>
          ) : (
            <div className="settings-section">
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
              <input
                className="generator-input"
                type="text"
                placeholder="IMAP Username"
                value={imapUser}
                onChange={(e) => setImapUser(e.target.value)}
              />
              <input
                className="generator-input"
                type="password"
                placeholder="IMAP Password"
                value={imapPass}
                onChange={(e) => setImapPass(e.target.value)}
              />
              <button onClick={saveImap}>Save IMAP</button>
            </div>
          )}
          {popConnected ? (
            <div>
              <p>POP3 account connected.</p>
              <button onClick={disconnectPop}>Disconnect POP3</button>
            </div>
          ) : (
            <div className="settings-section">
              <input
                className="generator-input"
                type="text"
                placeholder="POP3 Host"
                value={popHost}
                onChange={(e) => setPopHost(e.target.value)}
              />
              <input
                className="generator-input"
                type="text"
                placeholder="POP3 Port"
                value={popPort}
                onChange={(e) => setPopPort(e.target.value)}
              />
              <input
                className="generator-input"
                type="text"
                placeholder="SMTP Host"
                value={popSmtpHost}
                onChange={(e) => setPopSmtpHost(e.target.value)}
              />
              <input
                className="generator-input"
                type="text"
                placeholder="SMTP Port"
                value={popSmtpPort}
                onChange={(e) => setPopSmtpPort(e.target.value)}
              />
              <input
                className="generator-input"
                type="text"
                placeholder="POP3 Username"
                value={popUser}
                onChange={(e) => setPopUser(e.target.value)}
              />
              <input
                className="generator-input"
                type="password"
                placeholder="POP3 Password"
                value={popPass}
                onChange={(e) => setPopPass(e.target.value)}
              />
              <button onClick={savePop}>Save POP3</button>
            </div>
          )}
        </section>
        <div>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

