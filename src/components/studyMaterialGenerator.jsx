// src/StudyMaterialGenerator.jsx

import { useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../firebase.js";
import "./AIToolsGenerators.css";

const StudyMaterialGenerator = () => {
  const [topic, setTopic] = useState("");
  const [studyMaterial, setStudyMaterial] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const functionsInstance = getFunctions(app);
  const generateStudyMaterial = httpsCallable(functionsInstance, "generateStudyMaterial");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!topic.trim()) return;
    setLoading(true);
    setError("");
    setStudyMaterial("");
    try {
      const result = await generateStudyMaterial({ topic });
      setStudyMaterial(result.data.studyMaterial);
    } catch (err) {
      console.error("Error generating study material:", err);
      setError(err.message || "Error generating study material.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="generator-container">
      <h2>Study Material Generator</h2>
      <form onSubmit={handleSubmit} className="generator-form">
        <input
          type="text"
          placeholder="Enter a topic, e.g., 'Photosynthesis'"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="generator-input"
        />
        <button type="submit" disabled={loading} className="generator-button">
          {loading ? "Generating..." : "Generate Study Material"}
        </button>
      </form>
      {error && <p className="generator-error">{error}</p>}
      {loading && <div className="spinner"></div>}
      {studyMaterial && (
        <div className="generator-result">
          <h3>Generated Study Material</h3>
          <pre>{studyMaterial}</pre>
        </div>
      )}
    </div>
  );
};

export default StudyMaterialGenerator;
