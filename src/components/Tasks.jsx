import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase";
import TaskQueue from "./TaskQueue";
import TaskSidebar from "./TaskSidebar";
import "../pages/admin.css";
import useCanonical from "../utils/useCanonical";
import { canonicalTaskUrl } from "../utils/canonical";

const Tasks = () => {
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");

  useCanonical(tasks[0]?.id ? canonicalTaskUrl(tasks[0].id) : window.location.href);

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

  return (
    <div className="tasks-view">
      <TaskSidebar statusFilter={statusFilter} onChange={setStatusFilter} />
      <TaskQueue
        tasks={tasks}
        inquiries={inquiries}
        statusFilter={statusFilter}
      />
    </div>
  );
};

export default Tasks;
