import { useState, useEffect } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useSearchParams, useNavigate } from "react-router-dom";
import { app, auth } from "../firebase.js";
import { saveInitiative } from "../utils/initiatives.js";
import { useProject } from "../context/ProjectContext.jsx";
import { omitEmptyStrings } from "../utils/omitEmptyStrings.js";
import PropTypes from "prop-types";
import "./AIToolsGenerators.css";

const LearningDesignDocument = ({
  projectName,
  projectBrief,
  businessGoal,
  audienceProfile,
  projectConstraints,
  keyContacts,
  selectedModality,
  blendModalities = [],
  learningObjectives,
  courseOutline,
  trainingPlan,
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

  useEffect(() => {
    document.body.classList.add("design-doc-page");
    return () => document.body.classList.remove("design-doc-page");
  }, []);

  useEffect(() => {
    document.body.classList.toggle("pulsing", loading);
    return () => document.body.classList.remove("pulsing");
  }, [loading]);

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
      const { data } = await callGenerate(
        omitEmptyStrings({
          projectBrief,
          businessGoal,
          audienceProfile,
          projectConstraints,
          keyContacts,
          selectedModality,
          blendModalities,
          learningObjectives,
          courseOutline,
          trainingPlan,
          sourceMaterial: sourceMaterials.map((f) => f.content).join("\n"),
        })
      );
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
      const regex = /^##\s+(.*)$/gm;
      const parsed = [];
      let match;
      let lastIndex = 0;
      while ((match = regex.exec(learningDesignDocument)) !== null) {
        if (parsed.length) {
          parsed[parsed.length - 1].content = learningDesignDocument
            .slice(lastIndex, match.index)
            .trim();
        }
        parsed.push({ title: match[1].trim(), content: "" });
        lastIndex = regex.lastIndex;
      }
      if (parsed.length) {
        parsed[parsed.length - 1].content = learningDesignDocument
          .slice(lastIndex)
          .trim();
      }
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

  const tabs = [
    {
      label: "Summary",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      ),
    },
    {
      label: "Audience",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      label: "Objectives",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      ),
    },
    {
      label: "Strategy",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
    },
    {
      label: "Blueprint",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18" />
          <path d="M9 21V9" />
        </svg>
      ),
    },
    {
      label: "Assessment",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      ),
    },
  ];

  const tabSections = tabs.map((tab) => {
    const match = sections.find((s) =>
      s.title.toLowerCase().includes(tab.label.toLowerCase())
    );
    return match || { title: tab.label, content: "" };
  });

  return (
    <div className="design-doc-shell">
      <div className="design-doc-panel">
        <header className="design-doc-header">
          <div className="design-doc-title">
            <h1>{projectName}</h1>
            <p>Learning Design Document</p>
          </div>
          <div className="design-doc-actions">
            {learningDesignDocument && (
              <button
                type="button"
                onClick={handleDownload}
                className="generator-button next-button"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download PDF
              </button>
            )}
          </div>
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

        {learningDesignDocument && (
          <div className="design-doc-main">
            <nav className="design-doc-nav">
              <ul>
                {tabs.map((tab, idx) => (
                  <li key={tab.label}>
                    <a
                      href="#"
                      className={`nav-link ${idx === activeTab ? "active" : ""}`}
                      onClick={(e) => {
                        e.preventDefault();
                        setActiveTab(idx);
                      }}
                    >
                      {tab.icon}
                      {tab.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <main
              className="design-doc-content"
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(
                  `## ${tabSections[activeTab].title}\n${tabSections[activeTab].content}`
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
  projectName: PropTypes.string.isRequired,
  projectBrief: PropTypes.string.isRequired,
  businessGoal: PropTypes.string.isRequired,
  audienceProfile: PropTypes.string.isRequired,
  projectConstraints: PropTypes.string.isRequired,
  keyContacts: PropTypes.arrayOf(
    PropTypes.shape({ name: PropTypes.string, role: PropTypes.string })
  ).isRequired,
  selectedModality: PropTypes.string.isRequired,
  blendModalities: PropTypes.array,
  learningObjectives: PropTypes.object,
  courseOutline: PropTypes.string,
  trainingPlan: PropTypes.string,
  sourceMaterials: PropTypes.array.isRequired,
  onBack: PropTypes.func.isRequired,
};

export default LearningDesignDocument;
