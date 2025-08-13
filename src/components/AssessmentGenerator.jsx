// src/AssessmentGenerator.jsx

import { useState, useEffect } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../firebase.js";
import { useProject } from "../context/ProjectContext.jsx";
import "./AIToolsGenerators.css";

const AssessmentGenerator = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.body.classList.toggle("pulsing", loading);
    return () => document.body.classList.remove("pulsing");
  }, [loading]);

  const { selectedModule, assessment, setAssessment } = useProject();

  // Initialize the Functions instance from your Firebase app.
  const functionsInstance = getFunctions(app);
  // Create a callable reference to the "generateAssessment" function.
  const generateAssessment = httpsCallable(
    functionsInstance,
    "generateAssessment"
  );

  const handleGenerate = async () => {
    if (!selectedModule) return;

    setLoading(true);
    setError("");
    setAssessment("");

    try {
      const result = await generateAssessment({ topic: selectedModule });
      setAssessment(result.data.assessment);
    } catch (err) {
      console.error("Error generating assessment:", err);
      setError(err.message || "Error generating assessment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="initiative-card">
      <h2>Assessment Generator</h2>
      <p>Module: {selectedModule || "No module selected"}</p>
      <button
        onClick={handleGenerate}
        disabled={loading || !selectedModule}
        className="generator-button"
      >
        {loading ? "Generating..." : "Generate Assessment"}
      </button>
      {error && <p className="generator-error">{error}</p>}
      {loading && <div className="spinner"></div>}
      {assessment && (
        <div className="generator-result">
          <h3>Generated Assessment</h3>
          <pre>{assessment}</pre>
        </div>
      )}
    </div>
  );
};

export default AssessmentGenerator;
