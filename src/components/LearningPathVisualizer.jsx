import { useState, useEffect } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useSearchParams } from "react-router-dom";
import { app, auth } from "../firebase.js";
import { saveInitiative } from "../utils/initiatives.js";
import { useProject } from "../context/ProjectContext.jsx";
import PropTypes from "prop-types";
import "./AIToolsGenerators.css";

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

  useEffect(() => {
    if (!learningPath) return;
    let cancelled = false;

    const renderMermaid = async () => {
      try {
        if (!window.mermaid) {
          await new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src =
              "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";
            script.onload = resolve;
            script.onerror = reject;
            document.body.appendChild(script);
          });
          window.mermaid.initialize({ startOnLoad: false });
        }
        window.mermaid.render(
          "learning-path-diagram",
          learningPath,
          (svgCode) => {
            if (!cancelled) setSvg(svgCode);
          }
        );
      } catch {
        if (!cancelled) setSvg("");
      }
    };

    renderMermaid();
    return () => {
      cancelled = true;
    };
  }, [learningPath]);

  const handleGenerate = async () => {
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
  };

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
      {!learningPath && (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="generator-button"
        >
          {loading ? "Generating..." : "Generate Learning Path"}
        </button>
      )}
      {error && <p className="generator-error">{error}</p>}
      {learningPath && (
        <div className="generator-result" style={{ textAlign: "left" }}>
          {svg ? (
            <div dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <pre>{learningPath}</pre>
          )}
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

