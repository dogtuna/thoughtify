import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, updateDoc, collection, query, onSnapshot } from "firebase/firestore";
import PropTypes from "prop-types";
import { getPriority } from "../utils/priorityMatrix";
import { useInquiryMap } from "../contexts/InquiryMapContext"; // Assuming context is in this path

export default function ActionDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  
  // Get hypotheses directly from the context
  const { hypotheses } = useInquiryMap();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  // **CRITICAL FIX #1: Use a real-time listener for tasks.**
  // This ensures the component's state is always synchronized with Firestore,
  // preventing the "No document to update" error.
  useEffect(() => {
    if (!user) {
      setTasks([]);
      return;
    }
    const q = query(collection(db, "profiles", user.uid, "taskQueue"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tasksData = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTasks(tasksData.filter(t => t.status !== 'done')); // Only show non-done tasks
    });
    // Cleanup the listener when the component unmounts
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
    try {
      // Update the task in Firestore with the new, manually set priority.
      const taskRef = doc(db, "profiles", user.uid, "taskQueue", id);
      await updateDoc(taskRef, { priority: newPriority });
    } catch (error) {
      console.error("Error updating task priority:", error);
    }
  };

  const readyToGraduate = useMemo(() => {
    const highConfidenceHypotheses = hypotheses.filter(
      (h) => (h.confidence || 0) >= 0.75
    );
    if (highConfidenceHypotheses.length === 0) return false;

    const hasPendingCriticalTasks = highConfidenceHypotheses.some((h) =>
      tasks.some((t) => {
        if (t.hypothesisId !== h.id) return false;
        const currentPriority = getPriority(t.taskType, h.confidence);
        return ["critical", "high"].includes(currentPriority);
      })
    );
    return !hasPendingCriticalTasks;
  }, [hypotheses, tasks]);

  const handleGraduate = () => {
    console.log("Graduating to Solution Design!");
    navigate("/solution-design");
  };

  const groupedTasks = useMemo(() => {
    const priorities = ["critical", "high", "medium", "low"];
    const grouped = priorities.reduce((acc, p) => ({ ...acc, [p]: [] }), {});
    const confidenceMap = new Map(hypotheses.map(h => [h.id, h.confidence || 0]));

    tasks.forEach(task => {
      // **CRITICAL FIX #2: Always calculate priority.**
      // We ignore the `task.priority` field from the DB unless it's a manual override.
      // For this implementation, we will always calculate it dynamically.
      const priority = getPriority(task.taskType, confidenceMap.get(task.hypothesisId));
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
          <p className="text-sm">You have high confidence in one or more hypotheses and no remaining critical tasks.</p>
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
            className="flex-1 bg-gray-100 rounded-lg p-2"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, priority)}
          >
            <h3 className="mb-2 text-center font-semibold capitalize">{priority}</h3>
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
                            `/inquiry-map?initiativeId=${t.initiativeId || "General"}&hypothesisId=${t.hypothesisId}`
                          )
                        }
                      >
                        {t.hypothesisId}
                      </span>
                    )}
                    {t.taskType && (
                      <span className={`tag-badge tag-${t.taskType}`}>{t.taskType}</span>
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

// **CRITICAL FIX #3: Removed props that are now consumed from context**
ActionDashboard.propTypes = {
  // tasks: PropTypes.arrayOf(PropTypes.object), // No longer needed
  // hypotheses: PropTypes.arrayOf(PropTypes.object), // No longer needed
};

ActionDashboard.propTypes = {
  tasks: PropTypes.arrayOf(PropTypes.object),
  hypotheses: PropTypes.arrayOf(PropTypes.object),
};