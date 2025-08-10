import { useState, useEffect } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useSearchParams } from "react-router-dom";
import { app, auth } from "../firebase.js";
import { saveInitiative } from "../utils/initiatives.js";
import { useProject } from "../context/ProjectContext.jsx";
import PropTypes from "prop-types";
import "./AIToolsGenerators.css";

const LearningDesignDocument = ({
  projectBrief,
  businessGoal,
  audienceProfile,
  projectConstraints,
  selectedModality,
  learningObjectives,
  courseOutline,
  totalSteps,
  onBack,
}) => {
  const { learningDesignDocument, setLearningDesignDocument } = useProject();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const functions = getFunctions(app, "us-central1");
  const callGenerate = httpsCallable(functions, "generateLearningDesignDocument");
  const [searchParams] = useSearchParams();
  const initiativeId = searchParams.get("initiativeId") || "default";

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    setLearningDesignDocument("");
    try {
      const { data } = await callGenerate({
        projectBrief,
        businessGoal,
        audienceProfile,
        projectConstraints,
        selectedModality,
        learningObjectives,
        courseOutline,
      });
      setLearningDesignDocument(data.document);
    } catch (err) {
      console.error("Error generating learning design document:", err);
      setError(err?.message || "Error generating learning design document.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!learningDesignDocument) {
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learningDesignDocument]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (uid) {
      saveInitiative(uid, initiativeId, { learningDesignDocument });
    }
  }, [learningDesignDocument, initiativeId]);

  return (
    <div className="generator-result">
      <div className="progress-indicator">Step 8 of {totalSteps}</div>
      <button
        type="button"
        onClick={onBack}
        className="generator-button"
        style={{ marginBottom: 10 }}
      >
        Back to Step 7
      </button>
      <h3>Learning Design Document</h3>
      {!learningDesignDocument && !error && (
        <p>{loading ? "Generating..." : "Preparing document..."}</p>
      )}
      {error && (
        <div>
          <p className="generator-error">{error}</p>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="generator-button"
          >
            {loading ? "Generating..." : "Try Again"}
          </button>
        </div>
      )}
      {learningDesignDocument && (
        <div className="generator-result" style={{ textAlign: "left" }}>
          <textarea
            value={learningDesignDocument}
            onChange={(e) => setLearningDesignDocument(e.target.value)}
            style={{ width: "100%", minHeight: "300px" }}
          />
        </div>
      )}
    </div>
  );
};

export default LearningDesignDocument;

LearningDesignDocument.propTypes = {
  projectBrief: PropTypes.string.isRequired,
  businessGoal: PropTypes.string.isRequired,
  audienceProfile: PropTypes.string.isRequired,
  projectConstraints: PropTypes.string.isRequired,
  selectedModality: PropTypes.string.isRequired,
  learningObjectives: PropTypes.object.isRequired,
  courseOutline: PropTypes.string.isRequired,
  totalSteps: PropTypes.number.isRequired,
  onBack: PropTypes.func.isRequired,
};
