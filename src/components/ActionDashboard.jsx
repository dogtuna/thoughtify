import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { doc, updateDoc } from "firebase/firestore";
import PropTypes from "prop-types";
import { getPriority } from "../utils/priorityMatrix";

export default function ActionDashboard({ tasks = [], hypotheses = [] }) {
  const navigate = useNavigate();

  const handleDragStart = (e, id) => {
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  // This function now only handles manual priority overrides.
  const handleDrop = async (e, newPriority) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    const user = auth.currentUser;
    if (!id || !user) return;

    // Update the task in Firestore with the new, manually set priority.
    await updateDoc(doc(db, "profiles", user.uid, "taskQueue", id), {
      priority: newPriority,
    });
  };

  const readyToGraduate = useMemo(() => {
    const highConfidenceHypotheses = hypotheses.filter(
      (h) => (h.confidence || 0) >= 0.75
    );
    if (highConfidenceHypotheses.length === 0) return false;

    // Check if any of these high-confidence hypotheses have critical/high priority tasks.
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
    // This would likely trigger a modal to confirm, then archive remaining tasks
    // and navigate to the solution design phase.
    console.log("Graduating to Solution Design!");
    navigate("/solution-design"); // Assuming you have a route for this
  };
  
  // **CRITICAL FIX: The Prioritization Logic is now inside the component.**
  // This ensures the dashboard is always up-to-date with the Inquiry Map.
  const groupedTasks = useMemo(() => {
    const priorities = ["critical", "high", "medium", "low"];
    const grouped = priorities.reduce((acc, p) => ({ ...acc, [p]: [] }), {});
    
    // Create a quick lookup map for hypothesis confidence scores.
    const confidenceMap = new Map(hypotheses.map(h => [h.id, h.confidence || 0]));

    tasks.forEach(task => {
      // If a task has a manual priority override, respect it.
      // Otherwise, calculate its priority dynamically.
      const priority = task.priority || getPriority(task.taskType, confidenceMap.get(task.hypothesisId));
      if (grouped[priority]) {
        grouped[priority].push(task);
      } else {
        grouped.low.push(task); // Default to low if priority is invalid
      }
    });

    return grouped;
  }, [tasks, hypotheses]);


  return (
    <div className="flex flex-col gap-4">
      {readyToGraduate && (
        <div className="p-4 mb-4 text-center bg-green-100 border border-green-400 text-green-700 rounded-lg">
          <p className="font-bold">Analysis Complete!</p>
          <p className="text-sm">You have high confidence in one or more hypotheses and no remaining critical tasks. You are ready to move to the next phase.</p>
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
                            `/inquiry-map?initiativeId=${t.project || "General"}&hypothesisId=${t.hypothesisId}`
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

ActionDashboard.propTypes = {
  tasks: PropTypes.arrayOf(PropTypes.object),
  hypotheses: PropTypes.arrayOf(PropTypes.object),
};