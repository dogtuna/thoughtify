import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  Panel,
  useNodesState,
} from "reactflow";
import { NodeResizer } from "@reactflow/node-resizer";
import "reactflow/dist/style.css";
import "@reactflow/node-resizer/dist/style.css";
import PropTypes from "prop-types";

const CARD_W = 320;
const CARD_H = 100;

const ResizableNode = ({ id, data, selected }) => (
  <div className="relative text-sm leading-snug">
    <NodeResizer
      minWidth={220}
      minHeight={64}
      isVisible={selected}
      onResizeEnd={(_, p) => data.onResize?.(id, p.width, p.height)}
    />
    {/* inherit background from node.style; enforce readable text + wrapping */}
    <div className="px-3 py-2 rounded-2xl bg-transparent text-[#111827] break-words whitespace-pre-wrap max-w-[480px]">
      {data.label}
    </div>
  </div>
);

ResizableNode.propTypes = {
  id: PropTypes.string,
  data: PropTypes.shape({ label: PropTypes.string, onResize: PropTypes.func }),
  selected: PropTypes.bool,
};

const nodeTypes = { resizable: ResizableNode };

const baseCardStyle = {
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
  color: "#111827",
  width: CARD_W,
  height: CARD_H,
};

const InquiryMap = ({ businessGoal, hypotheses = [], onUpdateConfidence }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges] = useState([]);
  const [selected, setSelected] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [newHypothesis, setNewHypothesis] = useState("");
  const sizesRef = useRef({}); // persist { [id]: {width, height} } across renders

  // Layout center
  const centerX = 400;
  const centerY = 300;
  const radius = 260;

  const getColor = (confidence) => {
    if (typeof confidence !== "number") return "#f87171"; // red
    if (confidence < 0.33) return "#f87171"; // red
    if (confidence < 0.66) return "#fbbf24"; // amber
    return "#4ade80"; // green
  };

  const handleResizePersist = useCallback((id, width, height) => {
    sizesRef.current[id] = { width, height };
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, style: { ...n.style, width, height } } : n
      )
    );
  }, [setNodes]);

  // Build nodes, but merge any existing position / saved width/height to avoid resets
  const computed = useMemo(() => {
    const prevMap = new Map(nodes.map((n) => [n.id, n]));

    const goal = {
      id: "goal",
      type: "resizable",
      data: { label: businessGoal || "Business Goal", onResize: handleResizePersist },
      position: prevMap.get("goal")?.position ?? { x: centerX, y: centerY },
      style: {
        ...baseCardStyle,
        background: "#ffffff",
        fontWeight: 600,
        width: prevMap.get("goal")?.style?.width ?? baseCardStyle.width,
        height: prevMap.get("goal")?.style?.height ?? baseCardStyle.height,
      },
    };

    const hypoNodes = hypotheses.map((hypo, index) => {
      const angle = (index / Math.max(hypotheses.length, 1)) * 2 * Math.PI;
      const id = typeof hypo === "object" && hypo.id ? hypo.id : `hypothesis-${index}`;
      const confidence = typeof hypo === "object" ? hypo.confidence : undefined;

      const baseLabel =
        typeof hypo === "string"
          ? hypo
          : `${hypo.id ? `${hypo.id}: ` : ""}${hypo.statement || hypo.label || ""}`;

      const label =
        typeof hypo === "object" && typeof confidence === "number"
          ? `${baseLabel} (${Math.round(confidence * 100)}%)`
          : baseLabel;

      const prev = prevMap.get(id);
      const size = sizesRef.current[id] || prev?.style || {};

      return {
        id,
        type: "resizable",
        data: { label, confidence, onResize: handleResizePersist },
        position:
          prev?.position ??
          {
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle),
          },
        style: {
          ...baseCardStyle,
          background: getColor(confidence),
          width: size.width ?? baseCardStyle.width,
          height: size.height ?? baseCardStyle.height,
        },
      };
    });

    const edges = hypotheses.map((hypo, index) => ({
      id: `edge-${index}`,
      source: "goal",
      target: typeof hypo === "object" && hypo.id ? hypo.id : `hypothesis-${index}`,
      animated: false,
      style: { stroke: "rgba(0,0,0,0.25)" },
    }));

    return { nodes: [goal, ...hypoNodes], edges };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessGoal, hypotheses, handleResizePersist]); // <— don't depend on `nodes` here to avoid loops

  useEffect(() => {
    setNodes((prev) => {
      // merge positions if we had any previous nodes with manual moves
      const prevMap = new Map(prev.map((n) => [n.id, n]));
      return computed.nodes.map((n) => {
        const old = prevMap.get(n.id);
        return old
          ? {
              ...n,
              position: old.position ?? n.position,
              style: {
                ...n.style,
                width: old.style?.width ?? n.style.width,
                height: old.style?.height ?? n.style.height,
              },
            }
          : n;
      });
    });
    setEdges(computed.edges);
  }, [computed, setNodes]);

  const onNodeClick = (_, node) => setSelected(node);

  const updateConfidence = (id, confidence) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, confidence }, style: { ...n.style, background: getColor(confidence) } }
          : n
      )
    );
    setSelected((sel) =>
      sel && sel.id === id
        ? { ...sel, data: { ...sel.data, confidence }, style: { ...sel.style, background: getColor(confidence) } }
        : sel
    );
    onUpdateConfidence?.(id, confidence);
  };

  const addHypothesis = (e) => {
    e.preventDefault();
    if (!newHypothesis.trim()) return;
    const index = nodes.filter((n) => n.id !== "goal").length + 1;
    const angle = ((index - 1) / index) * 2 * Math.PI;
    const id = `hypothesis-${index - 1}`;

    const newNode = {
      id,
      type: "resizable",
      data: { label: newHypothesis, confidence: 0, onResize: handleResizePersist },
      position: { x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle) },
      style: { ...baseCardStyle, background: getColor(0) },
    };

    setNodes((nds) => [...nds, newNode]);
    setEdges((eds) => [...eds, { id: `edge-${index - 1}`, source: "goal", target: id }]);
    setNewHypothesis("");
    setModalOpen(false);
  };

  return (
    <div
      // Adjust the 6rem/7rem to your header/footer heights if different
      className="w-full h-[calc(100vh-6rem-7rem)]"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
      >
        <Background variant="dots" gap={24} size={1} />
        <MiniMap pannable zoomable />
        <Controls position="top-left" />

        {/* Top-right panel: Add hypothesis */}
        <Panel position="top-right">
          <button
            className="px-4 py-2 bg-blue-500 text-white rounded shadow"
            onClick={() => setModalOpen(true)}
          >
            New Hypothesis
          </button>
        </Panel>

        {/* Bottom-left panel: Selected node slider */}
        {selected && (
          <Panel position="bottom-left" className="bg-black/70 text-white rounded-xl px-3 py-2 shadow">
            <div className="flex items-center gap-2 max-w-[40vw]">
              <span className="truncate">Selected: {selected.data.label}</span>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round((selected.data.confidence || 0) * 100)}
                onChange={(e) => updateConfidence(selected.id, Number(e.target.value) / 100)}
              />
              <span>{Math.round((selected.data.confidence || 0) * 100)}%</span>
            </div>
          </Panel>
        )}
      </ReactFlow>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <form onSubmit={addHypothesis} className="bg-white p-4 rounded shadow-md space-y-2 w-[min(520px,90vw)]">
            <label className="block">
              <span className="text-sm font-medium">Hypothesis</span>
              <input
                className="border w-full p-2 mt-1 rounded"
                value={newHypothesis}
                onChange={(e) => setNewHypothesis(e.target.value)}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="px-3 py-1 bg-gray-300 rounded" onClick={() => setModalOpen(false)}>
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
  onUpdateConfidence: PropTypes.func,
};

export default InquiryMap;
