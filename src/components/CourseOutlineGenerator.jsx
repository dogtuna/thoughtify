// src/CourseOutlineGenerator.jsx

import { useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../firebase.js";
import "./AIToolsGenerators.css";

const CourseOutlineGenerator = () => {
  const [topic, setTopic] = useState("");
  const [outline, setOutline] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const functionsInstance = getFunctions(app);
  const generateCourseOutline = httpsCallable(functionsInstance, "generateCourseOutline");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!topic.trim()) return;
    setLoading(true);
    setError("");
    setOutline("");
    try {
      const result = await generateCourseOutline({ topic });
      setOutline(result.data.outline);
    } catch (err) {
      console.error("Error generating course outline:", err);
      setError(err.message || "Error generating course outline.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="generator-container">
      <h2>Course Outline Generator</h2>
      <form onSubmit={handleSubmit} className="generator-form">
        <input
          type="text"
          placeholder="Enter a course topic, e.g., 'Introduction to Digital Marketing'"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="generator-input"
        />
        <button type="submit" disabled={loading} className="generator-button">
          {loading ? "Generating..." : "Generate Outline"}
        </button>
      </form>
      {error && <p className="generator-error">{error}</p>}
      {loading && <div className="spinner"></div>}
      {outline && (
        <div className="generator-result">
          <h3>Generated Course Outline</h3>
          <pre>{outline}</pre>
        </div>
      )}
    </div>
  );
};

export default CourseOutlineGenerator;

