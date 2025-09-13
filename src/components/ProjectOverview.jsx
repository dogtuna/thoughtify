import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  contacts = [],
}) => {
  const navigate = useNavigate();
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

  const displayedUpdates = useMemo(() => statusUpdates.filter((u) => u.audience === audience).slice(0, 3), [statusUpdates, audience]);

  const topHypotheses = useMemo(() => {
    return [...hypotheses]
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .slice(0, 3);
  }, [hypotheses]);

  const openTasks = useMemo(() => tasks.filter((t) => (t.status || "open") !== "done" && (t.status || "open") !== "completed").length, [tasks]);
  const openQuestions = useMemo(() => questions.filter((q) => (q.status || "toask") !== "answered").length, [questions]);
  const topHyp = useMemo(() => {
    if (!hypotheses.length) return null;
    const h = [...hypotheses].sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
    return { label: h.displayId || (typeof h.id === 'string' ? h.id : ''), pct: Math.round((h.confidence || 0) * 100) };
  }, [hypotheses]);
  const lastUpdatedText = useMemo(() => {
    const allDates = [];
    statusUpdates.forEach((s) => s.date && allDates.push(new Date(s.date).getTime()));
    const latest = allDates.length ? Math.max(...allDates) : null;
    if (!latest) return "Unknown";
    const diffDays = Math.floor((Date.now() - latest) / (24 * 60 * 60 * 1000));
    if (diffDays <= 0) return "Today";
    if (diffDays === 1) return "1d ago";
    return `${diffDays}d ago`;
  }, [statusUpdates]);

  const activities = useMemo(() => {
    const arr = [];
    documents.forEach((d) => {
      if (d?.name) arr.push({ text: `Document uploaded: ${d.name}`, date: d.date, link: { path: "/discovery", params: { section: "documents" } } });
    });
    questions.forEach((q) => {
      const t = q.answeredAt || q.createdAt;
      arr.push({ text: `${q.status === "answered" ? "Answered" : "Asked"} question: ${q.question}`, date: t, link: { path: "/discovery", params: { section: "questions" } } });
    });
    tasks.forEach((t) => {
      arr.push({ text: `Task ${t.status || 'open'}: ${t.message || t.title || ''}`, date: t.createdAt, link: { path: "/discovery", params: { section: "tasks" } } });
    });
    statusUpdates.forEach((s) => {
      arr.push({ text: `Status update (${s.audience})`, date: s.date, link: { path: "/project-status" } });
    });
    hypotheses.forEach((h) => {
      arr.push({ text: `Hypothesis added: ${h.statement || h.hypothesis || h.label}`, date: h.createdAt, link: { path: "/inquiry-map" } });
    });
    return arr.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, 4);
  }, [documents, questions, tasks, statusUpdates, hypotheses]);

  const handleRowClick = (h) => setSelected(h);
  const handleConflictClick = (e, h) => {
    e.stopPropagation();
    setConflict(h);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Row 1: Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="initiative-card counter-card">
          <div className="text-sm opacity-80">Open Tasks</div>
          <div className="text-3xl font-bold">{openTasks}</div>
        </div>
        <div className="initiative-card counter-card">
          <div className="text-sm opacity-80">Open Questions</div>
          <div className="text-3xl font-bold">{openQuestions}</div>
        </div>
        <div className="initiative-card counter-card">
          <div className="text-sm opacity-80">Top Hypothesis Confidence</div>
          <div className="text-3xl font-bold">{topHyp ? `${topHyp.label}: ${topHyp.pct}%` : "—"}</div>
        </div>
        <div className="initiative-card counter-card">
          <div className="text-sm opacity-80">Last Updated</div>
          <div className="text-3xl font-bold">{lastUpdatedText}</div>
        </div>
      </div>

      {/* Row 2: Working Hypotheses */}
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

      {/* Row 3: Recent Activity */}
      <div className="initiative-card">
        <h3 className="mb-4 font-semibold">Recent Activity</h3>
        <ul className="space-y-2">
          {activities.map((a, idx) => (
            <li
              key={idx}
              className="text-sm underline cursor-pointer"
              onClick={() => a.link && navigate({ pathname: a.link.path, search: a.link.params ? `?${new URLSearchParams({ ...a.link.params, initiativeId }).toString()}` : `?${new URLSearchParams({ initiativeId }).toString()}` })}
            >
              {a.text}
            </li>
          ))}
          {!activities.length && (
            <li className="text-sm opacity-70">No recent activity.</li>
          )}
        </ul>
      </div>

      {/* Row 4: Stakeholder Map + Key Documents */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="initiative-card">
          <h3 className="mb-2 font-semibold">Stakeholder Map</h3>
          {(() => {
            const byScope = (contacts || []).reduce((acc, c) => {
              const key = (c.scope || 'internal').toLowerCase();
              acc[key] = acc[key] || [];
              acc[key].push(c);
              return acc;
            }, {});
            const scopes = Object.keys(byScope);
            if (scopes.length > 1) {
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="font-medium mb-1">Internal</div>
                    <ul className="space-y-1">
                      {(byScope.internal || []).map((c) => (
                        <li key={c.id || c.name}>{c.name} {c.jobTitle ? `— ${c.jobTitle}` : ''}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="font-medium mb-1">External</div>
                    <ul className="space-y-1">
                      {(byScope.external || []).map((c) => (
                        <li key={c.id || c.name}>{c.name} {c.jobTitle ? `— ${c.jobTitle}` : ''}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            }
            return (
              <ul className="space-y-1 text-sm">
                {(contacts || []).map((c) => (
                  <li key={c.id || c.name}>{c.name} {c.jobTitle ? `— ${c.jobTitle}` : ''}</li>
                ))}
              </ul>
            );
          })()}
        </div>
        <div className="initiative-card">
          <h3 className="mb-2 font-semibold">Key Documents</h3>
          {(documents || []).length ? (
            <ul className="space-y-1 text-sm">
              {documents.map((d, i) => (
                <li
                  key={i}
                  className="underline cursor-pointer"
                  onClick={() => navigate({ pathname: "/discovery", search: `?${new URLSearchParams({ initiativeId, section: 'documents' }).toString()}` })}
                >
                  {d.name}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm opacity-70">No documents</div>
          )}
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
  contacts: PropTypes.array,
};

export default ProjectOverview;
