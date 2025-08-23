import { useEffect, useMemo, useState } from "react";
import ReactFlow, { MiniMap, Controls, Background } from "reactflow";
import "reactflow/dist/style.css";
import PropTypes from "prop-types";

const InquiryMap = ({ businessGoal, hypotheses = [] }) => {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selected, setSelected] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [newHypothesis, setNewHypothesis] = useState("");

  const centerX = 250;
  const centerY = 250;
  const radius = 200;

  const computedNodes = useMemo(() => {
    const hypoNodes = hypotheses.map((hypo, index) => {
      const angle = (index / Math.max(hypotheses.length, 1)) * 2 * Math.PI;
      const baseLabel =
        typeof hypo === "string"
          ? hypo
          : `${hypo.id ? `${hypo.id}: ` : ""}${
              hypo.statement || hypo.label || ""
            }`;
      const label =
        typeof hypo === "object" && typeof hypo.confidence === "number"
          ? `${baseLabel} (${Math.round(hypo.confidence * 100)}%)`
          : baseLabel;
      return {
        id: `hypothesis-${index}`,
        data: { label, confidence: hypo.confidence },
        position: {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
        },
      };
    });
    return [
      {
        id: "goal",
        data: { label: businessGoal || "Business Goal" },
        position: { x: centerX, y: centerY },
      },
      ...hypoNodes,
    ];
  }, [businessGoal, hypotheses]);

  const computedEdges = useMemo(
    () =>
      hypotheses.map((_, index) => ({
        id: `edge-${index}`,
        source: "goal",
        target: `hypothesis-${index}`,
      })),
    [hypotheses]
  );

  useEffect(() => {
    setNodes(computedNodes);
    setEdges(computedEdges);
  }, [computedNodes, computedEdges]);

  const onNodeClick = (_, node) => {
    setSelected(node);
  };

  const addHypothesis = (e) => {
    e.preventDefault();
    if (!newHypothesis.trim()) return;
    const index = nodes.length; // goal already included
    const angle = ((index - 1) / index) * 2 * Math.PI;
    const newNode = {
      id: `hypothesis-${index - 1}`,
      data: { label: newHypothesis },
      position: {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      },
    };
    setNodes((nds) => [...nds, newNode]);
    setEdges((eds) => [
      ...eds,
      { id: `edge-${index - 1}`, source: "goal", target: newNode.id },
    ]);
    setNewHypothesis("");
    setModalOpen(false);
  };

  return (
    <div className="w-full h-full" style={{ height: "600px" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={onNodeClick}
        fitView
      >
        <MiniMap />
        <Controls />
        <Background />
      </ReactFlow>
      <div className="mt-4 flex gap-2">
        <button
          className="px-4 py-2 bg-blue-500 text-white rounded"
          onClick={() => setModalOpen(true)}
        >
          New Hypothesis
        </button>
        {selected && (
          <div className="self-center">Selected: {selected.data.label}</div>
        )}
      </div>
      {modalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50">
          <form
            onSubmit={addHypothesis}
            className="bg-white p-4 rounded shadow-md space-y-2"
          >
            <label className="block">
              Hypothesis
              <input
                className="border w-full p-1 mt-1"
                value={newHypothesis}
                onChange={(e) => setNewHypothesis(e.target.value)}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1 bg-gray-300 rounded"
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </button>
              <button type="submit" className="px-3 py-1 bg-blue-500 text-white rounded">
                Add
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

InquiryMap.propTypes = {
  businessGoal: PropTypes.string,
  hypotheses: PropTypes.arrayOf(
    PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.shape({
        id: PropTypes.string,
        statement: PropTypes.string,
        label: PropTypes.string,
        confidence: PropTypes.number,
      }),
    ])
  ),
};

export default InquiryMap;
