import { useEffect, useState, useCallback } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useSearchParams } from "react-router-dom";
import { app, auth } from "../firebase.js";
import { saveContentAssets } from "../utils/initiatives.js";
import { useProject } from "../context/ProjectContext.jsx";
import "./AIToolsGenerators.css";

const TOTAL_STEPS = 9;

const COMPONENTS = [
  { key: "lessonContent", label: "Lesson Content" },
  { key: "videoScripts", label: "Video Scripts" },
  { key: "facilitatorGuides", label: "Facilitator Guides" },
  { key: "participantWorkbooks", label: "Participant Workbooks" },
  { key: "knowledgeBaseArticles", label: "Knowledge Base Articles" },
];

const ContentAssetGenerator = () => {
  const {
    learningDesignDocument,
    draftContent,
    setDraftContent,
    mediaAssets,
    setMediaAssets,
  } = useProject();

  const [error, setError] = useState("");
  const [status, setStatus] = useState(() =>
    COMPONENTS.reduce((acc, c) => ({ ...acc, [c.key]: "pending" }), {})
  );
  const [viewing, setViewing] = useState(null);
  const [started, setStarted] = useState(false);
  const isLoading = Object.values(status).some((s) => s === 'loading');
  const [searchParams] = useSearchParams();
  const initiativeId = searchParams.get("initiativeId") || "default";

  const functions = getFunctions(app, "us-central1");
  const callGenerate = httpsCallable(functions, "generateContentAssets");

  const isTimeoutError = (err) => {
    const message = err?.message || "";
    return err?.code === "deadline-exceeded" || /504|timeout/i.test(message);
  };

  const handleGenerate = useCallback(async () => {
    if (!learningDesignDocument) return;
    setStarted(true);
    setError("");
    setDraftContent({});
    setMediaAssets([]);
    const allDrafts = {};
    let allAssets = [];

    for (const item of COMPONENTS) {
      setStatus((prev) => ({ ...prev, [item.key]: "loading" }));
      try {
        const { data } = await callGenerate({
          ldd: learningDesignDocument,
          component: item.key,
        });
        const draftArr = data?.drafts?.[item.key] || data?.draft || [];
        allDrafts[item.key] = draftArr;
        allAssets = allAssets.concat(data?.mediaAssets || []);
        setDraftContent((prev) => ({ ...prev, [item.key]: draftArr }));
        setMediaAssets((prev) => [...prev, ...(data?.mediaAssets || [])]);
        setStatus((prev) => ({ ...prev, [item.key]: "done" }));
      } catch (err) {
        console.error("Error generating content assets:", err);
        setStatus((prev) => ({ ...prev, [item.key]: "error" }));
        setError(
          isTimeoutError(err)
            ? "The generation request timed out. Please try again."
            : err?.message || "Error generating content assets."
        );
        break;
      }
    }

    const uid = auth.currentUser?.uid;
    if (uid) {
      try {
        await saveContentAssets(uid, initiativeId, allDrafts, allAssets);
      } catch (e) {
        console.error("Failed to save content assets:", e);
      }
    }
  }, [learningDesignDocument, initiativeId, callGenerate, setDraftContent, setMediaAssets]);

  useEffect(() => {
    if (learningDesignDocument && !started) {
      handleGenerate();
    }
  }, [learningDesignDocument, started, handleGenerate]);

  useEffect(() => {
    document.body.classList.toggle("pulsing", isLoading);
    return () => document.body.classList.remove("pulsing");
  }, [isLoading]);

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
          `- **${asset.type || ""}**: ${asset.description || ""} ${usage}`.trim()
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

  const formatType = (type) => {
    const item = COMPONENTS.find((c) => c.key === type);
    return item ? item.label : type;
  };

  const hasResults =
    Object.keys(draftContent || {}).length > 0 || mediaAssets.length > 0;

  return (
    <div className="initiative-card">
      <div className="progress-indicator">Step 9 of {TOTAL_STEPS}</div>
      <h2>Content & Asset Generator</h2>
      <p className="generator-info">
        We are generating each item below from your Learning Design Document. A
        spinner indicates the current item being produced and a checkmark means
        it is complete. Click any completed item to view its draft.
      </p>

      {viewing ? (
        <div className="generator-result">
          <button
            onClick={() => setViewing(null)}
            className="generator-button"
            style={{ marginBottom: "10px" }}
          >
            Back
          </button>
          <h3>{formatType(viewing)}</h3>
          <ul>
            {(draftContent[viewing] || []).map((item, idx) => (
              <li key={idx}>
                <pre>
                  {typeof item === "string"
                    ? item
                    : JSON.stringify(item, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ul className="generation-list">
          {COMPONENTS.map((item) => (
            <li
              key={item.key}
              className={`generation-item ${
                status[item.key] === "done" ? "done" : ""
              }`}
              onClick={() =>
                status[item.key] === "done" && setViewing(item.key)
              }
            >
              <span>{item.label}</span>
              {status[item.key] === "loading" && (
                <span className="spinner small"></span>
              )}
              {status[item.key] === "done" && (
                <span className="checkmark">✓</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="generator-error">{error}</p>}

      {!viewing && hasResults && (
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
    </div>
  );
};

export default ContentAssetGenerator;

