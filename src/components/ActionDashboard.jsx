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

  const handleDrop = async (e, priority) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    const task = tasks.find((t) => t.id === id);
    const user = auth.currentUser;
    if (!task || !user) return;
    const conf = task.hypothesisId
      ? hypotheses.find((h) => h.id === task.hypothesisId)?.confidence || 0
      : 0;
    const newPriority = priority || getPriority(task.taskType ?? "explore", conf);
    await updateDoc(doc(db, "profiles", user.uid, "taskQueue", id), {
      priority: newPriority,
      taskType: task.taskType ?? "explore",
      hypothesisId: task.hypothesisId ?? null,
    });
  };

  const readyToGraduate = useMemo(() => {
    const highConfidence = hypotheses.filter(
      (h) => (h.confidence || 0) >= 0.75
    );
    if (highConfidence.length === 0) return false;
    const hasPending = highConfidence.some((h) =>
      tasks.some(
        (t) =>
          t.hypothesisId === h.id &&
          ["critical", "high"].includes(t.priority || "low")
      )
    );
    return !hasPending;
  }, [hypotheses, tasks]);

  const handleGraduate = () => {
    navigate("/solution-design");
  };

  const priorities = ["critical", "high", "medium", "low"];
  const grouped = priorities.reduce((acc, p) => {
    acc[p] = tasks.filter((t) => (t.priority || "low") === p);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4">
      {readyToGraduate && (
        <div className="text-center">
          <button
            className="rounded bg-blue-500 px-4 py-2 font-semibold text-white"
            onClick={handleGraduate}
          >
            Graduate to Solution Design
          </button>
        </div>
      )}
      <div className="flex gap-4">
        {priorities.map((p) => (
          <div
            key={p}
            className="flex-1"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, p)}
          >
            <h3 className="mb-2 text-center font-semibold capitalize">{p}</h3>
            <div className="flex min-h-[100px] flex-col gap-2">
              {grouped[p].map((t) => (
                <div
                  key={t.id}
                  className="initiative-card task-card p-2"
                  draggable
                  onDragStart={(e) => handleDragStart(e, t.id)}
                >
                  <div className="text-sm font-medium">{t.message}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {t.hypothesisId && (
                      <span
                        className="tag-badge tag-hypothesis cursor-pointer"
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
