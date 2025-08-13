// src/StoryboardGenerator.jsx

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../firebase.js";
import { useProject } from "../context/ProjectContext.jsx";
import "./AIToolsGenerators.css";

const StoryboardGenerator = () => {
  const [targetAudience, setTargetAudience] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.body.classList.toggle("pulsing", loading);
    return () => document.body.classList.remove("pulsing");
  }, [loading]);

  const { selectedModule, storyboard, setStoryboard } = useProject();
  const navigate = useNavigate();

  // Initialize Firebase Functions
  const functionsInstance = getFunctions(app);
  // Create a callable reference to the "generateStoryboard" function.
  const generateStoryboard = httpsCallable(
    functionsInstance,
    "generateStoryboard"
  );

  const handleGenerate = async () => {
    if (!selectedModule) return;

    setLoading(true);
    setError("");
    setStoryboard("");

    try {
      const result = await generateStoryboard({
        topic: selectedModule,
        targetAudience,
      });
      setStoryboard(result.data.storyboard);
    } catch (err) {
      console.error("Error generating storyboard:", err);
      setError(err.message || "Error generating storyboard.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="initiative-card">
      <h2>Storyboard Generator</h2>
      <p>Module: {selectedModule || "No module selected"}</p>
      <input
        type="text"
        placeholder="Optional: Enter target audience, e.g., 'undergraduate students'"
        value={targetAudience}
        onChange={(e) => setTargetAudience(e.target.value)}
        className="generator-input"
      />
      <button
        onClick={handleGenerate}
        disabled={loading || !selectedModule}
        className="generator-button"
      >
        {loading ? "Generating..." : "Generate Storyboard"}
      </button>
      {error && <p className="generator-error">{error}</p>}
      {loading && <div className="spinner"></div>}
      {storyboard && (
        <div className="generator-result">
          <h3>Generated Storyboard</h3>
          <pre>{storyboard}</pre>
        </div>
      )}
      {storyboard && (
        <button
          className="generator-button"
          onClick={() => navigate("/ai-tools/assessment")}
        >
          Next: Assessment
        </button>
      )}
    </div>
  );
};

export default StoryboardGenerator;
