import { createContext, useContext, useEffect, useState } from "react";
import PropTypes from "prop-types";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, query, orderBy, updateDoc, doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { computeUnreadCounts } from "./notificationUtils.js";

const NotificationsContext = createContext();

export const NotificationsProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});

  useEffect(() => {
    let unsubAuth = null;
    let unsubNotif = null;

    unsubAuth = onAuthStateChanged(auth, (user) => {
      if (unsubNotif) {
        unsubNotif();
      }
      if (user) {
        const q = query(
          collection(db, "users", user.uid, "notifications"),
          orderBy("createdAt", "desc")
        );
        unsubNotif = onSnapshot(q, (snap) => {
          const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setNotifications(data);
          setUnreadCounts(computeUnreadCounts(data));
          // Best-effort cleanup: if a message-backed notification points to a missing message, clear its count.
          (async () => {
            try {
              const checks = data.map(async (n) => {
                if (n.type !== "answerReceived") return;
                let messageId = n.messageId;
                if (!messageId && typeof n.href === "string") {
                  try {
                    const u = new URL(n.href, window.location.origin);
                    messageId = u.searchParams.get("messageId");
                  } catch {}
                }
                if (!messageId) return;
                try {
                  const mRef = doc(db, "users", user.uid, "messages", messageId);
                  const mSnap = await getDoc(mRef);
                  if (!mSnap.exists() && (n.count || 0) > 0) {
                    await updateDoc(doc(db, "users", user.uid, "notifications", n.id), { count: 0 });
                  }
                } catch {}
              });
              await Promise.all(checks);
            } catch {}
          })();
        });
      } else {
        setNotifications([]);
        setUnreadCounts({});
      }
    });

    return () => {
      if (unsubAuth) unsubAuth();
      if (unsubNotif) unsubNotif();
    };
  }, []);

  const markAsRead = async (id) => {
    const user = auth.currentUser;
    if (!user) return;
    const ref = doc(db, "users", user.uid, "notifications", id);
    await updateDoc(ref, { count: 0 });
  };

  const value = { notifications, unreadCounts, markAsRead };
  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
};

NotificationsProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export const useNotifications = () => useContext(NotificationsContext);
