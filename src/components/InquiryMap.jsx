import { useEffect, useMemo, useRef, useState, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
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
import "./AIToolsGenerators.css";
import { useInquiryMap } from "../contexts/InquiryMapContext"; // Import the context hook

// --- Helper Functions for Sizing (Unchanged) ---
function useVisibleHeight(containerRef) {
  const [h, setH] = useState(600);
  useLayoutEffect(() => {
    const calc = () => {
      const footer = document.querySelector("footer");
      const footerH = footer?.offsetHeight || 0;
      const top = containerRef.current?.getBoundingClientRect().top || 0;
      const height = Math.max(360, window.innerHeight - Math.max(0, top) - footerH);
      setH(height);
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [containerRef]);
  return h;
}

function useHeaderOverlap(containerRef) {
  const [mt, setMt] = useState(0);
  useLayoutEffect(() => {
    const calc = () => {
      const candidates = Array.from(document.querySelectorAll("nav, header, [data-header], .app-header"));
      const topFixed = candidates.find((el) => {
        const s = getComputedStyle(el);
        return s.position === "fixed" && parseInt(s.top || "0", 10) === 0 && el.offsetHeight > 0;
      });
      if (!topFixed || !containerRef.current) return setMt(0);

      const headerRect = topFixed.getBoundingClientRect();
      const contRect = containerRef.current.getBoundingClientRect();
      const overlap = Math.max(0, headerRect.bottom - contRect.top);
      setMt(overlap);
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [containerRef]);
  return mt;
}

// --- Node Rendering & Styles (Unchanged) ---
const CARD_W = 320;
const CARD_H = 110;

const baseCardStyle = {
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 6px 14px rgba(0,0,0,0.06)",
  color: "#111827",
  overflow: "hidden",
  width: CARD_W,
  height: CARD_H,
};

const colorFor = (c) =>
  typeof c !== "number" ? "#f87171" : c < 0.33 ? "#f87171" : c < 0.66 ? "#fbbf24" : "#4ade80";

const ResizableNode = ({ id, data, selected }) => (
  <div className="relative">
    <NodeResizer
      minWidth={240}
      minHeight={72}
      isVisible={selected}
      onResizeEnd={(_, p) => data.onResize?.(id, p.width, p.height)}
    />
    <div style={{ padding: 12, lineHeight: 1.25, background: "transparent", color: "#111827", whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "anywhere" }}>
      {data.label}
    </div>
  </div>
);

ResizableNode.propTypes = {
  id: PropTypes.string,
  data: PropTypes.object,
  selected: PropTypes.bool,
};

const nodeTypes = { resizable: ResizableNode };

// --- Main Component ---
const InquiryMap = () => {
  const wrapperRef = useRef(null);
  const height = useVisibleHeight(wrapperRef);
  const marginTop = useHeaderOverlap(wrapperRef);

  // **CRITICAL FIX: Consume the context directly in the UI component**
  const { hypotheses, businessGoal, isAnalyzing, refreshInquiryMap, updateConfidence: updateConfidenceInDb } = useInquiryMap();

  const [nodes, setNodes] = useNodesState([]);
  const [edges, setEdges] = useState([]);
  const [selected, setSelected] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [newHypothesis, setNewHypothesis] = useState("");

  const selectedPct = selected ? Math.min(100, Math.max(0, Math.round((selected.data.confidence || 0) * 100))) : 0;
  const sizesRef = useRef({});

  const persistSize = useCallback((id, width, height) => {
    sizesRef.current[id] = { width, height };
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, style: { ...n.style, width, height } } : n)));
  }, [setNodes]);

  const baseLayout = useMemo(() => {
    const marginX = 48;
    const rowYGoal = 40;
    const rowYHypos = rowYGoal + CARD_H + 40;

    const goal = {
      id: "goal",
      type: "resizable",
      data: { label: businessGoal || "Business Goal", onResize: persistSize },
      position: { x: 0, y: rowYGoal },
      style: { ...baseCardStyle, background: "#ffffff", fontWeight: 600, width: sizesRef.current["goal"]?.width ?? CARD_W, height: sizesRef.current["goal"]?.height ?? CARD_H },
    };

    const hs = hypotheses.map((h, i) => {
      const id = h.id || `hypothesis-${i}`;
      const conf = h.confidence;
      const pct = Math.round((conf || 0) * 100);
      const label = `${h.statement || h.label || ""} (${pct}%)`;
      const offset = (i - (hypotheses.length - 1) / 2) * (CARD_W + marginX);
      return {
        id,
        type: "resizable",
        data: { ...h, label, onResize: persistSize },
        position: { x: offset, y: rowYHypos },
        style: { ...baseCardStyle, background: h.contested ? "#fb923c" : colorFor(conf), width: sizesRef.current[id]?.width ?? CARD_W, height: sizesRef.current[id]?.height ?? CARD_H },
      };
    });

    const es = hypotheses.map((h) => ({ id: `edge-${h.id}`, source: "goal", target: h.id }));
    return { nodes: [goal, ...hs], edges: es };
  }, [businessGoal, hypotheses, persistSize]);

  useEffect(() => {
    setNodes((prev) => {
      const prevMap = new Map(prev.map((n) => [n.id, n]));
      return baseLayout.nodes.map((n) => {
        const old = prevMap.get(n.id);
        return old ? { ...n, position: old.position, style: { ...n.style, width: old.style.width, height: old.style.height } } : n;
      });
    });
    setEdges(baseLayout.edges);
  }, [baseLayout, setNodes]);

  const onNodesChange = useCallback((changes) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, [setNodes]);

  const updateConfidenceInUI = (id, confidence) => {
    // Optimistically update the UI
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, confidence }, style: { ...n.style, background: n.data.contested ? "#fb923c" : colorFor(confidence) } } : n
      )
    );
    setSelected((sel) => sel && sel.id === id ? { ...sel, data: { ...sel.data, confidence }, style: { ...sel.style, background: sel.data.contested ? "#fb923c" : colorFor(confidence) } } : sel);
    // Debounce the call to Firestore if needed, or call directly
    updateConfidenceInDb(id, confidence);
  };

  const addHypothesis = (e) => {
    e.preventDefault();
    // This function would need to be implemented in the context, e.g., `addHypothesis(newHypothesis)`
    console.log("Adding new hypothesis:", newHypothesis); 
    setNewHypothesis("");
    setModalOpen(false);
  };

  return (
    <div ref={wrapperRef} className="w-full" style={{ marginTop, height }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onNodeClick={(_, n) => setSelected(n)}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.35, maxZoom: 0.85 }}
        minZoom={0.3}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant="dots" gap={24} size={1} />
        <MiniMap pannable zoomable />
        <Controls position="top-left" />

        <Panel position="top-left" className="flex items-center gap-2 bg-white/85 rounded-xl px-3 py-2 shadow">
          <button
            type="button"
            className="px-3 py-1.5 bg-green-600 text-white rounded"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              refreshInquiryMap(); // Directly call the function from the context
            }}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? "Analyzing..." : "Refresh Map"}
          </button>
        </Panel>

        <Panel position="top-right">
          <button className="px-4 py-2 bg-blue-500 text-white rounded shadow" onClick={() => setModalOpen(true)}>
            New Hypothesis
          </button>
        </Panel>
      </ReactFlow>
      {/* Portals for modals (unchanged) */}
    </div>
  );
};

InquiryMap.propTypes = {}; // Simplified as it no longer takes these props directly

export default InquiryMap;