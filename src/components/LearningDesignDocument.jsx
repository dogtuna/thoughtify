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
  const [sections, setSections] = useState([]);
  const [activeTab, setActiveTab] = useState(0);
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
      setLearningDesignDocument(baseDocument);
    }
  }, [baseDocument, setLearningDesignDocument]);

  useEffect(() => {
    if (learningDesignDocument) {
      const lines = learningDesignDocument.split("\n");
      const parsed = [];
      let current = null;
      lines.forEach((line) => {
        if (line.startsWith("## ")) {
          if (current) parsed.push(current);
          current = { title: line.replace(/^##\s*/, ""), content: "" };
        } else if (current) {
          current.content += `${line}\n`;
        }
      });
      if (current) parsed.push(current);
      setSections(parsed);
      setActiveTab(0);
    }
  }, [learningDesignDocument]);

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
    <div className="design-doc-shell">
      <div className="design-doc-panel">
        <header className="design-doc-header">
          <h1>Learning Design Document</h1>
        </header>

        {!learningDesignDocument && !error && (
          <div className="design-doc-placeholder">
            <p>{loading ? "Generating..." : "Preparing document..."}</p>
          </div>
        )}

        {error && (
          <div className="design-doc-placeholder">
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

        {sections.length > 0 && (
          <div className="design-doc-main">
            <nav className="design-doc-nav">
              <ul>
                {sections.map((sec, idx) => (
                  <li key={sec.title}>
                    <a
                      href="#"
                      className={`nav-link ${idx === activeTab ? "active" : ""}`}
                      onClick={(e) => {
                        e.preventDefault();
                        setActiveTab(idx);
                      }}
                    >
                      {sec.title.replace(/^[0-9]+\.\s*/, "")}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <main
              className="design-doc-content"
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(
                  `## ${sections[activeTab].title}\n${sections[activeTab].content}`
                ),
              }}
            />
          </div>
        )}

        <div className="button-row">
          <button
            type="button"
            onClick={onBack}
            className="generator-button back-button"
          >
            Back
          </button>
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
    </div>
  );
};

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

export default LearningDesignDocument;
