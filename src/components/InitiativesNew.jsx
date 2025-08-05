import { useState } from "react";
import "./AIToolsGenerators.css";

const InitiativesNew = () => {
  const [businessGoal, setBusinessGoal] = useState("");
  const [audienceProfile, setAudienceProfile] = useState("");
  const [sourceMaterial, setSourceMaterial] = useState("");
  const [projectConstraints, setProjectConstraints] = useState("");
  const [projectBrief, setProjectBrief] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const functionUrl =
    "https://us-central1-thoughtify-web-bb1ea.cloudfunctions.net/generateProjectBrief";

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
      setProjectBrief(data.projectBrief);
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
          <pre>{projectBrief}</pre>
          <button onClick={handleDownload} className="generator-button">
            Download Brief
          </button>
        </div>
      )}
    </div>
  );
};

export default InitiativesNew;
