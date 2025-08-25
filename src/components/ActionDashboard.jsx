import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebase";
import {
  doc,
  updateDoc,
  setDoc,
  collection,
  query,
  onSnapshot,
} from "firebase/firestore";
import { getPriority } from "../utils/priorityMatrix";
import { useInquiryMap } from "../context/InquiryMapContext";

// Renders an action dashboard with tasks grouped by priority.
// Priority defaults to a dynamic calculation using the Inquiry Map's
// hypothesis confidence scores. Users can manually override a task's
// priority via drag and drop, which is persisted to Firestore under
// the `overridePriority` field.
export default function ActionDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  // Gracefully handle missing InquiryMap context
  const { hypotheses = [] } = useInquiryMap() || {};

  // Track authentication state so we can read/write the user's task queue.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  // Listen in real time for task changes.
  useEffect(() => {
    if (!user) {
      setTasks([]);
      return;
    }
    const q = query(collection(db, "profiles", user.uid, "taskQueue"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tasksData = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Only show tasks that are not completed.
      setTasks(
        tasksData.filter((t) => t.status !== "done" && t.status !== "completed")
      );
    });
    return () => unsubscribe();
  }, [user]);

  const handleDragStart = (e, id) => {
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = async (e, newPriority) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id || !user) return;
    const taskRef = doc(db, "profiles", user.uid, "taskQueue", id);
    try {
      await updateDoc(taskRef, { overridePriority: newPriority });
    } catch (error) {
      // Fall back to setDoc in case the task doesn't exist yet.
      if (error.code === "not-found") {
        try {
          await setDoc(taskRef, { overridePriority: newPriority }, { merge: true });
        } catch (err) {
          console.error("Error creating task for priority override:", err);
        }
      } else {
        console.error("Error updating task priority:", error);
      }
    }
  };

  // Determine if the project can graduate to Solution Design.
  const readyToGraduate = useMemo(() => {
    const highConfidenceHypotheses = hypotheses.filter(
      (h) => (h.confidence || 0) >= 0.75,
    );
    if (highConfidenceHypotheses.length === 0) return false;

    const hasPendingCriticalTasks = highConfidenceHypotheses.some((h) =>
      tasks.some((t) => {
        if (t.hypothesisId !== h.id) return false;
        const currentPriority = getPriority(t.taskType, h.confidence);
        return ["critical", "high"].includes(currentPriority);
      }),
    );
    return !hasPendingCriticalTasks;
  }, [hypotheses, tasks]);

  const handleGraduate = () => {
    navigate("/solution-design");
  };

  // Group tasks by priority, using overridePriority if present.
  const groupedTasks = useMemo(() => {
    const priorities = ["critical", "high", "medium", "low"];
    const grouped = priorities.reduce((acc, p) => ({ ...acc, [p]: [] }), {});
    const confidenceMap = new Map(
      hypotheses.map((h) => [h.id, h.confidence || 0]),
    );

    tasks.forEach((task) => {
      const autoPriority = getPriority(
        task.taskType,
        confidenceMap.get(task.hypothesisId) || 0,
      );
      const priority = task.overridePriority || autoPriority;
      if (grouped[priority]) {
        grouped[priority].push(task);
      } else {
        grouped.low.push(task);
      }
    });

    return grouped;
  }, [tasks, hypotheses]);

  return (
    <div className="flex flex-col gap-4">
      {readyToGraduate && (
        <div className="p-4 mb-4 text-center bg-green-100 border border-green-400 text-green-700 rounded-lg">
          <p className="font-bold">Analysis Complete!</p>
          <p className="text-sm">
            You have high confidence in one or more hypotheses and no remaining
            critical tasks.
          </p>
          <button
            className="mt-2 rounded bg-green-600 px-4 py-2 font-semibold text-white shadow-md hover:bg-green-700"
            onClick={handleGraduate}
          >
            Graduate to Solution Design
          </button>
        </div>
      )}
      <div className="flex gap-4">
        {Object.keys(groupedTasks).map((priority) => (
          <div
            key={priority}
            className="flex-1 rounded-lg p-2"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, priority)}
          >
            <h3 className="mb-2 text-center font-semibold capitalize">
              {priority}
            </h3>
            <div className="flex min-h-[200px] flex-col gap-2">
              {groupedTasks[priority].map((t) => (
                <div
                  key={t.id}
                  className="initiative-card task-card p-2 cursor-grab active:cursor-grabbing"
                  draggable
                  onDragStart={(e) => handleDragStart(e, t.id)}
                >
                  <div className="text-sm font-medium">{t.message}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {t.hypothesisId && (
                      <span
                        className="tag-badge tag-hypothesis cursor-pointer"
                        title={`Linked to Hypothesis ${t.hypothesisId}`}
                        onClick={() =>
                          navigate(
                            `/inquiry-map?initiativeId=${
                              t.initiativeId || "General"
                            }&hypothesisId=${t.hypothesisId}`,
                          )
                        }
                      >
                        {t.hypothesisId}
                      </span>
                    )}
                    {t.taskType && (
                      <span className={`tag-badge tag-${t.taskType}`}>
                        {t.taskType}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

