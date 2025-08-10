import { useState, useEffect, useRef, useCallback } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useSearchParams } from "react-router-dom";
import { app, auth } from "../firebase.js";
import { saveInitiative } from "../utils/initiatives.js";
import { useProject } from "../context/ProjectContext.jsx";
import PropTypes from "prop-types";
import "./AIToolsGenerators.css";
import mermaid from "mermaid";


mermaid.initialize({ startOnLoad: false });

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

<<<<<<< HEAD:src/components/LearningDesignDocument.jsx
  const handleGenerate = async () => {
=======
  const handleGenerate = useCallback(async () => {
>>>>>>> main:src/components/LearningPathVisualizer.jsx
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
  }, [
    callGenerate,
    projectBrief,
    businessGoal,
    audienceProfile,
    projectConstraints,
    selectedModality,
    learningObjectives,
    courseOutline,
    initiativeId,
    setLearningPath,
  ]);

  const hasGenerated = useRef(false);

  useEffect(() => {
    if (!learningPath && !hasGenerated.current) {
      hasGenerated.current = true;
      handleGenerate();
    }
  }, [learningPath, handleGenerate]);

  useEffect(() => {
    if (!learningPath) return;
    let cancelled = false;

    const renderMermaid = async () => {
      try {
        await mermaid.parse(learningPath);
        const { svg: renderedSvg } = await mermaid.render(
          "learning-path-diagram",
          learningPath
        );
        if (!cancelled) setSvg(renderedSvg);
      } catch {
        if (!cancelled) {
          setSvg("");
          setError("Failed to render learning path diagram.");
        }
      }
    };

    renderMermaid();
    return () => {
      cancelled = true;
    };
  }, [learningPath]);

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
<<<<<<< HEAD:src/components/LearningDesignDocument.jsx
      <h3>Learning Design Document</h3>
      {!learningDesignDocument && (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="generator-button"
        >
          {loading ? "Generating..." : "Generate Document"}
        </button>
      )}
=======
      <h3>Learning Path Visualization</h3>
      {loading && <p>Generating learning path...</p>}
>>>>>>> main:src/components/LearningPathVisualizer.jsx
      {error && <p className="generator-error">{error}</p>}
      {learningDesignDocument && (
        <div className="generator-result" style={{ textAlign: "left" }}>
<<<<<<< HEAD:src/components/LearningDesignDocument.jsx
          <textarea
            value={learningDesignDocument}
            onChange={(e) => setLearningDesignDocument(e.target.value)}
            style={{ width: "100%", minHeight: "300px" }}
          />
=======
          {svg && <div dangerouslySetInnerHTML={{ __html: svg }} />}
          {error && !svg && <pre>{learningPath}</pre>}
>>>>>>> main:src/components/LearningPathVisualizer.jsx
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
