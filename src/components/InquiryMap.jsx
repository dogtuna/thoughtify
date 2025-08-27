import { useState } from "react";
import PropTypes from "prop-types";
import HypothesisSlideOver from "./HypothesisSlideOver";

const InquiryMap = ({ hypotheses = [] }) => {
  const [selected, setSelected] = useState(null);
  const [conflict, setConflict] = useState(null);

  const sorted = [...hypotheses].sort((a, b) => b.confidence - a.confidence);

  const handleRowClick = (h, letter) => {
    setSelected({ ...h, displayId: letter });
  };

  const handleConflictClick = (e, h, letter) => {
    e.stopPropagation();
    setConflict({ ...h, displayId: letter });
  };

  return (
    <div className="max-w-3xl mx-auto">
      <ul className="divide-y divide-gray-200">
        {sorted.map((h, idx) => {
          const letter = String.fromCharCode(65 + idx);
          const pct = Math.round((h.confidence || 0) * 100);
          const trend = h.trend || 0;
          const up = trend > 0;
          const down = trend < 0;
          const supports = h.supportingEvidence?.length || 0;
          const refutes = h.refutingEvidence?.length || 0;
          return (
            <li
              key={h.id}
              className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
              onClick={() => handleRowClick(h, letter)}
            >
              <div className="flex-1">
                <div className="font-semibold">Hypothesis {letter}</div>
                <div className="text-sm text-gray-600">
                  {h.statement || h.label || ""}
                </div>
              </div>
              <div className="flex items-center gap-4">
                {up && <span className="text-green-600">▲</span>}
                {down && <span className="text-red-600">▼</span>}
                {!up && !down && <span className="text-gray-400">▶</span>}
                <span className="w-12 text-right">{pct}%</span>
                <span className="text-green-600">{supports}</span>
                <span className="text-red-600">{refutes}</span>
                {h.contested && (
                  <button
                    type="button"
                    className="text-orange-600"
                    title="Resolve conflict"
                    onClick={(e) => handleConflictClick(e, h, letter)}
                  >
                    !
                  </button>
                )}
              </div>
            </li>
          );
        })}
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
  );
};

InquiryMap.propTypes = {
  hypotheses: PropTypes.array,
};

export default InquiryMap;

