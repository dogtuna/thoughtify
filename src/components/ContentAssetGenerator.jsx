import { useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../firebase.js";
import { useProject } from "../context/ProjectContext.jsx";
import "./AIToolsGenerators.css";

const ContentAssetGenerator = () => {
  const {
    learningDesignDocument,
    draftContent,
    setDraftContent,
    mediaAssets,
    setMediaAssets,
  } = useProject();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const functions = getFunctions(app, "us-central1");
  const callGenerate = httpsCallable(functions, "generateContentAssets");

  const handleGenerate = async () => {
    if (!learningDesignDocument) return;
    setLoading(true);
    setError("");
    setDraftContent({});
    setMediaAssets([]);
    try {
      const { data } = await callGenerate(learningDesignDocument);
      setDraftContent(data.drafts || {});
      setMediaAssets(data.mediaAssets || []);
    } catch (err) {
      console.error("Error generating content assets:", err);
      setError(err?.message || "Error generating content assets.");
    } finally {
      setLoading(false);
    }
  };

  const draftTypes = Object.keys(draftContent || {});

  const formatType = (type) => {
    switch (type) {
      case "lessonContent":
        return "Lesson Content";
      case "videoScripts":
        return "Video Scripts";
      case "facilitatorGuides":
        return "Facilitator Guides";
      case "participantWorkbooks":
        return "Participant Workbooks";
      case "knowledgeBaseArticles":
        return "Knowledge Base Articles";
      default:
        return type;
    }
  };

  return (
    <div className="generator-container">
      <h2>Content & Asset Generator</h2>
      <button
        onClick={handleGenerate}
        disabled={loading || !learningDesignDocument}
        className="generator-button"
      >
        {loading ? "Generating..." : "Generate Content & Assets"}
      </button>
      {error && <p className="generator-error">{error}</p>}
      {loading && <div className="spinner"></div>}

      {draftTypes.length > 0 && (
        <div className="generator-result">
          <h3>Draft Content</h3>
          {draftTypes.map((type) => (
            <details key={type} style={{ marginBottom: "1em" }}>
              <summary style={{ cursor: "pointer", fontWeight: "bold" }}>
                {formatType(type)}
              </summary>
              <ul>
                {(draftContent[type] || []).map((item, idx) => (
                  <li key={idx}>
                    <pre>
                      {typeof item === "string"
                        ? item
                        : JSON.stringify(item, null, 2)}
                    </pre>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}

      {mediaAssets.length > 0 && (
        <div className="generator-result">
          <h3>Media Assets</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Type</th>
                <th style={{ textAlign: "left" }}>Description</th>
                <th style={{ textAlign: "left" }}>Usage Notes</th>
              </tr>
            </thead>
            <tbody>
              {mediaAssets.map((asset, idx) => (
                <tr key={idx}>
                  <td style={{ verticalAlign: "top" }}>{asset.type || ""}</td>
                  <td style={{ verticalAlign: "top" }}>{asset.description || ""}</td>
                  <td style={{ verticalAlign: "top" }}>
                    {asset.usageNotes || asset.usage || ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ContentAssetGenerator;

