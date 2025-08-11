import { useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useSearchParams } from "react-router-dom";
import { app, auth } from "../firebase.js";
import { saveContentAssets } from "../utils/initiatives.js";
import { useProject } from "../context/ProjectContext.jsx";
import "./AIToolsGenerators.css";

const TOTAL_STEPS = 9;

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
  const [searchParams] = useSearchParams();
  const initiativeId = searchParams.get("initiativeId") || "default";

  const functions = getFunctions(app, "us-central1");
  const callGenerate = httpsCallable(functions, "generateContentAssets");

  const MAX_RETRIES = 1;

  const isTimeoutError = (err) => {
    const message = err?.message || "";
    return err?.code === "deadline-exceeded" || /504|timeout/i.test(message);
  };

  const handleGenerate = async () => {
    if (!learningDesignDocument) return;
    setLoading(true);
    setError("");
    setDraftContent({});
    setMediaAssets([]);

    let attempt = 0;
    while (attempt <= MAX_RETRIES) {
      try {
        const { data } = await callGenerate(learningDesignDocument);
        setDraftContent(data.drafts || {});
        setMediaAssets(data.mediaAssets || []);
        const uid = auth.currentUser?.uid;
        if (uid) {
          await saveContentAssets(
            uid,
            initiativeId,
            data.drafts || {},
            data.mediaAssets || []
          );
        }
        break;
      } catch (err) {
        console.error("Error generating content assets:", err);
        if (isTimeoutError(err) && attempt < MAX_RETRIES) {
          attempt += 1;
          continue;
        }
        setError(
          isTimeoutError(err)
            ? "The generation request timed out. Please try again."
            : err?.message || "Error generating content assets."
        );
        break;
      }
    }

    setLoading(false);
  };

  const handleExport = (format = "json") => {
    const data = {
      ...draftContent,
      mediaAssets: mediaAssets || [],
    };

    let content = "";
    let type = "application/json";
    let extension = "json";

    if (format === "md") {
      const mdLines = ["# Draft Content"];
      Object.entries(draftContent || {}).forEach(([key, items]) => {
        mdLines.push(`\n## ${formatType(key)}`);
        (items || []).forEach((item) => {
          if (typeof item === "string") {
            mdLines.push(`- ${item}`);
          } else {
            mdLines.push("- ```json\n" + JSON.stringify(item, null, 2) + "\n```");
          }
        });
      });

      mdLines.push("\n# Media Assets");
      (mediaAssets || []).forEach((asset) => {
        const usage = asset.usageNotes || asset.usage || "";
        mdLines.push(
          `- **${asset.type || ""}**: ${asset.description || ""} ${usage}`.trim(),
        );
      });

      content = mdLines.join("\n");
      type = "text/markdown";
      extension = "md";
    } else {
      content = JSON.stringify(data, null, 2);
    }

    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `content-assets.${extension}`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
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
      <div className="progress-indicator">Step 9 of {TOTAL_STEPS}</div>
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

      {(draftTypes.length > 0 || mediaAssets.length > 0) && (
        <div style={{ marginTop: "10px" }}>
          <button
            onClick={() => handleExport("json")}
            className="generator-button"
            style={{ marginRight: "10px" }}
          >
            Export JSON
          </button>
          <button
            onClick={() => handleExport("md")}
            className="generator-button"
          >
            Export Markdown
          </button>
        </div>
      )}

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

