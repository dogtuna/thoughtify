// src/LessonContentGenerator.jsx

import { useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../firebase.js";
import "./AIToolsGenerators.css";

const LessonContentGenerator = () => {
  const [topic, setTopic] = useState("");
  const [lessonContent, setLessonContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Initialize the Functions instance from your Firebase app.
  const functionsInstance = getFunctions(app);
  // Create a callable reference to the "generateLessonContent" function.
  const generateLessonContent = httpsCallable(functionsInstance, "generateLessonContent");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!topic.trim()) return;

    setLoading(true);
    setError("");
    setLessonContent("");

    try {
      // Call the Firebase callable function with the topic.
      const result = await generateLessonContent({ topic });
      setLessonContent(result.data.lessonContent);
    } catch (err) {
      console.error("Error generating lesson content:", err);
      setError(err.message || "Error generating lesson content.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="generator-container">
      <h2>Lesson Content Generator</h2>
      <form onSubmit={handleSubmit} className="generator-form">
        <input
          type="text"
          placeholder="Enter a lesson topic, e.g., 'Quantum Mechanics'"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="generator-input"
        />
        <button type="submit" disabled={loading} className="generator-button">
          {loading ? "Generating..." : "Generate Lesson Content"}
        </button>
      </form>
      {error && <p className="generator-error">{error}</p>}
      {loading && <div className="spinner"></div>}
      {lessonContent && (
        <div className="generator-result">
          <h3>Generated Lesson Content</h3>
          <pre>{lessonContent}</pre>
        </div>
      )}
    </div>
  );
};

export default LessonContentGenerator;
