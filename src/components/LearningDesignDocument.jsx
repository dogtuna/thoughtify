import { useState, useEffect } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useSearchParams, useNavigate } from "react-router-dom";
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
  sourceMaterials,
  onBack,
}) => {
  const { learningDesignDocument, setLearningDesignDocument } = useProject();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [baseDocument, setBaseDocument] = useState("");
  const [includeOutline, setIncludeOutline] = useState(false);
  const functions = getFunctions(app, "us-central1");
  const callGenerate = httpsCallable(functions, "generateLearningDesignDocument");
  const [searchParams] = useSearchParams();
  const initiativeId = searchParams.get("initiativeId") || "default";

  const renderMarkdown = (text) => {
    if (!text) return "";
    let html = text
      .replace(/^###### (.*)$/gm, "<h6>$1</h6>")
      .replace(/^##### (.*)$/gm, "<h5>$1</h5>")
      .replace(/^#### (.*)$/gm, "<h4>$1</h4>")
      .replace(/^### (.*)$/gm, "<h3>$1</h3>")
      .replace(/^## (.*)$/gm, "<h2>$1</h2>")
      .replace(/^# (.*)$/gm, "<h1>$1</h1>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n\n/g, "</p><p>")
      .replace(/\n/g, "<br/>");
    return `<p>${html}</p>`;
  };

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
        sourceMaterial: sourceMaterials.map((f) => f.content).join("\n"),
      });
      setBaseDocument(data.document);
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
    } else {
      setBaseDocument(learningDesignDocument);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (baseDocument) {
      const fullDoc = includeOutline
        ? `${baseDocument}\n\n## Full Course Outline\n\n${courseOutline}`
        : baseDocument;
      setLearningDesignDocument(fullDoc);
    }
  }, [baseDocument, includeOutline, courseOutline, setLearningDesignDocument]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (uid) {
      saveInitiative(uid, initiativeId, { learningDesignDocument });
    }
  }, [learningDesignDocument, initiativeId]);

  const handleManualSave = async () => {
    const uid = auth.currentUser?.uid;
    if (uid) {
      await saveInitiative(uid, initiativeId, { learningDesignDocument });
    }
  };

  const handleDownload = () => {
    const blob = new Blob([learningDesignDocument], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "learning-design-document.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleNext = async () => {
    await handleManualSave();
    navigate(`/ai-tools/content-assets?initiativeId=${initiativeId}`);
  };

  return (
    <div className="generator-result">
      <div className="button-row">
        <button
          type="button"
          onClick={onBack}
          className="generator-button back-button"
        >
          Back
        </button>
      </div>
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
            className="generator-button next-button"
          >
            {loading ? "Generating..." : "Try Again"}
          </button>
        </div>
      )}
      {learningDesignDocument && (
        <div
          className="design-doc-display"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(learningDesignDocument) }}
        />
      )}
      {learningDesignDocument && (
        <label style={{ display: "block", marginTop: "10px" }}>
          <input
            type="checkbox"
            checked={includeOutline}
            onChange={(e) => setIncludeOutline(e.target.checked)}
          />
          Include full outline
        </label>
      )}
    <div className="button-row">
      <button
        type="button"
        onClick={handleManualSave}
        className="generator-button save-button"
      >
        Save
      </button>
      {learningDesignDocument && (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="generator-button"
        >
          {loading ? "Generating..." : "Regenerate Document"}
        </button>
      )}
      {learningDesignDocument && (
        <button
          type="button"
          onClick={handleDownload}
          className="generator-button"
        >
          Download
        </button>
      )}
      <button
        type="button"
        onClick={handleNext}
        className="generator-button next-button"
      >
        Next: Content & Assets
      </button>
    </div>
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
  sourceMaterials: PropTypes.array.isRequired,
  onBack: PropTypes.func.isRequired,
};
