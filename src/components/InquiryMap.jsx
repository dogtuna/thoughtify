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

/* --------- robust viewport sizing (no assumptions about <header>) --------- */
function useVisibleHeight(containerRef) {
  const [h, setH] = useState(600);
  useLayoutEffect(() => {
    const calc = () => {
      const footer = document.querySelector("footer");
      const footerH = footer?.offsetHeight || 0;

      const top = containerRef.current?.getBoundingClientRect().top || 0;
      // height of visible space from the top of the container to above the footer
      const height = Math.max(360, window.innerHeight - Math.max(0, top) - footerH);
      setH(height);
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);
  return h;
}

/* A small helper to push the canvas below any fixed header even if the page
   padding isn't enough. We compute how much the header overlaps this container. */
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
  }, []);
  return mt;
}

/* ------------------------- node rendering & styles ------------------------- */
const CARD_W = 320;
const CARD_H = 110;

const baseCardStyle = {
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 6px 14px rgba(0,0,0,0.06)",
  color: "#111827",
  overflow: "hidden",              // clip node body
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
    <div
      style={{
        padding: 12,
        lineHeight: 1.25,
        background: "transparent",
        color: "#111827",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        overflowWrap: "anywhere",
      }}
    >
      {data.label}
    </div>
  </div>
);

ResizableNode.propTypes = {
  id: PropTypes.string,
  data: PropTypes.shape({
    label: PropTypes.string,
    confidence: PropTypes.number,
    onResize: PropTypes.func,
  }),
  selected: PropTypes.bool,
};

const nodeTypes = { resizable: ResizableNode };

