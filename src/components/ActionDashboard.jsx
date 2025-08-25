import { useMemo, useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useNavigate, useSearchParams } from "react-router-dom";
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

// --- helpers ---------------------------------------------------------------

/** Normalize a hypothesis confidence value no matter which field name is used. */
function confOf(h) {
  if (!h) return undefined;
  if (typeof h.confidence === "number") return h.confidence;
  if (typeof h.confidenceScore === "number") return h.confidenceScore;
  return undefined;
}

/** Try to find confidence for a task given the current hypotheses. */
function findConfidenceForTask(task, hypotheses) {
  if (!task) return undefined;

  // 1) direct id match
  const direct = hypotheses.find((h) => h.id === task.hypothesisId);
  const c1 = confOf(direct);
  if (typeof c1 === "number") return c1;

  // 2) legacy id like "hypothesis-3"
  const m = /^hypothesis-(\d+)$/.exec(task.hypothesisId || "");
  if (m) {
    const idx = Number(m[1]);
    if (!Number.isNaN(idx) && hypotheses[idx]) {
      const c2 = confOf(hypotheses[idx]);
      if (typeof c2 === "number") return c2;
    }
  }

  // 3) sometimes tasks were saved with a label instead of id
  //    try to match by statement/label/title
  const byLabel = hypotheses.find((h) => {
    const candidates = [h.statement, h.label, h.text, h.title].filter(Boolean);
    return candidates.includes(task.hypothesisId) || candidates.includes(task.hypothesisLabel);
  });
  const c3 = confOf(byLabel);
  if (typeof c3 === "number") return c3;

  // unknown
  return undefined;
}

// --------------------------------------------------------------------------

export default function ActionDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initiativeId = searchParams.get("initiativeId");
  const [user, setUser] = useState(() => auth.currentUser);
  const [tasks, setTasks] = useState([]);
  const { hypotheses = [] } = useInquiryMap() || {};

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user || !initiativeId) {
      setTasks([]);
      return;
    }
    const q = query(
      collection(db, "users", user.uid, "initiatives", initiativeId, "tasks"),
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const tasksData = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setTasks(
          tasksData.filter(
            (t) => !["done", "completed"].includes((t.status || "").toLowerCase()),
          ),
        );
      },
      (error) => {
        console.error("Error fetching tasks:", error);
        setTasks([]);
      },
    );
    return () => unsubscribe();
  }, [user, initiativeId]);

  const handleDragStart = (e, id) => {
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = async (e, newPriority) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    const user = auth.currentUser;
    if (!id || !user || !initiativeId) return;
    const taskRef = doc(
      db,
      "users",
      user.uid,
      "initiatives",
      initiativeId,
      "tasks",
      id,
    );
    try {
      await updateDoc(taskRef, { overridePriority: newPriority });
    } catch (error) {
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

  // --- Graduation check uses normalized confidence -------------------------
  const readyToGraduate = useMemo(() => {
    const highConfidenceHypotheses = hypotheses.filter(
      (h) => (confOf(h) || 0) >= 0.75,
    );
    if (highConfidenceHypotheses.length === 0) return false;

    const hasPendingCriticalTasks = highConfidenceHypotheses.some((h) =>
      tasks.some((t) => {
        if (t.hypothesisId !== h.id) return false;
        const currentPriority = getPriority(t.taskType, confOf(h) || 0);
        return ["critical", "high"].includes(currentPriority);
      }),
    );
    return !hasPendingCriticalTasks;
  }, [hypotheses, tasks]);

  const handleGraduate = () => {
    navigate("/solution-design");
  };

  // --- Grouping with robust confidence lookup ------------------------------
  const groupedTasks = useMemo(() => {
    const priorities = ["critical", "high", "medium", "low"];
    const grouped = priorities.reduce((acc, p) => ({ ...acc, [p]: [] }), {});

    tasks.forEach((task) => {
      const conf = findConfidenceForTask(task, hypotheses);

      // If we can't resolve a confidence (unlinked/legacy task), don't
      // accidentally treat it as 0% (which biases to "high" for explore).
      const autoPriority =
        conf === undefined ? "medium" : getPriority(task.taskType, conf);

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
