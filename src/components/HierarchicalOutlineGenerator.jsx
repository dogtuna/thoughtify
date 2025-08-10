import { useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useSearchParams } from "react-router-dom";
import { app, auth } from "../firebase.js";
import { saveInitiative } from "../utils/initiatives.js";
import { useProject } from "../context/ProjectContext.jsx";
import PropTypes from "prop-types";
import "./AIToolsGenerators.css";

const HierarchicalOutlineGenerator = ({
  projectBrief,
  businessGoal,
  audienceProfile,
  projectConstraints,
  selectedModality,
  learningObjectives,
  totalSteps,
  onBack,
}) => {
  const { courseOutline, setCourseOutline } = useProject();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const functions = getFunctions(app, "us-central1");
  const callGenerate = httpsCallable(functions, "generateHierarchicalOutline");
  const [searchParams] = useSearchParams();
  const initiativeId = searchParams.get("initiativeId") || "default";

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    setCourseOutline("");
    try {
      const { data } = await callGenerate({
        projectBrief,
        businessGoal,
        audienceProfile,
        projectConstraints,
        selectedModality,
        learningObjectives,
      });
      setCourseOutline(data.outline);
      const uid = auth.currentUser?.uid;
      if (uid) {
        await saveInitiative(uid, initiativeId, { courseOutline: data.outline });
      }
    } catch (err) {
      console.error("Error generating hierarchical outline:", err);
      setError(err?.message || "Error generating hierarchical outline.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="generator-result">
      <div className="progress-indicator">Step 7 of {totalSteps}</div>
      <button
        type="button"
        onClick={onBack}
        className="generator-button"
        style={{ marginBottom: 10 }}
      >
        Back to Step 6
      </button>
      <h3>Hierarchical Course Outline</h3>
      {!courseOutline && (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="generator-button"
        >
          {loading ? "Generating..." : "Generate Outline"}
        </button>
      )}
      {error && <p className="generator-error">{error}</p>}
      {courseOutline && (
        <div className="generator-result" style={{ textAlign: "left" }}>
          <pre>{courseOutline}</pre>
        </div>
      )}
    </div>
  );
};

export default HierarchicalOutlineGenerator;

HierarchicalOutlineGenerator.propTypes = {
  projectBrief: PropTypes.string.isRequired,
  businessGoal: PropTypes.string.isRequired,
  audienceProfile: PropTypes.string.isRequired,
  projectConstraints: PropTypes.string.isRequired,
  selectedModality: PropTypes.string.isRequired,
  learningObjectives: PropTypes.object.isRequired,
  totalSteps: PropTypes.number.isRequired,
  onBack: PropTypes.func.isRequired,
};
