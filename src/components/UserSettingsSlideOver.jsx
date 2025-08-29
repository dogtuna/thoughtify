import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { onAuthStateChanged, updateProfile } from "firebase/auth";
import { auth, db, app } from "../firebase";
import {
  doc,
  getDoc,
  deleteDoc,
  setDoc,
} from "firebase/firestore";
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
  const [outlookConnected, setOutlookConnected] = useState(false);
  const [smtpConnected, setSmtpConnected] = useState(false);
  const [outlookUser, setOutlookUser] = useState("");
  const [outlookPass, setOutlookPass] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const fileInput = useRef(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUid(user.uid);
        setAvatarUrl(user.photoURL || avatarUrl);
        const gmailSnap = await getDoc(doc(db, "users", user.uid, "emailTokens", "gmail"));
        setGmailConnected(gmailSnap.exists());
        const outlookSnap = await getDoc(
          doc(db, "users", user.uid, "emailTokens", "outlook"),
        );
        if (outlookSnap.exists()) {
          const data = outlookSnap.data();
          setOutlookConnected(true);
          setOutlookUser(data.user || "");
        }
        const smtpSnap = await getDoc(doc(db, "users", user.uid, "emailTokens", "smtp"));
        setSmtpConnected(smtpSnap.exists());
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

  const saveOutlook = async () => {
    if (!uid) return;
    await setDoc(doc(db, "users", uid, "emailTokens", "outlook"), {
      user: outlookUser,
      pass: outlookPass,
    });
    setOutlookConnected(true);
  };

  const disconnectOutlook = async () => {
    if (!uid) return;
    await deleteDoc(doc(db, "users", uid, "emailTokens", "outlook"));
    setOutlookConnected(false);
    setOutlookUser("");
    setOutlookPass("");
  };

  const saveSmtp = async () => {
    if (!uid) return;
    await setDoc(doc(db, "users", uid, "emailTokens", "smtp"), {
      host: smtpHost,
      port: smtpPort,
      user: smtpUser,
      pass: smtpPass,
    });
    setSmtpConnected(true);
  };

  const disconnectSmtp = async () => {
    if (!uid) return;
    await deleteDoc(doc(db, "users", uid, "emailTokens", "smtp"));
    setSmtpConnected(false);
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
          {outlookConnected ? (
            <div>
              <p>Outlook account connected.</p>
              <button onClick={disconnectOutlook}>Disconnect Outlook</button>
            </div>
          ) : (
            <div className="settings-section">
              <input
                className="generator-input"
                type="text"
                placeholder="Outlook Username"
                value={outlookUser}
                onChange={(e) => setOutlookUser(e.target.value)}
              />
              <input
                className="generator-input"
                type="password"
                placeholder="Outlook Password"
                value={outlookPass}
                onChange={(e) => setOutlookPass(e.target.value)}
              />
              <button onClick={saveOutlook}>Save Outlook</button>
            </div>
          )}
          {smtpConnected ? (
            <div>
              <p>SMTP credentials saved.</p>
              <button onClick={disconnectSmtp}>Remove SMTP</button>
            </div>
          ) : (
            <div className="settings-section">
              <input
                className="generator-input"
                type="text"
                placeholder="SMTP Host"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
              />
              <input
                className="generator-input"
                type="text"
                placeholder="SMTP Port"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
              />
              <input
                className="generator-input"
                type="text"
                placeholder="SMTP Username"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
              />
              <input
                className="generator-input"
                type="password"
                placeholder="SMTP Password"
                value={smtpPass}
                onChange={(e) => setSmtpPass(e.target.value)}
              />
              <button onClick={saveSmtp}>Save SMTP</button>
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

