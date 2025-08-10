import { useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useSearchParams } from "react-router-dom";
import { app, auth } from "../firebase.js";
import { saveInitiative } from "../utils/initiatives.js";
import { useProject } from "../context/ProjectContext.jsx";
import PropTypes from "prop-types";
import "./AIToolsGenerators.css";

const APPROACHES = [
  { value: "Bloom", label: "Bloom's Taxonomy" },
  { value: "ABCD", label: "The ABCD Model" },
  { value: "Mager", label: "Mager's Performance-Based Objectives" },
  { value: "SMART", label: "The SMART Framework" },
  { value: "Gagne", label: "Gagné's Learning Outcomes" },
];

const BLOOM_LEVELS = [
  "Remember",
  "Understand",
  "Apply",
  "Analyze",
  "Evaluate",
  "Create",
];

const LearningObjectivesGenerator = ({
  projectBrief,
  businessGoal,
  audienceProfile,
  projectConstraints,
  selectedModality,
  totalSteps,
  onBack,
}) => {
  const { learningObjectives, setLearningObjectives } = useProject();
  const [approach, setApproach] = useState("ABCD");
  const [bloomLevel, setBloomLevel] = useState("Analyze");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null); // { type, index }

  const functions = getFunctions(app, "us-central1");
  const callGenerate = httpsCallable(functions, "generateLearningObjectives");
  const [searchParams] = useSearchParams();
  const initiativeId = searchParams.get("initiativeId") || "default";

  const transform = (arr = []) => ({ text: arr[0] || "", options: arr.slice(1) });

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await callGenerate({
        projectBrief,
        businessGoal,
        audienceProfile,
        projectConstraints,
        selectedModality,
        approach,
        bloomLevel,
      });
      const result = {
        approach: data.approach,
        bloomLevel: data.bloomLevel,
        category: data.category,
        terminalObjective: transform(data.terminalObjective),
        enablingObjectives: (data.enablingObjectives || []).map(transform),
      };
      setLearningObjectives(result);
      const uid = auth.currentUser?.uid;
      if (uid) {
        await saveInitiative(uid, initiativeId, { learningObjectives: result });
      }
    } catch (err) {
      console.error("Error generating learning objectives:", err);
      setError(err?.message || "Error generating learning objectives.");
    } finally {
      setLoading(false);
    }
  };

  const getAllTexts = () => {
    const texts = [];
    if (!learningObjectives) return texts;
    const push = (obj) => {
      if (!obj) return;
      texts.push(obj.text);
      obj.options?.forEach((o) => texts.push(o));
    };
    push(learningObjectives.terminalObjective);
    (learningObjectives.enablingObjectives || []).forEach(push);
    return texts;
  };

  const handleReroll = async (type, index) => {
    if (!learningObjectives) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await callGenerate({
        projectBrief,
        businessGoal,
        audienceProfile,
        projectConstraints,
        selectedModality,
        approach: learningObjectives.approach,
        bloomLevel: learningObjectives.bloomLevel,
        category: learningObjectives.category,
        refresh: { type, index, existing: getAllTexts() },
      });
      const obj = transform(data.options || []);
      setLearningObjectives((prev) => {
        const updated = { ...prev };
        if (type === "terminal") {
          updated.terminalObjective = obj;
        } else {
          const list = [...(updated.enablingObjectives || [])];
          list[index] = obj;
          updated.enablingObjectives = list;
        }
        return updated;
      });
    } catch (err) {
      console.error("Error refreshing objective:", err);
      setError(err?.message || "Error refreshing objective.");
    } finally {
      setLoading(false);
    }
  };

  const toggleEdit = (type, index) => {
    if (editing && editing.type === type && editing.index === index) {
      setEditing(null);
    } else {
      setEditing({ type, index });
    }
  };

  const handleTextChange = (type, index, value) => {
    setLearningObjectives((prev) => {
      const updated = { ...prev };
      if (type === "terminal") {
        updated.terminalObjective = { ...updated.terminalObjective, text: value };
      } else {
        const list = [...(updated.enablingObjectives || [])];
        list[index] = { ...list[index], text: value };
        updated.enablingObjectives = list;
      }
      return updated;
    });
  };

  const handleSelectAlternative = (type, index, value) => {
    setLearningObjectives((prev) => {
      const updated = { ...prev };
      if (type === "terminal") {
        updated.terminalObjective = { ...updated.terminalObjective, text: value };
      } else {
        const list = [...(updated.enablingObjectives || [])];
        list[index] = { ...list[index], text: value };
        updated.enablingObjectives = list;
      }
      return updated;
    });
  };

  const handleSave = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !learningObjectives) return;
    setSaving(true);
    setError("");
    try {
      await saveInitiative(uid, initiativeId, { learningObjectives });
    } catch (err) {
      console.error("Error saving learning objectives:", err);
      setError(err?.message || "Error saving learning objectives.");
    } finally {
      setSaving(false);
    }
  };

  const renderObjective = (obj, type, index) => {
    if (!obj) return null;
    const isEditing = editing && editing.type === type && editing.index === index;
    const options = [obj.text, ...(obj.options || []).filter((o) => o !== obj.text)];
    return (
      <div key={`${type}-${index}`}>
        <h4>{type === "terminal" ? "Terminal Objective" : `Enabling Objective ${index + 1}`}</h4>
        <textarea
          className="generator-input"
          rows={3}
          value={obj.text}
          readOnly={!isEditing}
          onChange={(e) => handleTextChange(type, index, e.target.value)}
        />
        {obj.options && obj.options.length > 0 && (
          <select
            className="generator-input"
            value={obj.text}
            onChange={(e) => handleSelectAlternative(type, index, e.target.value)}
          >
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => toggleEdit(type, index)}
            className="generator-button"
          >
            {isEditing ? "Save" : "Edit"}
          </button>
          <button
            type="button"
            onClick={() => handleReroll(type, index)}
            className="generator-button"
          >
            Re-roll
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="generator-result">
      <div className="progress-indicator">Step 6 of {totalSteps}</div>
      <button
        type="button"
        onClick={onBack}
        className="generator-button"
        style={{ marginBottom: 10 }}
      >
        Back to Step 5
      </button>
      <h3>Learning Objectives</h3>
      <div style={{ marginBottom: 10 }}>
        <label>
          Approach
          <select
            className="generator-input"
            value={approach}
            onChange={(e) => {
              setApproach(e.target.value);
              setLearningObjectives(null);
            }}
          >
            {APPROACHES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        {approach === "Bloom" && (
          <label>
            Cognitive Level
            <select
              className="generator-input"
              value={bloomLevel}
              onChange={(e) => setBloomLevel(e.target.value)}
            >
              {BLOOM_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {!learningObjectives && (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="generator-button"
        >
          {loading ? "Generating..." : "Generate Objectives"}
        </button>
      )}
      {error && <p className="generator-error">{error}</p>}
      {learningObjectives && (
        <div>
          {learningObjectives.approach === "Gagne" && (
            <p>
              <strong>Category:</strong> {learningObjectives.category}
            </p>
          )}
          {renderObjective(learningObjectives.terminalObjective, "terminal", 0)}
          {(learningObjectives.enablingObjectives || []).map((obj, idx) =>
            renderObjective(obj, "enabling", idx)
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="generator-button"
            style={{ marginTop: 10 }}
          >
            {saving ? "Saving..." : "Save Objectives"}
          </button>
        </div>
      )}
    </div>
  );
};

export default LearningObjectivesGenerator;

LearningObjectivesGenerator.propTypes = {
  projectBrief: PropTypes.string.isRequired,
  businessGoal: PropTypes.string.isRequired,
  audienceProfile: PropTypes.string.isRequired,
  projectConstraints: PropTypes.string.isRequired,
  selectedModality: PropTypes.string.isRequired,
  totalSteps: PropTypes.number.isRequired,
  onBack: PropTypes.func.isRequired,
};
