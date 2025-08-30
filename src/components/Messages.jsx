import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { auth, db } from "../firebase";

export default function Messages() {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    let unsubAuth = null;
    let unsubMsgs = null;

    unsubAuth = onAuthStateChanged(auth, (user) => {
      if (unsubMsgs) unsubMsgs();
      if (user) {
        const q = query(
          collection(db, "users", user.uid, "messages"),
          orderBy("createdAt", "desc")
        );
        unsubMsgs = onSnapshot(q, (snap) => {
          const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setMessages(data);
        });
      } else {
        setMessages([]);
      }
    });

    return () => {
      if (unsubAuth) unsubAuth();
      if (unsubMsgs) unsubMsgs();
    };
  }, []);

  return (
    <div className="messages-page">
      <h1>Messages</h1>
      {messages.length === 0 ? (
        <p>No messages</p>
      ) : (
        <ul>
          {messages.map((m) => (
            <li key={m.id} className="message-item">
              <p><strong>{m.subject || "(no subject)"}</strong></p>
              <p>{m.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
