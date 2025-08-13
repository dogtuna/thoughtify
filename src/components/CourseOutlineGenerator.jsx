// src/CourseOutlineGenerator.jsx

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../firebase.js";
import { useProject } from "../context/ProjectContext.jsx";
import "./AIToolsGenerators.css";

const CourseOutlineGenerator = () => {
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.body.classList.toggle("pulsing", loading);
    return () => document.body.classList.remove("pulsing");
  }, [loading]);

  const {
    courseOutline,
    setCourseOutline,
    modules,
    setModules,
    selectedModule,
    setSelectedModule,
  } = useProject();
  const navigate = useNavigate();

  const functionsInstance = getFunctions(app);
  const generateCourseOutline = httpsCallable(
    functionsInstance,
    "generateCourseOutline"
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!topic.trim()) return;
    setLoading(true);
    setError("");
    setCourseOutline("");
    setModules([]);
    setSelectedModule("");
    try {
      const result = await generateCourseOutline({ topic });
      const outlineText = result.data.outline;
      setCourseOutline(outlineText);
      const moduleLines = outlineText
        .split("\n")
        .filter((line) => /module/i.test(line));
      setModules(moduleLines);
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
      {courseOutline && (
        <div className="generator-result">
          <h3>Generated Course Outline</h3>
          <pre>{courseOutline}</pre>
        </div>
      )}
      {modules.length > 0 && (
        <div className="module-selector">
          <h4>Select a module for next steps:</h4>
          <select
            value={selectedModule}
            onChange={(e) => setSelectedModule(e.target.value)}
            className="generator-input"
          >
            <option value="">-- Select Module --</option>
            {modules.map((m, i) => (
              <option key={i} value={m}>
                {m}
              </option>
            ))}
          </select>
          {selectedModule && (
            <button
              className="generator-button"
              onClick={() => navigate("/ai-tools/lesson-content")}
            >
              Next: Lesson Content
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default CourseOutlineGenerator;

