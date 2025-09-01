import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import HypothesisSlideOver from "./HypothesisSlideOver.jsx";
import "./AIToolsGenerators.css";

const ProjectOverview = ({
  uid,
  initiativeId,
  stage = "",
  tasks = [],
  questions = [],
  hypotheses = [],
  documents = [],
}) => {
  const [statusUpdates, setStatusUpdates] = useState([]);
  const [audience, setAudience] = useState("client");
  const [selected, setSelected] = useState(null);
  const [conflict, setConflict] = useState(null);

  useEffect(() => {
    if (!uid || !initiativeId) return;
    const load = async () => {
      try {
        const colRef = collection(
          db,
          "users",
          uid,
          "initiatives",
          initiativeId,
          "statusUpdates"
        );
        const q = query(colRef, orderBy("date", "desc"));
        const snap = await getDocs(q);
        setStatusUpdates(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("load status updates", err);
      }
    };
    load();
  }, [uid, initiativeId]);

  const displayedUpdates = useMemo(
    () =>
      statusUpdates
        .filter((u) => u.audience === audience)
        .slice(0, 3),
    [statusUpdates, audience]
  );

  const topHypotheses = useMemo(() => {
    return [...hypotheses]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3)
      .map((h, idx) => ({ ...h, displayId: String.fromCharCode(65 + idx) }));
  }, [hypotheses]);

  const openTasks = useMemo(
    () => tasks.filter((t) => t.status !== "done").length,
    [tasks]
  );
  const openQuestions = useMemo(
    () => questions.filter((q) => q.status !== "answered").length,
    [questions]
  );

  const activities = useMemo(() => {
    const arr = [];
    documents.forEach((d) => {
      if (d?.name) arr.push({ text: `Document uploaded: ${d.name}`, date: d.date });
    });
    questions.forEach((q) => {
      const t = q.answeredAt || q.createdAt;
      arr.push({
        text: `${q.status === "answered" ? "Answered" : "Asked"} question: ${q.question}`,
        date: t,
      });
    });
    tasks.forEach((t) => {
      arr.push({ text: `Task ${t.status}: ${t.title}`, date: t.createdAt });
    });
    statusUpdates.forEach((s) => {
      arr.push({ text: `Status update (${s.audience})`, date: s.date });
    });
    hypotheses.forEach((h) => {
      arr.push({ text: `Hypothesis added: ${h.statement || h.hypothesis || h.label}`, date: h.createdAt });
    });
    return arr
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      .slice(0, 20);
  }, [documents, questions, tasks, statusUpdates, hypotheses]);

  const handleRowClick = (h) => setSelected(h);
  const handleConflictClick = (e, h) => {
    e.stopPropagation();
    setConflict(h);
  };

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <div className="flex flex-col gap-6 md:w-2/3">
        <div className="counter-row">
          <div className="initiative-card counter-card">
            <div className="text-sm opacity-80">Stage</div>
            <div className="text-3xl font-bold">{stage || "Unknown"}</div>
          </div>
          <div className="initiative-card counter-card">
            <div className="text-sm opacity-80">Open Tasks</div>
            <div className="text-3xl font-bold">{openTasks}</div>
          </div>
          <div className="initiative-card counter-card">
            <div className="text-sm opacity-80">Open Questions</div>
            <div className="text-3xl font-bold">{openQuestions}</div>
          </div>
        </div>

        <div className="initiative-card">
          <h3 className="mb-4 font-semibold">Working Hypotheses</h3>
          <ul className="space-y-4">
            {topHypotheses.map((h) => {
              const pct = Math.round((h.confidence || 0) * 100);
              const supports = h.evidence?.supporting?.length || h.supportingEvidence?.length || 0;
              const refutes = h.evidence?.refuting?.length || h.refutingEvidence?.length || 0;
              return (
                <li
                  key={h.id}
                  className="cursor-pointer transition-opacity hover:opacity-90"
                  onClick={() => handleRowClick(h)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-semibold">Hypothesis {h.displayId}</div>
                  </div>
                  <div className="text-white mb-2">
                    {h.statement || h.hypothesis || h.label || ""}
                  </div>
                  <div className="flex items-center justify-end gap-4">
                    {h.trend > 0 && <span className="text-green-600">▲</span>}
                    {h.trend < 0 && <span className="text-red-600">▼</span>}
                    {h.contested && (
                      <button
                        type="button"
                        className="text-orange-400"
                        style={{ padding: "0.1em 1.2em" }}
                        title="Resolve conflict"
                        onClick={(e) => handleConflictClick(e, h)}
                      >
                        !
                      </button>
                    )}
                    Confidence: <span className="w-12 text-right">{pct}%</span>
                    Supporting: <span className="text-green-600">{supports}</span>
                    Refuting: <span className="text-red-600">{refutes}</span>
                  </div>
                </li>
              );
            })}
            {!topHypotheses.length && (
              <li className="text-sm opacity-70">No hypotheses yet.</li>
            )}
          </ul>
          {selected && (
            <HypothesisSlideOver
              hypothesis={selected}
              onClose={() => setSelected(null)}
            />
          )}
          {conflict && (
            <HypothesisSlideOver
              hypothesis={conflict}
              initialView="conflict"
              onClose={() => setConflict(null)}
            />
          )}
        </div>

        <div className="initiative-card">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Status Updates</h3>
            <div className="flex gap-2 text-sm">
              <button
                type="button"
                className={audience === "client" ? "font-bold" : "opacity-70"}
                onClick={() => setAudience("client")}
              >
                Client-facing
              </button>
              <button
                type="button"
                className={audience === "internal" ? "font-bold" : "opacity-70"}
                onClick={() => setAudience("internal")}
              >
                Internal
              </button>
            </div>
          </div>
          <ul className="space-y-2">
            {displayedUpdates.map((u) => (
              <li key={u.id} className="text-sm">
                {u.summary}
              </li>
            ))}
            {!displayedUpdates.length && (
              <li className="text-sm opacity-70">No updates yet.</li>
            )}
          </ul>
        </div>
      </div>

      <div className="md:w-1/3 flex flex-col">
        <div className="initiative-card flex-1 overflow-y-auto">
          <h3 className="mb-4 font-semibold">Recent Activity</h3>
          <ul className="space-y-2">
            {activities.map((a, idx) => (
              <li key={idx} className="text-sm">
                {a.text}
              </li>
            ))}
            {!activities.length && (
              <li className="text-sm opacity-70">No recent activity.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
};

ProjectOverview.propTypes = {
  uid: PropTypes.string,
  initiativeId: PropTypes.string,
  stage: PropTypes.string,
  tasks: PropTypes.array,
  questions: PropTypes.array,
  hypotheses: PropTypes.array,
  documents: PropTypes.array,
};

export default ProjectOverview;

