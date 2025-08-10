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

const FIELDS = {
  ABCD: ["audience", "behavior", "condition", "degree"],
  Bloom: ["audience", "behavior", "condition", "degree"],
  Mager: ["performance", "condition", "criterion"],
  SMART: ["specific", "measurable", "achievable", "relevant", "timeBound"],
  Gagne: ["audience", "behavior", "condition", "degree"],
};

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [approach, setApproach] = useState("ABCD");
  const [bloomLevel, setBloomLevel] = useState("Analyze");

  const functions = getFunctions(app, "us-central1");
  // Use a distinct variable name to avoid clashing with the exported Cloud
  // Function identifier and prevent duplicate declarations during bundling.
  const callGenerateLearningObjectives = httpsCallable(
    functions,
    "generateLearningObjectives"
  );

  const [searchParams] = useSearchParams();
  const initiativeId = searchParams.get("initiativeId") || "default";

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await callGenerateLearningObjectives({
        projectBrief,
        businessGoal,
        audienceProfile,
        projectConstraints,
        selectedModality,
        approach,
        bloomLevel,
      });
      setLearningObjectives(data);
      const uid = auth.currentUser?.uid;
      if (uid) {
        await saveInitiative(uid, initiativeId, { learningObjectives: data });
      }
    } catch (err) {
      console.error("Error generating learning objectives:", err);
      setError(err?.message || "Error generating learning objectives.");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (type, index, field, value) => {
    setLearningObjectives((prev) => {
      const updated = { ...prev };
      if (type === "terminal") {
        updated.terminalObjective = {
          ...updated.terminalObjective,
          [field]: value,
        };
      } else {
        const list = [...(updated.enablingObjectives || [])];
        list[index] = { ...list[index], [field]: value };
        updated.enablingObjectives = list;
      }
      return updated;
    });
  };
  const handleMetaChange = (field, value) => {
    setLearningObjectives((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !learningObjectives) return;
    setSaving(true);
    try {
      await saveInitiative(uid, initiativeId, {
        learningObjectives,
      });
    } catch (err) {
      console.error("Error saving learning objectives:", err);
      setError(err?.message || "Error saving learning objectives.");
    } finally {
      setSaving(false);
    }
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
            <label>
              Category
              <input
                className="generator-input"
                value={learningObjectives.category || ""}
                onChange={(e) => handleMetaChange("category", e.target.value)}
              />
            </label>
          )}
          <h4>Terminal Objective</h4>
          {FIELDS[learningObjectives.approach || approach].map((field) => (
            <label key={`terminal-${field}`}>
              {field.charAt(0).toUpperCase() + field.slice(1)}
              <textarea
                className="generator-input"
                rows={2}
                value={
                  learningObjectives?.terminalObjective?.[field] || ""
                }
                onChange={(e) =>
                  handleChange("terminal", 0, field, e.target.value)
                }
              />
            </label>
          ))}
          {Array.isArray(learningObjectives.enablingObjectives) &&
            learningObjectives.enablingObjectives.map((obj, idx) => (
              <div key={idx}>
                <h4>Enabling Objective {idx + 1}</h4>
                {FIELDS[learningObjectives.approach || approach].map(
                  (field) => (
                    <label key={`enabling-${idx}-${field}`}>
                      {field.charAt(0).toUpperCase() + field.slice(1)}
                      <textarea
                        className="generator-input"
                        rows={2}
                        value={obj?.[field] || ""}
                        onChange={(e) =>
                          handleChange("enabling", idx, field, e.target.value)
                        }
                      />
                    </label>
                  )
                )}
              </div>
            ))}
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

