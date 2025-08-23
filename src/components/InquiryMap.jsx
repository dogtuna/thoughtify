import { useState } from "react";
import {
  createInquiryMap,
  subscribeInquiryMap,
  addHypothesis,
  addQuestion,
} from "../utils/inquiryMap";

export default function InquiryMap() {
  const [map, setMap] = useState(null);
  const [newGoal, setNewGoal] = useState("");
  const [newHypothesis, setNewHypothesis] = useState("");
  const [selectedHypothesis, setSelectedHypothesis] = useState("");
  const [newQuestion, setNewQuestion] = useState("");

  const handleCreate = async () => {
    const id = await createInquiryMap(newGoal, "");
    subscribeInquiryMap(id, setMap);
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
      <h3>Goal: {map.goal}</h3>
      <div>
        <input
          type="text"
          placeholder="New hypothesis"
          value={newHypothesis}
          onChange={(e) => setNewHypothesis(e.target.value)}
        />
        <button onClick={handleAddHypothesis}>Add Hypothesis</button>
      </div>
      <ul>
        {map.hypotheses.map((h) => (
          <li key={h.id}>
            <strong>{h.text}</strong> (confidence: {h.confidence})
            <ul>
              {h.questions?.map((q) => (
                <li key={q.id}>{q.text}</li>
              ))}
            </ul>
            <div>
              <input
                type="text"
                placeholder="New question"
                value={
                  selectedHypothesis === h.id ? newQuestion : ""
                }
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
          </li>
        ))}
      </ul>
    </div>
  );
}
