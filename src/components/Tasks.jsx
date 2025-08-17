import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, query, where, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { auth, db } from "../firebase";
import TaskQueue from "./TaskQueue";
import "../pages/admin.css";

const Tasks = () => {
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [inquiries, setInquiries] = useState([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const tasksRef = collection(db, "profiles", user.uid, "taskQueue");
    const q = query(tasksRef, where("status", "!=", "completed"));
    const unsubTasks = onSnapshot(q, (snap) => {
      setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const inquiriesRef = collection(db, "profiles", user.uid, "inquiries");
    const unsubInquiries = onSnapshot(inquiriesRef, (snap) => {
      setInquiries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => {
      unsubTasks();
      unsubInquiries();
    };
  }, [user]);

  const handleComplete = async (task) => {
    if (!user) return;
    await updateDoc(doc(db, "profiles", user.uid, "taskQueue", task.id), {
      status: "completed",
    });
  };

  const handleReplyTask = async (task, replyText) => {
    if (!user) return;
    await updateDoc(doc(db, "profiles", user.uid, "taskQueue", task.id), {
      reply: replyText,
      status: "open",
    });
  };

  const handleDelete = async (id) => {
    if (!user) return;
    await deleteDoc(doc(db, "profiles", user.uid, "taskQueue", id));
  };

  return (
    <TaskQueue
      tasks={tasks}
      inquiries={inquiries}
      onComplete={handleComplete}
      onReplyTask={handleReplyTask}
      onDelete={handleDelete}
    />
  );
};

export default Tasks;
