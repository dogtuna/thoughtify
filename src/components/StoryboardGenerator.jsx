// src/StoryboardGenerator.jsx

import { useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../firebase.js";
import "./AIToolsGenerators.css";

const StoryboardGenerator = () => {
  const [topic, setTopic] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [storyboard, setStoryboard] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Initialize Firebase Functions
  const functionsInstance = getFunctions(app);
  // Create a callable reference to the "generateStoryboard" function.
  const generateStoryboard = httpsCallable(functionsInstance, "generateStoryboard");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!topic.trim()) return; // Ensure topic is provided

    setLoading(true);
    setError("");
    setStoryboard("");

    try {
      // Call the Cloud Function with topic and optional targetAudience.
      const result = await generateStoryboard({ topic, targetAudience });
      setStoryboard(result.data.storyboard);
    } catch (err) {
      console.error("Error generating storyboard:", err);
      setError(err.message || "Error generating storyboard.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="generator-container">
      <h2>Storyboard Generator</h2>
      <form onSubmit={handleSubmit} className="generator-form">
        <input
          type="text"
          placeholder="Enter a topic, e.g., 'The History of Film'"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="generator-input"
        />
        <input
          type="text"
          placeholder="Optional: Enter target audience, e.g., 'undergraduate students'"
          value={targetAudience}
          onChange={(e) => setTargetAudience(e.target.value)}
          className="generator-input"
        />
        <button type="submit" disabled={loading} className="generator-button">
          {loading ? "Generating..." : "Generate Storyboard"}
        </button>
      </form>
      {error && <p className="generator-error">{error}</p>}
      {loading && <div className="spinner"></div>}
      {storyboard && (
        <div className="generator-result">
          <h3>Generated Storyboard</h3>
          <pre>{storyboard}</pre>
        </div>
      )}
    </div>
  );
};

export default StoryboardGenerator;
