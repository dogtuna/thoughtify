import { useState } from "react";
import PropTypes from "prop-types";
import { auth, db } from "../firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { classifyTask } from "../utils/taskUtils";
import { getPriority } from "../utils/priorityMatrix";

const formatEvidenceSummary = (e) => {
  const base = (e.analysisSummary || e.text || "").replace(
    /^The new evidence\s*/i,
    ""
  );
  if (!e.source) return base;
  const intro = /interview|team|lead|manager|comment|exit/i.test(e.source)
    ? `Comments from ${e.source}`
    : `Data from ${e.source}`;
  const lower = base.charAt(0).toLowerCase() + base.slice(1);
  return `${intro} ${lower}`;
};

const HypothesisSlideOver = ({
  hypothesis,
  onClose,
  initialView = "summary",
}) => {
  const [view, setView] = useState(initialView);
  const [backView, setBackView] = useState(initialView);
  const [selectedEvidence, setSelectedEvidence] = useState(null);

  const evidenceCount =
    (hypothesis.supportingEvidence?.length || 0) +
    (hypothesis.refutingEvidence?.length || 0);
  const pct = Math.round((hypothesis.confidence || 0) * 100);
  const titleId = hypothesis.displayId || hypothesis.id;

  const supports = hypothesis.supportingEvidence || [];
  const refutes = hypothesis.refutingEvidence || [];
  const allEvidence = [
    ...supports.map((e) => ({ ...e, relation: "Supports" })),
    ...refutes.map((e) => ({ ...e, relation: "Refutes" })),
  ];
  const sorted = allEvidence.sort(
    (a, b) => Math.abs(b.delta) - Math.abs(a.delta)
  );
  const topSupport = [...supports].sort(
    (a, b) => Math.abs(b.delta) - Math.abs(a.delta)
  )[0];
  const topRefute = [...refutes].sort(
    (a, b) => Math.abs(b.delta) - Math.abs(a.delta)
  )[0];
  const hasConflict = topSupport && topRefute;

  if (view === "detail" && selectedEvidence) {
    return (
      <div className="slide-over-overlay" onClick={onClose}>
        <div
          className="slide-over-panel"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center mb-2">
            <button
              className="text-white underline mr-2"
              type="button"
              onClick={() => setView(backView)}
            >
              Back
            </button>
            <div className="flex-1" />
            <button className="text-white" type="button" onClick={onClose}>
              Close
            </button>
          </div>
          <h3 className="mb-2 text-white">
            {selectedEvidence.source || "Evidence"}
          </h3>
          <div className="text-sm whitespace-pre-wrap">
            {selectedEvidence.text}
          </div>
        </div>
      </div>
    );
  }

  if (view === "evidence") {
    return (
      <div className="slide-over-overlay" onClick={onClose}>
        <div
          className="slide-over-panel"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center mb-2">
            <button
              className="text-white underline mr-2"
              type="button"
              onClick={() => setView("summary")}
            >
              Back
            </button>
            <div className="flex-1" />
            <button className="text-white" type="button" onClick={onClose}>
              Close
            </button>
          </div>
          <h3 className="mb-2 text-white">Evidence for Hypothesis</h3>
          {hasConflict && (
            <div className="p-3 mb-4 bg-orange-100 border border-orange-300 text-sm text-gray-800">
              <div className="font-medium mb-1">Conflicting Evidence</div>
              <div className="flex gap-2 text-xs">
                <div className="flex-1">
                  <div className="font-semibold">Supports</div>
                  <div>{topSupport.analysisSummary || topSupport.text}</div>
                </div>
                <div className="flex-1">
                  <div className="font-semibold">Refutes</div>
                  <div>{topRefute.analysisSummary || topRefute.text}</div>
                </div>
              </div>
              <div className="mt-2 italic">
                Suggested question: What would explain the gap between these perspectives?
              </div>
            </div>
          )}
          <ul className="text-sm">
            {sorted.map((e, i) => (
              <li key={i} className="mb-2">
                <div className="font-medium">{formatEvidenceSummary(e)}</div>
                <div className="text-gray-200">
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      setSelectedEvidence(e);
                      setBackView("evidence");
                      setView("detail");
                    }}
                  >
                    {e.source || "Unknown"}
                  </button>{" "}• {e.timestamp ? new Date(e.timestamp).toLocaleString() : ""} • {(e.delta * 100).toFixed(1)}%
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  if (view === "conflict" && hasConflict) {
    const tasks = [
      {
        text: `Facilitate a discussion between ${topSupport.source} and ${topRefute.source} to resolve conflicting views on hypothesis ${titleId}.`,
        taskType: "validate",
      },
    ];

    const handleAddTasks = async () => {
      const user = auth.currentUser;
      if (!user) return;
      for (const t of tasks) {
        const tag = await classifyTask(t.text);
        await addDoc(collection(db, "profiles", user.uid, "taskQueue"), {
          message: t.text,
          status: "open",
          createdAt: serverTimestamp(),
          tag,
          hypothesisId: hypothesis.id,
          taskType: t.taskType || "explore",
          priority: getPriority(
            t.taskType || "explore",
            hypothesis.confidence || 0
          ),
        });
      }
      setView("summary");
    };

    return (
      <div className="slide-over-overlay" onClick={onClose}>
        <div
          className="slide-over-panel"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center mb-2">
            <button
              className="text-white underline mr-2"
              type="button"
              onClick={() => setView("summary")}
            >
              Back
            </button>
            <div className="flex-1" />
            <button className="text-white" type="button" onClick={onClose}>
              Close
            </button>
          </div>
          <h3 className="mb-2 text-white">Resolve Conflict</h3>
          <div className="text-sm mb-4">
            <div className="mb-2">
              <div className="font-semibold">Supports</div>
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setSelectedEvidence(topSupport);
                  setBackView("conflict");
                  setView("detail");
                }}
              >
                {formatEvidenceSummary(topSupport)}
              </button>
            </div>
            <div>
              <div className="font-semibold">Refutes</div>
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setSelectedEvidence(topRefute);
                  setBackView("conflict");
                  setView("detail");
                }}
              >
                {formatEvidenceSummary(topRefute)}
              </button>
            </div>
          </div>
          <div>
            <div className="font-medium mb-2">Suggested Tasks</div>
            <ul className="list-disc ml-6 text-sm mb-2">
              {tasks.map((t, i) => (
                <li key={i}>{t.text}</li>
              ))}
            </ul>
            <button
              type="button"
              className="text-white underline"
              onClick={handleAddTasks}
            >
              Add to Task Queue
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="slide-over-overlay" onClick={onClose}>
      <div
        className="slide-over-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-end mb-2">
          <button className="text-white" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="font-semibold mb-1">
          {titleId ? `Hypothesis ${titleId}: ` : ""}
          {hypothesis.statement || hypothesis.label || ""}
        </div>
        <div
          className="text-sm text-gray-200 cursor-pointer underline"
          onClick={() => setView("evidence")}
        >
          {pct}% confidence • {evidenceCount} items of evidence
        </div>
      </div>
    </div>
  );
};

HypothesisSlideOver.propTypes = {
  hypothesis: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
  initialView: PropTypes.string,
};

export default HypothesisSlideOver;

