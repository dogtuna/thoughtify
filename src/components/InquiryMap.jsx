import { useState, useMemo } from "react";
import PropTypes from "prop-types";
import HypothesisSlideOver from "./HypothesisSlideOver";
import "./AIToolsGenerators.css";

const InquiryMap = ({ hypotheses = [] }) => {
  const [selected, setSelected] = useState(null);
  const [conflict, setConflict] = useState(null);

  const idToLetter = useMemo(() => {
    const map = {};
    hypotheses.forEach((h) => {
      if (!h || !h.id) return;
      const raw = typeof h.id === 'string' ? h.id.toUpperCase() : null;
      map[h.id] = h.displayId || (raw && /^[A-Z]{1,3}$/.test(raw) ? raw : null);
    });
    return map;
  }, [hypotheses]);

  const sorted = [...hypotheses].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  // Fallback: if any item lacks a displayId and its id isn't a simple letter, provide a temporary index label
  const tempIndexLabel = (i) => {
    let idx = i, label = "";
    while (idx >= 0) { label = String.fromCharCode(65 + (idx % 26)) + label; idx = Math.floor(idx / 26) - 1; }
    return label;
  };

  const handleRowClick = (h) => {
    setSelected({ ...h, displayId: idToLetter[h.id] });
  };

  const handleConflictClick = (e, h) => {
    e.stopPropagation();
    setConflict({ ...h, displayId: idToLetter[h.id] });
  };

  return (
    <div className="mx-auto w-[90%]">
      <ul className="space-y-4">
        {sorted.map((h) => {
          const letter = idToLetter[h.id] || (typeof h.id === 'string' ? h.id : "?");
          const pct = Math.round((h.confidence || 0) * 100);
          const trend = h.trend || 0;
          const up = trend > 0;
          const down = trend < 0;
          const supports = h.evidence?.supporting?.length || h.supportingEvidence?.length || 0;
          const refutes = h.evidence?.refuting?.length || h.refutingEvidence?.length || 0;
          return (
            <li
              key={h.id}
              className="initiative-card cursor-pointer transition-opacity hover:opacity-90"
              onClick={() => handleRowClick(h)}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="font-semibold">Hypothesis {letter}</div>
                
              </div>
              <div className="text-white mb-2">
                {h.statement || h.hypothesis || h.label || ""}
              </div>
              <div className="flex items-center justify-end gap-4">
                {up && <span className="text-green-600">▲</span>}
                {down && <span className="text-red-600">▼</span>}
                {h.contested && (
                  <button
                    type="button"
                    className="text-orange-400"
                    style={{ padding: '0.1em 1.2em' }}
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
