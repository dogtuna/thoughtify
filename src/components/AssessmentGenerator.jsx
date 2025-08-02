// src/AssessmentGenerator.jsx

import { useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../firebase.js";
import "./AIToolsGenerators.css";

const AssessmentGenerator = () => {
  const [topic, setTopic] = useState("");
  const [assessment, setAssessment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Initialize the Functions instance from your Firebase app.
  const functionsInstance = getFunctions(app);
  // Create a callable reference to the "generateAssessment" function.
  const generateAssessment = httpsCallable(functionsInstance, "generateAssessment");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!topic.trim()) return;

    setLoading(true);
    setError("");
    setAssessment("");

    try {
      // Call the Cloud Function with the topic.
      const result = await generateAssessment({ topic });
      setAssessment(result.data.assessment);
    } catch (err) {
      console.error("Error generating assessment:", err);
      setError(err.message || "Error generating assessment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="generator-container">
      <h2>Assessment Generator</h2>
      <form onSubmit={handleSubmit} className="generator-form">
        <input
          type="text"
          placeholder="Enter a topic, e.g., 'Introduction to Programming'"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="generator-input"
        />
        <button type="submit" disabled={loading} className="generator-button">
          {loading ? "Generating..." : "Generate Assessment"}
        </button>
      </form>
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
