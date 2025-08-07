import { useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../firebase.js";
import "./AIToolsGenerators.css";

const InitiativesNew = () => {
  const [businessGoal, setBusinessGoal] = useState("");
  const [audienceProfile, setAudienceProfile] = useState("");
  const [sourceMaterial, setSourceMaterial] = useState("");
  const [projectConstraints, setProjectConstraints] = useState("");
  const [projectBrief, setProjectBrief] = useState("");
  const [clarifyingQuestions, setClarifyingQuestions] = useState([]);
  const [clarifyingAnswers, setClarifyingAnswers] = useState([]);
  const [strategy, setStrategy] = useState(null);
  const [loading, setLoading] = useState(false);
  const [nextLoading, setNextLoading] = useState(false);
  const [error, setError] = useState("");
  const [nextError, setNextError] = useState("");

  const functionUrl =
    "https://us-central1-thoughtify-web-bb1ea.cloudfunctions.net/generateProjectBrief";

  const functionsInstance = getFunctions(app);
  const generateLearningStrategyCallable = httpsCallable(
    functionsInstance,
    "generateLearningStrategy",
  );

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setSourceMaterial((prev) => `${prev}\n${reader.result}`);
      };
      reader.readAsText(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setProjectBrief("");
    setClarifyingQuestions([]);
    setClarifyingAnswers([]);
    setStrategy(null);
    try {
      const response = await fetch(functionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessGoal,
          audienceProfile,
          sourceMaterial,
          projectConstraints,
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      if (!data.projectBrief) {
        throw new Error("No project brief returned.");
      }
      setProjectBrief(data.projectBrief);
      setClarifyingQuestions(data.clarifyingQuestions || []);
      setClarifyingAnswers(data.clarifyingQuestions?.map(() => "") || []);
    } catch (err) {
      console.error("Error generating project brief:", err);
      setError(err.message || "Error generating project brief.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([projectBrief], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "project-brief.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAnswerChange = (index, value) => {
    setClarifyingAnswers((prev) => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  const handleNext = async () => {
    setNextLoading(true);
    setNextError("");
    setStrategy(null);
    try {
      const result = await generateLearningStrategyCallable({
        projectBrief,
        businessGoal,
        audienceProfile,
        projectConstraints,
      });
      const data = result.data;
      if (!data.modalityRecommendation || !data.learnerPersonas) {
        throw new Error("No learning strategy returned.");
      }
      setStrategy(data);
    } catch (err) {
      console.error("Error generating learning strategy:", err);
      setNextError(err.message || "Error generating learning strategy.");
    } finally {
      setNextLoading(false);
    }
  };

  return (
    <div className="generator-container">
      <h2>Initiatives - Project Intake & Analysis</h2>
      <form onSubmit={handleSubmit} className="generator-form">
        <input
          type="text"
          placeholder="Business Goal"
          value={businessGoal}
          onChange={(e) => setBusinessGoal(e.target.value)}
          className="generator-input"
        />
        <textarea
          placeholder="Audience Profile"
          value={audienceProfile}
          onChange={(e) => setAudienceProfile(e.target.value)}
          className="generator-input"
          rows="3"
        />
        <textarea
          placeholder="Source Material or links"
          value={sourceMaterial}
          onChange={(e) => setSourceMaterial(e.target.value)}
          className="generator-input"
          rows="4"
        />
        <input
          type="file"
          onChange={handleFileUpload}
          className="generator-input"
        />
        <textarea
          placeholder="Project Constraints"
          value={projectConstraints}
          onChange={(e) => setProjectConstraints(e.target.value)}
          className="generator-input"
          rows="2"
        />
        <button type="submit" disabled={loading} className="generator-button">
          {loading ? "Analyzing..." : "Generate Project Brief"}
        </button>
      </form>
      {error && <p className="generator-error">{error}</p>}
      {loading && <div className="spinner"></div>}
      {projectBrief && (
        <div className="generator-result">
          <h3>Project Brief</h3>
          <textarea
            className="generator-input"
            value={projectBrief}
            onChange={(e) => setProjectBrief(e.target.value)}
            rows="10"
          />
          <button onClick={handleDownload} className="generator-button">
            Download Brief
          </button>
          {clarifyingQuestions.length > 0 && (
            <div>
              <h4>Clarifying Questions</h4>
              {clarifyingQuestions.map((q, idx) => (
                <div key={idx}>
                  <p>{q}</p>
                  <textarea
                    className="generator-input"
                    value={clarifyingAnswers[idx] || ""}
                    onChange={(e) => handleAnswerChange(idx, e.target.value)}
                    rows="2"
                  />
                </div>
              ))}
            </div>
          )}
          <button
            onClick={handleNext}
            disabled={nextLoading}
            className="generator-button"
          >
            {nextLoading ? "Generating..." : "Next Step"}
          </button>
          {nextError && <p className="generator-error">{nextError}</p>}
        </div>
      )}
      {strategy && (
        <div className="generator-result">
          <h3>Learning Strategy</h3>
          <p>
            <strong>Modality Recommendation:</strong> {strategy.modalityRecommendation}
          </p>
          <p>
            <strong>Rationale:</strong> {strategy.rationale}
          </p>
          {strategy.learnerPersonas && strategy.learnerPersonas.length > 0 && (
            <div>
              <h4>Learner Personas</h4>
              <ul>
                {strategy.learnerPersonas.map((p, idx) => (
                  <li
                    key={idx}
                    style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                  >
                    {p.avatar && (
                      <img
                        src={p.avatar}
                        alt={`${p.name} avatar`}
                        style={{ width: "40px", height: "40px", borderRadius: "50%" }}
                      />
                    )}
                    <span>
                      <strong>{p.name}</strong>: {p.motivation}; {p.challenges}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default InitiativesNew;
