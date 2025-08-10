import { useState, useEffect, useRef, useCallback } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useSearchParams } from "react-router-dom";
import { app, auth } from "../firebase.js";
import { saveInitiative } from "../utils/initiatives.js";
import { useProject } from "../context/ProjectContext.jsx";
import PropTypes from "prop-types";
import "./AIToolsGenerators.css";
import mermaid from "@mermaid-js/mermaid";

mermaid.initialize({ startOnLoad: false });

const LearningPathVisualizer = ({
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
  const { learningPath, setLearningPath } = useProject();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [svg, setSvg] = useState("");
  const functions = getFunctions(app, "us-central1");
  const callGenerate = httpsCallable(functions, "generateLearningPath");
  const [searchParams] = useSearchParams();
  const initiativeId = searchParams.get("initiativeId") || "default";

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError("");
    setLearningPath("");
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
      setLearningPath(data.diagram);
      const uid = auth.currentUser?.uid;
      if (uid) {
        await saveInitiative(uid, initiativeId, { learningPath: data.diagram });
      }
    } catch (err) {
      console.error("Error generating learning path:", err);
      setError(err?.message || "Error generating learning path.");
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
      <h3>Learning Path Visualization</h3>
      {loading && <p>Generating learning path...</p>}
      {error && <p className="generator-error">{error}</p>}
      {learningPath && (
        <div className="generator-result" style={{ textAlign: "left" }}>
          {svg && <div dangerouslySetInnerHTML={{ __html: svg }} />}
          {error && !svg && <pre>{learningPath}</pre>}
        </div>
      )}
    </div>
  );
};

export default LearningPathVisualizer;

LearningPathVisualizer.propTypes = {
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

