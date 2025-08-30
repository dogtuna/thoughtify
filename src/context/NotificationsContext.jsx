import { createContext, useContext, useEffect, useState } from "react";
import PropTypes from "prop-types";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, query, orderBy, updateDoc, doc } from "firebase/firestore";
import { auth, db } from "../firebase";

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
          const counts = data.reduce((acc, n) => {
            const c = n.count || 0;
            if (c > 0) {
              acc[n.type] = (acc[n.type] || 0) + c;
            }
            return acc;
          }, {});
          setUnreadCounts(counts);
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
