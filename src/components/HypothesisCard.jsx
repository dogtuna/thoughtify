import { useState } from "react";
import PropTypes from "prop-types";
import EvidenceSlideOver from "./EvidenceSlideOver";

const HypothesisCard = ({ hypothesis }) => {
  const [open, setOpen] = useState(false);
  const evidenceCount =
    (hypothesis.supportingEvidence?.length || 0) +
    (hypothesis.refutingEvidence?.length || 0);
  const pct = Math.round((hypothesis.confidence || 0) * 100);
  const titleId = hypothesis.displayId || hypothesis.id;

  return (
    <div className="cursor-pointer" onClick={() => setOpen(true)}>
      <div className="font-semibold mb-1">
        {titleId ? `Hypothesis ${titleId}: ` : ""}
        {hypothesis.statement || hypothesis.label || ""}
      </div>
      <div className="text-sm text-gray-600">
        {pct}% confidence • {evidenceCount} items of evidence
      </div>
      {open && (
        <EvidenceSlideOver hypothesis={hypothesis} onClose={() => setOpen(false)} />
      )}
    </div>
  );
};

HypothesisCard.propTypes = {
  hypothesis: PropTypes.object.isRequired,
};

export default HypothesisCard;
