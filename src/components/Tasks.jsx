import { useEffect, useState, useMemo } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import TaskQueue from "./TaskQueue";
import TaskSidebar from "./TaskSidebar";
import "../pages/admin.css";

const Tasks = () => {
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const tasksRef = collection(db, "profiles", user.uid, "taskQueue");
    const unsubTasks = onSnapshot(tasksRef, (snap) => {
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

  const updateStatus = async (task, status, extra = {}) => {
    if (!user) return;
    await updateDoc(doc(db, "profiles", user.uid, "taskQueue", task.id), {
      status,
      statusChangedAt: serverTimestamp(),
      ...extra,
    });
  };

  const handleComplete = async (task) => {
    await updateStatus(task, "completed");
  };

  const handleReplyTask = async (task, replyText) => {
    await updateStatus(task, "open", { reply: replyText });
  };

  const handleSchedule = async (task) => {
    await updateStatus(task, "scheduled");
  };

  const handleSynergize = async (bundle, message) => {
    if (!user || !bundle.length) return;
    const [first, ...rest] = bundle;
    await updateDoc(doc(db, "profiles", user.uid, "taskQueue", first.id), {
      message,
    });
    for (const t of rest) {
      await deleteDoc(doc(db, "profiles", user.uid, "taskQueue", t.id));
    }
  };

  const handleDelete = async (id) => {
    if (!user) return;
    await deleteDoc(doc(db, "profiles", user.uid, "taskQueue", id));
  };

  const filteredTasks = useMemo(
    () =>
      tasks.filter(
        (t) => statusFilter === "all" || t.status === statusFilter
      ),
    [tasks, statusFilter]
  );

  return (
    <div className="tasks-view">
      <TaskSidebar statusFilter={statusFilter} onChange={setStatusFilter} />
      <div className="tasks-main">
        <TaskQueue
          tasks={filteredTasks}
          inquiries={inquiries}
          onComplete={handleComplete}
          onSchedule={handleSchedule}
          onReplyTask={handleReplyTask}
          onDelete={handleDelete}
          onSynergize={handleSynergize}
        />
      </div>
    </div>
  );
};

export default Tasks;