/* --------------------------------- main ---------------------------------- */
const InquiryMap = ({ businessGoal, hypotheses = [], onUpdateConfidence, onRefresh = () => {}, isAnalyzing }) => {
  const wrapperRef = useRef(null);
  const height = useVisibleHeight(wrapperRef);
  const marginTop = useHeaderOverlap(wrapperRef);

  const [nodes, setNodes] = useNodesState([]);
  const [edges, setEdges] = useState([]);
  const [selected, setSelected] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [newHypothesis, setNewHypothesis] = useState("");

  const selectedPct = selected
    ? Math.min(
        100,
        Math.max(0, Math.round((selected.data.confidence || 0) * 100)),
      )
    : 0;

  const sizesRef = useRef({}); // remember manual resizes across renders

  const persistSize = useCallback((id, width, height) => {
    sizesRef.current[id] = { width, height };
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, style: { ...n.style, width, height } } : n)));
  }, [setNodes]);

  /* tidy top-down layout: goal on top center, hypotheses in a row beneath */
  const baseLayout = useMemo(() => {
    const marginX = 48;
    const rowYGoal = 40; // inside the canvas
    const rowYHypos = rowYGoal + CARD_H + 40;

    const goal = {
      id: "goal",
      type: "resizable",
      data: { label: businessGoal || "Business Goal", onResize: persistSize },
      position: { x: 0, y: rowYGoal },
      style: {
        ...baseCardStyle,
        background: "#ffffff",
        fontWeight: 600,
        width: sizesRef.current["goal"]?.width ?? baseCardStyle.width,
        height: sizesRef.current["goal"]?.height ?? baseCardStyle.height,
      },
    };

    const hs = hypotheses.map((h, i) => {
      const id = typeof h === "object" && h.id ? h.id : `hypothesis-${i}`;
      const conf = typeof h === "object" ? h.confidence : undefined;
      const contribs = typeof h === "object" ? h.sourceContributions : undefined;
      const sup = typeof h === "object" ? h.supportingEvidence : undefined;
      const ref = typeof h === "object" ? h.refutingEvidence : undefined;
      const contested = typeof h === "object" ? h.contested : undefined;
      const baseLabel =
        typeof h === "string"
          ? h
          : `${h.id ? `${h.id}: ` : ""}${h.statement || h.label || ""}`;
      const pct = Math.min(
        100,
        Math.max(0, Math.round((conf || 0) * 100)),
      );
      const label =
        typeof conf === "number" ? `${baseLabel} (${pct}%)` : baseLabel;

      // place evenly around x=0, spacing by card width + margin
      const offset = (i - (hypotheses.length - 1) / 2) * (CARD_W + marginX);

      return {
        id,
        type: "resizable",
        data: {
          label,
          confidence: conf,
          onResize: persistSize,
          sourceContributions: contribs,
          supportingEvidence: sup,
          refutingEvidence: ref,
          contested,
        },
        position: { x: offset, y: rowYHypos },
        style: {
          ...baseCardStyle,
          background: contested ? "#fb923c" : colorFor(conf),
          width: sizesRef.current[id]?.width ?? baseCardStyle.width,
          height: sizesRef.current[id]?.height ?? baseCardStyle.height,
        },
      };
    });

    const es = hypotheses.map((h, i) => ({
      id: `edge-${i}`,
      source: "goal",
      target: typeof h === "object" && h.id ? h.id : `hypothesis-${i}`,
      style: { stroke: "rgba(0,0,0,0.25)" },
    }));

    return { nodes: [goal, ...hs], edges: es };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessGoal, hypotheses]);

  // keep manual position + size if the list changes
  useEffect(() => {
    setNodes((prev) => {
      const prevMap = new Map(prev.map((n) => [n.id, n]));
      return baseLayout.nodes.map((n) => {
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
    setEdges(baseLayout.edges);
  }, [baseLayout, setNodes]);

  const onNodesChange = useCallback((changes) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, [setNodes]);

  const updateConfidence = (id, confidence) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? {
              ...n,
              data: { ...n.data, confidence },
              style: {
                ...n.style,
                background: n.data.contested ? "#fb923c" : colorFor(confidence),
              },
            }
          : n
      )
    );
    setSelected((sel) =>
      sel && sel.id === id
        ? {
            ...sel,
            data: { ...sel.data, confidence },
            style: {
              ...sel.style,
              background: sel.data.contested ? "#fb923c" : colorFor(confidence),
            },
          }
        : sel
    );
    onUpdateConfidence?.(id, confidence);
  };

  const addHypothesis = (e) => {
    e.preventDefault();
    if (!newHypothesis.trim()) return;
    const idx = nodes.filter((n) => n.id !== "goal").length;
    const id = `hypothesis-${idx}`;
    const offset = (idx - (idx) / 2) * (CARD_W + 48);

    const node = {
      id,
      type: "resizable",
      data: { label: newHypothesis, confidence: 0, onResize: persistSize },
      position: { x: offset, y: CARD_H + 80 },
      style: { ...baseCardStyle, background: colorFor(0) },
    };
    setNodes((nds) => [...nds, node]);
    setEdges((eds) => [...eds, { id: `edge-${idx}`, source: "goal", target: id }]);
    setNewHypothesis("");
    setModalOpen(false);
  };

  const handleRefresh = useCallback(
    (e) => {
      e.stopPropagation();
      onRefresh();
    },
    [onRefresh]
  );

  return (
    <div ref={wrapperRef} className="w-full" style={{ marginTop, height }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onNodeClick={(_, n) => setSelected(n)}
        nodeTypes={nodeTypes}
        /* Better initial zoom */
        fitView
        fitViewOptions={{ padding: 0.35, maxZoom: 0.85 }}
        minZoom={0.3}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant="dots" gap={24} size={1} />
        <MiniMap pannable zoomable />
        <Controls position="top-left" />

        {/* Panels live INSIDE the canvas, never under header/footer */}
        <Panel position="top-left" className="flex items-center gap-2 bg-white/85 rounded-xl px-3 py-2 shadow">
          <button
            type="button"
            className="px-3 py-1.5 bg-green-600 text-white rounded"
            onPointerDownCapture={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDownCapture={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleRefresh}
            disabled={isAnalyzing}
          >
            Refresh Map
          </button>
            {isAnalyzing && <span className="text-sm">Analyzing…</span>}
        </Panel>

        <Panel position="top-right">
          <button className="px-4 py-2 bg-blue-500 text-white rounded shadow" onClick={() => setModalOpen(true)}>
            New Hypothesis
          </button>
        </Panel>

      </ReactFlow>
      {selected &&
        createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              background: "rgba(0,0,0,0.5)",
            }}
            onClick={() => setSelected(null)}
          >
            <div
              className="initiative-card"
              style={{
                position: "fixed",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: "min(520px, 90vw)",
                maxHeight: "90vh",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex items-center gap-2">
              <span className="font-semibold truncate flex-1">
                {selected.data.label}
              </span>
              <input
                type="range"
                min="0"
                max="100"
                value={selectedPct}
                onChange={(e) =>
                  updateConfidence(selected.id, Number(e.target.value) / 100)
                }
              />
              <span>{selectedPct}%</span>
            </div>
            {Array.isArray(selected.data.sourceContributions) &&
              selected.data.sourceContributions.length > 0 && (
                <details>
                  <summary className="cursor-pointer">Source contributions</summary>
                  <ul className="list-disc ml-4">
                    {selected.data.sourceContributions.map((s, idx) => (
                      <li key={idx}>
                        {s.source.length > 60
                          ? `${s.source.slice(0, 60)}…`
                          : s.source}
                        : {(s.percent * 100).toFixed(1)}%
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            {(Array.isArray(selected.data.supportingEvidence) &&
              selected.data.supportingEvidence.length > 0) ||
            (Array.isArray(selected.data.refutingEvidence) &&
              selected.data.refutingEvidence.length > 0) ? (
              <details>
                <summary className="cursor-pointer">Evidence</summary>
                <ul className="ml-4 space-y-1">
                  {selected.data.supportingEvidence?.map((e, idx) => (
                    <li key={`sup-${idx}`} className="flex items-start gap-1">
                      <span className="text-green-600 font-bold">+</span>
                      <span>
                        {e.analysisSummary ||
                          (e.text.length > 60
                            ? `${e.text.slice(0, 60)}…`
                            : e.text)}
                      </span>
                    </li>
                  ))}
                  {selected.data.refutingEvidence?.map((e, idx) => (
                    <li key={`ref-${idx}`} className="flex items-start gap-1">
                      <span className="text-red-600 font-bold">-</span>
                      <span>
                        {e.analysisSummary ||
                          (e.text.length > 60
                            ? `${e.text.slice(0, 60)}…`
                            : e.text)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            <div className="flex justify-end">
              <button
                className="px-3 py-1 bg-blue-500 text-white rounded"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>
            </div>
          </div>,
          document.body
        )}

      {modalOpen &&
        createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              background: "rgba(0,0,0,0.5)",
            }}
            onClick={() => setModalOpen(false)}
          >
            <form
              onSubmit={addHypothesis}
              className="initiative-card"
              style={{
                position: "fixed",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: "min(520px, 90vw)",
                maxHeight: "90vh",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
              onClick={(e) => e.stopPropagation()}
            >
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
              <button type="submit" className="px-3 py-1 bg-blue-500 text-white rounded">Add</button>
            </div>
            </form>
          </div>,
          document.body
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
        supportingEvidence: PropTypes.arrayOf(
          PropTypes.shape({
            text: PropTypes.string,
            analysisSummary: PropTypes.string,
            impact: PropTypes.string,
            delta: PropTypes.number,
          })
        ),
        refutingEvidence: PropTypes.arrayOf(
          PropTypes.shape({
            text: PropTypes.string,
            analysisSummary: PropTypes.string,
            impact: PropTypes.string,
            delta: PropTypes.number,
          })
        ),
        sourceContributions: PropTypes.arrayOf(
          PropTypes.shape({
            source: PropTypes.string,
            percent: PropTypes.number,
          })
        ),
        contested: PropTypes.bool,
      }),
    ])
  ),
  onUpdateConfidence: PropTypes.func,
  onRefresh: PropTypes.func,
  isAnalyzing: PropTypes.bool,
};

export default InquiryMap;
