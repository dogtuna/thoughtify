import PropTypes from "prop-types";

const EvidenceSlideOver = ({ hypothesis, onClose }) => {
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
      <div className="p-3 mb-4 bg-orange-100 border border-orange-300 text-sm">
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
        <h3 className="mb-2">Evidence for Hypothesis</h3>
        {conflictBanner}
        <ul className="text-sm max-h-[60vh] overflow-y-auto">
          {sorted.map((e, i) => (
            <li key={i} className="mb-2">
              <div className="font-medium">
                {e.analysisSummary || e.text}
              </div>
              <div className="text-gray-600">
                {e.source || "Unknown"} •
                {" "}
                {e.timestamp ? new Date(e.timestamp).toLocaleString() : ""} •
                {" "}
                {(e.delta * 100).toFixed(1)}%
              </div>
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button className="generator-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

EvidenceSlideOver.propTypes = {
  hypothesis: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default EvidenceSlideOver;
