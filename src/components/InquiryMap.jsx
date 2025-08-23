import { useEffect, useMemo, useState } from "react";
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
} from "reactflow";
import "reactflow/dist/style.css";
import PropTypes from "prop-types";

const InquiryMap = ({ businessGoal, hypotheses = [] }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges] = useState([]);
  const [selected, setSelected] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [newHypothesis, setNewHypothesis] = useState("");

  const centerX = 250;
  const centerY = 250;
  const radius = 200;

  const getColor = (confidence) => {
    if (typeof confidence !== "number") return "#d1d5db"; // gray for unknown
    if (confidence < 0.33) return "#f87171"; // red
    if (confidence < 0.66) return "#fbbf24"; // amber
    return "#4ade80"; // green
  };

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
      const confidence =
        typeof hypo === "object" ? hypo.confidence : undefined;
      return {
        id: `hypothesis-${index}`,
        data: { label, confidence },
        position: {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
        },
        style: { background: getColor(confidence) },
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

  const updateConfidence = (id, confidence) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? {
              ...n,
              data: { ...n.data, confidence },
              style: { ...n.style, background: getColor(confidence) },
            }
          : n
      )
    );
    setSelected((sel) =>
      sel && sel.id === id
        ? {
            ...sel,
            data: { ...sel.data, confidence },
            style: { ...sel.style, background: getColor(confidence) },
          }
        : sel
    );
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
      style: { background: getColor(0) },
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
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        fitView
      >
        <MiniMap />
        <Controls />
        <Background />
      </ReactFlow>
      <div className="mt-4 flex gap-4 items-center">
        <button
          className="px-4 py-2 bg-blue-500 text-white rounded"
          onClick={() => setModalOpen(true)}
        >
          New Hypothesis
        </button>
        {selected && (
          <div className="flex items-center gap-2">
            <span>Selected: {selected.data.label}</span>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round((selected.data.confidence || 0) * 100)}
              onChange={(e) =>
                updateConfidence(selected.id, Number(e.target.value) / 100)
              }
            />
            <span>{Math.round((selected.data.confidence || 0) * 100)}%</span>
          </div>
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
