import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import ReactFlow, { MiniMap, Controls, Background } from "reactflow";
import "reactflow/dist/style.css";
import { auth } from "../firebase";
import { loadInitiative, saveInitiative } from "../utils/initiatives";
import {
  createInquiryMap,
  subscribeInquiryMap,
  addHypothesis,
  addQuestion,
} from "../utils/inquiryMap";

export default function InquiryMap() {
  const [map, setMap] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [newGoal, setNewGoal] = useState("");
  const [newHypothesis, setNewHypothesis] = useState("");
  const [selectedHypothesis, setSelectedHypothesis] = useState("");
  const [newQuestion, setNewQuestion] = useState("");
  const [searchParams] = useSearchParams();
  const initiativeId = searchParams.get("initiativeId");
  const uid = auth.currentUser?.uid || null;

  useEffect(() => {
    if (uid && initiativeId) {
      loadInitiative(uid, initiativeId).then((init) => {
        if (init?.inquiryMapId) {
          subscribeInquiryMap(init.inquiryMapId, setMap);
        }
      });
    }
  }, [uid, initiativeId]);

  const handleCreate = async () => {
    const id = await createInquiryMap(newGoal, "");
    subscribeInquiryMap(id, setMap);
    if (uid && initiativeId) {
      saveInitiative(uid, initiativeId, { inquiryMapId: id, businessGoal: newGoal });
    }
  };

  const handleAddHypothesis = async () => {
    if (map && newHypothesis) {
      await addHypothesis(map.id, newHypothesis);
      setNewHypothesis("");
    }
  };

  const handleAddQuestion = async () => {
    if (map && selectedHypothesis && newQuestion) {
      await addQuestion(map.id, selectedHypothesis, newQuestion);
      setNewQuestion("");
    }
  };

  useEffect(() => {
    if (!map) return;
    const n = [];
    const e = [];
    n.push({
      id: "goal",
      data: { label: map.goal },
      position: { x: 0, y: 0 },
      style: { background: "#cce5ff" },
    });
    map.hypotheses.forEach((h, idx) => {
      const conf = h.confidence || 0;
      const color = conf >= 0.8 ? "#d4edda" : conf >= 0.3 ? "#fff3cd" : "#f8d7da";
      n.push({
        id: `h-${h.id}`,
        data: { label: `${h.text} (${Math.round(conf * 100)}%)` },
        position: { x: idx * 200, y: 150 },
        style: { background: color },
      });
      e.push({ id: `e-goal-${h.id}`, source: "goal", target: `h-${h.id}` });
      h.questions?.forEach((q, qidx) => {
        n.push({
          id: `q-${h.id}-${q.id}`,
          data: { label: q.text },
          position: { x: idx * 200, y: 300 + qidx * 100 },
          style: { background: "#d1ecf1" },
        });
        e.push({
          id: `e-${h.id}-${q.id}`,
          source: `h-${h.id}`,
          target: `q-${h.id}-${q.id}`,
        });
      });
    });
    setNodes(n);
    setEdges(e);
  }, [map]);

  if (!map) {
    return (
      <div className="card glass-card">
        <h2>Create Inquiry Map</h2>
        <input
          type="text"
          placeholder="Business goal"
          value={newGoal}
          onChange={(e) => setNewGoal(e.target.value)}
        />
        <button onClick={handleCreate}>Create</button>
      </div>
    );
  }

  return (
    <div className="card glass-card">
      <h2>Inquiry Map</h2>
      <div style={{ width: "100%", height: 400 }}>
        <ReactFlow nodes={nodes} edges={edges} fitView>
          <MiniMap />
          <Controls />
          <Background />
        </ReactFlow>
      </div>
      <div>
        <input
          type="text"
          placeholder="New hypothesis"
          value={newHypothesis}
          onChange={(e) => setNewHypothesis(e.target.value)}
        />
        <button onClick={handleAddHypothesis}>Add Hypothesis</button>
      </div>
      {map.hypotheses.map((h) => (
        <div key={h.id}>
          <strong>{h.text}</strong>
          <div>
            <input
              type="text"
              placeholder="New question"
              value={selectedHypothesis === h.id ? newQuestion : ""}
              onChange={(e) => {
                setSelectedHypothesis(h.id);
                setNewQuestion(e.target.value);
              }}
            />
            <button
              onClick={() => {
                setSelectedHypothesis(h.id);
                handleAddQuestion();
              }}
            >
              Add Question
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
