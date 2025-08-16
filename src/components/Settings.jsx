import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, getDoc, deleteDoc } from "firebase/firestore";

const functionsBaseUrl =
  import.meta.env.VITE_FUNCTIONS_BASE_URL ||
  `https://us-central1-${import.meta.env.VITE_FIREBASE_PROJECT_ID}.cloudfunctions.net`;

const Settings = () => {
  const [uid, setUid] = useState("");
  const [gmailConnected, setGmailConnected] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUid(user.uid);
        const snap = await getDoc(
          doc(db, "users", user.uid, "emailTokens", "gmail")
        );
        setGmailConnected(snap.exists());
      }
    });
    return () => unsub();
  }, []);

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

  return (
    <div className="glass-card">
      <h2>Settings</h2>
      <section>
        <h3>Email Accounts</h3>
        {gmailConnected ? (
          <>
            <p>Gmail account connected.</p>
            <button onClick={disconnectGmail}>Disconnect Gmail</button>
          </>
        ) : (
          <>
            <p>No Gmail account connected.</p>
            <button onClick={connectGmail}>Connect Gmail</button>
          </>
        )}
      </section>
    </div>
  );
};

export default Settings;
