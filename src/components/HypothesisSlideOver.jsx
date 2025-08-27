import { useState } from "react";
import PropTypes from "prop-types";

const HypothesisSlideOver = ({ hypothesis, onClose }) => {
  const [showEvidence, setShowEvidence] = useState(false);

  const evidenceCount =
    (hypothesis.supportingEvidence?.length || 0) +
    (hypothesis.refutingEvidence?.length || 0);
  const pct = Math.round((hypothesis.confidence || 0) * 100);
  const titleId = hypothesis.displayId || hypothesis.id;

  if (showEvidence) {
    const allEvidence = [
      ...(hypothesis.supportingEvidence || []).map((e) => ({ ...e, relation: "Supports" })),
      ...(hypothesis.refutingEvidence || []).map((e) => ({ ...e, relation: "Refutes" })),
    ];
    const sorted = allEvidence.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    let conflictBanner = null;
    if (
      (hypothesis.supportingEvidence?.length || 0) > 0 &&
      (hypothesis.refutingEvidence?.length || 0) > 0
    ) {
      const topSupport = [...(hypothesis.supportingEvidence || [])].sort(
        (a, b) => Math.abs(b.delta) - Math.abs(a.delta)
      )[0];
      const topRefute = [...(hypothesis.refutingEvidence || [])].sort(
        (a, b) => Math.abs(b.delta) - Math.abs(a.delta)
      )[0];
      conflictBanner = (
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
      );
    }

    return (
      <div className="slide-over-overlay" onClick={onClose}>
        <div className="slide-over-panel" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center mb-2">
            <button
              className="text-white underline mr-2"
              type="button"
              onClick={() => setShowEvidence(false)}
            >
              Back
            </button>
            <div className="flex-1" />
            <button className="text-white" type="button" onClick={onClose}>
              Close
            </button>
          </div>
          <h3 className="mb-2 text-white">Evidence for Hypothesis</h3>
          {conflictBanner}
          <ul className="text-sm max-h-[60vh] overflow-y-auto">
            {sorted.map((e, i) => (
              <li key={i} className="mb-2">
                <div className="font-medium">{e.analysisSummary || e.text}</div>
                <div className="text-gray-200">
                  {e.source || "Unknown"} • {" "}
                  {e.timestamp ? new Date(e.timestamp).toLocaleString() : ""} • {" "}
                  {(e.delta * 100).toFixed(1)}%
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="slide-over-overlay" onClick={onClose}>
      <div className="slide-over-panel" onClick={(e) => e.stopPropagation()}>
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
          onClick={() => setShowEvidence(true)}
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
};

export default HypothesisSlideOver;
