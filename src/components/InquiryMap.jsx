import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  Panel,
  useNodesState,
  applyNodeChanges,
} from "reactflow";
import { NodeResizer } from "@reactflow/node-resizer";
import "reactflow/dist/style.css";
import "@reactflow/node-resizer/dist/style.css";
import PropTypes from "prop-types";

function useCanvasHeight(defaultH = 600) {
  const [h, setH] = useState(defaultH);
  useEffect(() => {
    const calc = () => {
      const header = document.querySelector("header")?.offsetHeight || 0;
      const footer = document.querySelector("footer")?.offsetHeight || 0;
      const height = Math.max(320, window.innerHeight - header - footer);
      setH(height);
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);
  return h;
}

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
    <div className="px-3 py-2 rounded-2xl bg-transparent text-[#111827] break-words whitespace-pre-wrap max-w-[520px]">
      {data.label}
    </div>
  </div>
);

const nodeTypes = { resizable: ResizableNode };

const baseCardStyle = {
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
  color: "#111827",
  width: CARD_W,
  height: CARD_H,
};

const colorFor = (c) =>
  typeof c !== "number" ? "#f87171" : c < 0.33 ? "#f87171" : c < 0.66 ? "#fbbf24" : "#4ade80";

const InquiryMap = ({ businessGoal, hypotheses = [], onUpdateConfidence, onRefresh, isAnalyzing }) => {
  const [nodes, setNodes] = useNodesState([]);
  const [edges, setEdges] = useState([]);
  const [selected, setSelected] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [newHypothesis, setNewHypothesis] = useState("");
  const sizesRef = useRef({}); // { id: {width, height} }
  const canvasHeight = useCanvasHeight();

  // layout params
  const centerX = 420;
  const centerY = 280;
  const radius = 260;

  const persistSize = useCallback((id, width, height) => {
    sizesRef.current[id] = { width, height };
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, style: { ...n.style, width, height } } : n)));
  }, [setNodes]);

  const baseNodes = useMemo(() => {
    const goal = {
      id: "goal",
      type: "resizable",
      data: { label: businessGoal || "Business Goal", onResize: persistSize },
      position: { x: centerX, y: centerY },
      style: {
        ...baseCardStyle,
        background: "#ffffff",
        fontWeight: 600,
        width: sizesRef.current["goal"]?.width ?? baseCardStyle.width,
        height: sizesRef.current["goal"]?.height ?? baseCardStyle.height,
      },
    };

    const hs = hypotheses.map((h, idx) => {
      const id = typeof h === "object" && h.id ? h.id : `hypothesis-${idx}`;
      const conf = typeof h === "object" ? h.confidence : undefined;
      const baseLabel =
        typeof h === "string" ? h : `${h.id ? `${h.id}: ` : ""}${h.statement || h.label || ""}`;
      const label = typeof conf === "number" ? `${baseLabel} (${Math.round(conf * 100)}%)` : baseLabel;
      const angle = (idx / Math.max(hypotheses.length, 1)) * 2 * Math.PI;

      return {
        id,
        type: "resizable",
        data: { label, confidence: conf, onResize: persistSize },
        position: { x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle) },
        style: {
          ...baseCardStyle,
          background: colorFor(conf),
          width: sizesRef.current[id]?.width ?? baseCardStyle.width,
          height: sizesRef.current[id]?.height ?? baseCardStyle.height,
        },
      };
    });

    const es = hypotheses.map((h, idx) => ({
      id: `edge-${idx}`,
      source: "goal",
      target: typeof h === "object" && h.id ? h.id : `hypothesis-${idx}`,
      style: { stroke: "rgba(0,0,0,0.25)" },
    }));

    return { nodes: [goal, ...hs], edges: es };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessGoal, hypotheses]); // sizes are read from ref, positions will be merged below

  useEffect(() => {
    setNodes((prev) => {
      const prevMap = new Map(prev.map((n) => [n.id, n]));
      return baseNodes.nodes.map((n) => {
        const old = prevMap.get(n.id);
        return old
          ? {
              ...n,
              position: old.position ?? n.position, // preserve manual moves
              style: {
                ...n.style,
                width: old.style?.width ?? n.style.width,
                height: old.style?.height ?? n.style.height,
              },
            }
          : n;
      });
    });
    setEdges(baseNodes.edges);
  }, [baseNodes, setNodes]);

  const onNodesChange = useCallback(
    (changes) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
    },
    [setNodes]
  );

  const onNodeClick = (_, node) => setSelected(node);

  const updateConfidence = (id, confidence) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, confidence }, style: { ...n.style, background: colorFor(confidence) } } : n
      )
    );
    setSelected((sel) =>
      sel && sel.id === id ? { ...sel, data: { ...sel.data, confidence }, style: { ...sel.style, background: colorFor(confidence) } } : sel
    );
    onUpdateConfidence?.(id, confidence);
  };

  const addHypothesis = (e) => {
    e.preventDefault();
    if (!newHypothesis.trim()) return;
    const idx = nodes.filter((n) => n.id !== "goal").length;
    const angle = (idx / Math.max(idx || 1, 1)) * 2 * Math.PI;
    const id = `hypothesis-${idx}`;
    const node = {
      id,
      type: "resizable",
      data: { label: newHypothesis, confidence: 0, onResize: persistSize },
      position: { x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle) },
      style: { ...baseCardStyle, background: colorFor(0) },
    };
    setNodes((nds) => [...nds, node]);
    setEdges((eds) => [...eds, { id: `edge-${idx}`, source: "goal", target: id }]);
    setNewHypothesis("");
    setModalOpen(false);
  };

  return (
    <div className="w-full" style={{ height: `${canvasHeight}px` }}>
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

        {/* Left panel: Refresh + status */}
        <Panel position="top-left" className="flex items-center gap-2 bg-white/80 rounded-xl px-3 py-2 shadow">
          <button
            className="px-3 py-1.5 bg-green-600 text-white rounded"
            onClick={onRefresh}
            disabled={isAnalyzing}
          >
            Refresh Map
          </button>
          {isAnalyzing && <span className="text-sm">Analyzing…</span>}
        </Panel>

        {/* Right panel: New hypothesis */}
        <Panel position="top-right">
          <button
            className="px-4 py-2 bg-blue-500 text-white rounded shadow"
            onClick={() => setModalOpen(true)}
          >
            New Hypothesis
          </button>
        </Panel>

        {/* Bottom-left panel: confidence slider for selected */}
        {selected && (
          <Panel position="bottom-left" className="bg-black/70 text-white rounded-xl px-3 py-2 shadow max-w-[40vw]">
            <div className="flex items-center gap-2">
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

ResizableNode.propTypes = {
  id: PropTypes.string,
  data: PropTypes.shape({ label: PropTypes.string, onResize: PropTypes.func, confidence: PropTypes.number }),
  selected: PropTypes.bool,
};

InquiryMap.propTypes = {
  businessGoal: PropTypes.string,
  hypotheses: PropTypes.arrayOf(
    PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.shape({ id: PropTypes.string, statement: PropTypes.string, label: PropTypes.string, confidence: PropTypes.number }),
    ])
  ),
  onUpdateConfidence: PropTypes.func,
  onRefresh: PropTypes.func,
  isAnalyzing: PropTypes.bool,
};

export default InquiryMap;
