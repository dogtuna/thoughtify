// src/LessonContentGenerator.jsx

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../firebase.js";
import { useProject } from "../context/ProjectContext.jsx";
import "./AIToolsGenerators.css";

const LessonContentGenerator = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { selectedModule, lessonContent, setLessonContent } = useProject();
  const navigate = useNavigate();

  // Initialize the Functions instance from your Firebase app.
  const functionsInstance = getFunctions(app);
  // Create a callable reference to the "generateLessonContent" function.
  const generateLessonContent = httpsCallable(
    functionsInstance,
    "generateLessonContent"
  );

  const handleGenerate = async () => {
    if (!selectedModule) return;

    setLoading(true);
    setError("");
    setLessonContent("");

    try {
      const result = await generateLessonContent({ topic: selectedModule });
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
      <p>Module: {selectedModule || "No module selected"}</p>
      <button
        onClick={handleGenerate}
        disabled={loading || !selectedModule}
        className="generator-button"
      >
        {loading ? "Generating..." : "Generate Lesson Content"}
      </button>
      {error && <p className="generator-error">{error}</p>}
      {loading && <div className="spinner"></div>}
      {lessonContent && (
        <div className="generator-result">
          <h3>Generated Lesson Content</h3>
          <pre>{lessonContent}</pre>
        </div>
      )}
      {lessonContent && (
        <button
          className="generator-button"
          onClick={() => navigate("/ai-tools/storyboard")}
        >
          Next: Storyboard
        </button>
      )}
    </div>
  );
};

export default LessonContentGenerator;
