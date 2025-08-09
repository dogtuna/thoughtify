import { useState, useEffect } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app, auth } from "../firebase.js";
import { loadPersonas, savePersona } from "../utils/personas.js";
import {
  loadInitiative,
  saveInitiative,
} from "../utils/initiatives.js";
import { useSearchParams } from "react-router-dom";
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
  const [personaLoading, setPersonaLoading] = useState(false);

  const [error, setError] = useState("");
  const [nextError, setNextError] = useState("");
  const [personaError, setPersonaError] = useState("");

  const [personas, setPersonas] = useState([]);
  const [activePersonaIndex, setActivePersonaIndex] = useState(0);
  const [editingPersona, setEditingPersona] = useState(null);
  const [usedMotivationKeywords, setUsedMotivationKeywords] = useState([]);
  const [usedChallengeKeywords, setUsedChallengeKeywords] = useState([]);

  const addUsedMotivation = (keywords = []) => {
    setUsedMotivationKeywords((prev) =>
      Array.from(new Set([...prev, ...keywords.filter(Boolean)]))
    );
  };
  const addUsedChallenge = (keywords = []) => {
    setUsedChallengeKeywords((prev) =>
      Array.from(new Set([...prev, ...keywords.filter(Boolean)]))
    );
  };

  const [searchParams] = useSearchParams();
  const initiativeId = searchParams.get("initiativeId") || "default";

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    loadInitiative(uid, initiativeId)
      .then((data) => {
        if (data) {
          setBusinessGoal(data.businessGoal || "");
          setAudienceProfile(data.audienceProfile || "");
          setSourceMaterial(data.sourceMaterial || "");
          setProjectConstraints(data.projectConstraints || "");
          setProjectBrief(data.projectBrief || "");
          setClarifyingQuestions(data.clarifyingQuestions || []);
          setClarifyingAnswers(data.clarifyingAnswers || []);
          setStrategy(data.strategy || null);
        }
      })
      .catch((err) => console.error("Error loading initiative:", err));

    loadPersonas(uid, initiativeId)
      .then((items) => {
        const normalized = items.map((p) => {
          const persona = {
            ...p,
            motivation:
              typeof p.motivation === "string"
                ? { keyword: "General", text: p.motivation }
                : p.motivation,
            challenges:
              typeof p.challenges === "string"
                ? { keyword: "General", text: p.challenges }
                : p.challenges,
            motivationOptions: p.motivationOptions || [],
            challengeOptions: p.challengeOptions || [],
          };
          return persona;
        });
        setPersonas(normalized);
        setActivePersonaIndex(0);
        // populate used keyword sets
        normalized.forEach((p) => {
          const mKeys = [
            p.motivation?.keyword,
            ...(p.motivationOptions || []).map((o) => o.keyword),
          ].filter(Boolean);
          const cKeys = [
            p.challenges?.keyword,
            ...(p.challengeOptions || []).map((o) => o.keyword),
          ].filter(Boolean);
          addUsedMotivation(mKeys);
          addUsedChallenge(cKeys);
        });
      })
      .catch((err) => console.error("Error loading personas:", err));
  }, [initiativeId]);

  // Use the same region you deploy to
  const functions = getFunctions(app, "us-central1");

  const generateProjectBrief = httpsCallable(functions, "generateProjectBrief");
  const generateLearningStrategy = httpsCallable(functions, "generateLearningStrategy");
  const generateLearnerPersona = httpsCallable(functions, "generateLearnerPersona");
  const generateAvatar = httpsCallable(functions, "generateAvatar");

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSourceMaterial((prev) => `${prev}\n${reader.result}`);
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setProjectBrief("");
    setClarifyingQuestions([]);
    setClarifyingAnswers([]);
    setStrategy(null);
    setPersonas([]);
    setActivePersonaIndex(0);
    setEditingPersona(null);

    try {
      const { data } = await generateProjectBrief({
        businessGoal,
        audienceProfile,
        sourceMaterial,
        projectConstraints,
      });

      if (!data?.projectBrief) {
        throw new Error("No project brief returned.");
      }

      setProjectBrief(data.projectBrief);
      const qs = data.clarifyingQuestions || [];
      setClarifyingQuestions(qs);
      setClarifyingAnswers(qs.map(() => ""));

      const uid = auth.currentUser?.uid;
      if (uid) {
        await saveInitiative(uid, initiativeId, {
          businessGoal,
          audienceProfile,
          sourceMaterial,
          projectConstraints,
          projectBrief: data.projectBrief,
          clarifyingQuestions: qs,
          clarifyingAnswers: qs.map(() => ""),
        });
      }
    } catch (err) {
      console.error("Error generating project brief:", err);
      setError(err?.message || "Error generating project brief.");
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
      const uid = auth.currentUser?.uid;
      if (uid) {
        saveInitiative(uid, initiativeId, { clarifyingAnswers: updated });
      }
      return updated;
    });
  };

  const handleNext = async () => {
    setNextLoading(true);
    setNextError("");
    setStrategy(null);
    setPersonas([]);
    setActivePersonaIndex(0);
    setEditingPersona(null);

    try {
      const { data } = await generateLearningStrategy({
        projectBrief,
        businessGoal,
        audienceProfile,
        projectConstraints,
        clarifyingQuestions,
        clarifyingAnswers,
        personaCount: 0, // strategy only (personas generated separately below)
      });

      if (!data?.modalityRecommendation || !data?.rationale) {
        throw new Error("No learning strategy returned.");
      }
      setStrategy(data);
      const uid = auth.currentUser?.uid;
      if (uid) {
        await saveInitiative(uid, initiativeId, { strategy: data });
      }
    } catch (err) {
      console.error("Error generating learning strategy:", err);
      setNextError(err?.message || "Error generating learning strategy.");
    } finally {
      setNextLoading(false);
    }
  };

  const currentPersona = personas[activePersonaIndex] || null;

  const handleGeneratePersona = async (action = "add") => {
    setPersonaLoading(true);
    setPersonaError("");
    try {
      const personaRes = await generateLearnerPersona({
        projectBrief,
        businessGoal,
        audienceProfile,
        projectConstraints,
        existingMotivationKeywords: usedMotivationKeywords,
        existingChallengeKeywords: usedChallengeKeywords,
      });
      const personaData = personaRes.data;
      if (!personaData?.name) {
        throw new Error("Persona generation returned no name.");
      }

      const avatarRes = await generateAvatar({
        name: personaData.name,
        motivation: personaData.motivation?.text || "",
        challenges: personaData.challenges?.text || "",
      });

      const personaToSave = {
        ...personaData,
        avatar: avatarRes?.data?.avatar || null,
      };
      // record used keywords
      addUsedMotivation([
        personaData.motivation?.keyword,
        ...(personaData.motivationOptions || []).map((o) => o.keyword),
      ]);
      addUsedChallenge([
        personaData.challenges?.keyword,
        ...(personaData.challengeOptions || []).map((o) => o.keyword),
      ]);
      const uid = auth.currentUser?.uid;
      if (uid) {
        if (action === "replace" && currentPersona) {
          const id = currentPersona.id;
          await savePersona(uid, initiativeId, { ...personaToSave, id });
          setPersonas((prev) =>
            prev.map((p, i) => (i === activePersonaIndex ? { id, ...personaToSave } : p))
          );
        } else {
          const id = await savePersona(uid, initiativeId, personaToSave);
          const newPersona = { id, ...personaToSave };
          const newIndex = personas.length;
          setPersonas((prev) => [...prev, newPersona]);
          setActivePersonaIndex(newIndex);
        }
      } else {
        if (action === "replace" && currentPersona) {
          setPersonas((prev) =>
            prev.map((p, i) => (i === activePersonaIndex ? { ...personaToSave } : p))
          );
        } else {
          const newIndex = personas.length;
          setPersonas((prev) => [...prev, personaToSave]);
          setActivePersonaIndex(newIndex);
        }
      }
    } catch (err) {
      console.error("Error generating persona:", err);
      setPersonaError(err?.message || "Error generating persona.");
    } finally {
      setPersonaLoading(false);
    }
  };

  const handlePersonaFieldChange = (field, value) => {
    setEditingPersona((prev) => ({ ...prev, [field]: value }));
  };

  const selectMotivationOption = (opt) => {
    setEditingPersona((prev) => ({ ...prev, motivation: opt }));
  };
  const selectChallengeOption = (opt) => {
    setEditingPersona((prev) => ({ ...prev, challenges: opt }));
  };

  const refreshOptions = async (field) => {
    if (!editingPersona) return;
    setPersonaLoading(true);
    setPersonaError("");
    try {
      const { data } = await generateLearnerPersona({
        projectBrief,
        businessGoal,
        audienceProfile,
        projectConstraints,
        existingMotivationKeywords: usedMotivationKeywords,
        existingChallengeKeywords: usedChallengeKeywords,
        refreshField: field,
      });
      if (field === "motivation") {
        const opts = data.motivationOptions || [];
        addUsedMotivation(opts.map((o) => o.keyword));
        setEditingPersona((prev) => ({ ...prev, motivationOptions: opts }));
      } else {
        const opts = data.challengeOptions || [];
        addUsedChallenge(opts.map((o) => o.keyword));
        setEditingPersona((prev) => ({ ...prev, challengeOptions: opts }));
      }
    } catch (err) {
      console.error("Error generating options:", err);
      setPersonaError(err?.message || "Error generating options.");
    } finally {
      setPersonaLoading(false);
    }
  };

  const handleSavePersonaEdits = async () => {
    if (!editingPersona) return;
    const uid = auth.currentUser?.uid;
    try {
      if (uid) {
        await savePersona(uid, initiativeId, editingPersona);
      }
      setPersonas((prev) =>
        prev.map((p, i) => (i === activePersonaIndex ? editingPersona : p))
      );
      setEditingPersona(null);
    } catch (err) {
      console.error("Error saving persona:", err);
      setPersonaError(err?.message || "Error saving persona.");
    }
  };

  const handleRegenerateAvatar = async () => {
    if (!editingPersona) return;
    setPersonaLoading(true);
    setPersonaError("");
    try {
      const avatarRes = await generateAvatar({
        name: editingPersona.name,
        motivation: editingPersona.motivation?.text || "",
        challenges: editingPersona.challenges?.text || "",
      });
      setEditingPersona((prev) => ({
        ...prev,
        avatar: avatarRes?.data?.avatar || null,
      }));
    } catch (err) {
      console.error("Error generating avatar:", err);
      setPersonaError(err?.message || "Error generating avatar.");
    } finally {
      setPersonaLoading(false);
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
          rows={3}
        />
        <textarea
          placeholder="Source Material or links"
          value={sourceMaterial}
          onChange={(e) => setSourceMaterial(e.target.value)}
          className="generator-input"
          rows={4}
        />
        <input type="file" onChange={handleFileUpload} className="generator-input" />
        <textarea
          placeholder="Project Constraints"
          value={projectConstraints}
          onChange={(e) => setProjectConstraints(e.target.value)}
          className="generator-input"
          rows={2}
        />
        <button type="submit" disabled={loading} className="generator-button">
          {loading ? "Analyzing..." : "Generate Project Brief"}
        </button>
      </form>

      {error && <p className="generator-error">{error}</p>}
      {loading && <div className="spinner" />}

      {projectBrief && (
        <div className="generator-result">
          <h3>Project Brief</h3>
          <textarea
            className="generator-input"
            value={projectBrief}
            onChange={(e) => setProjectBrief(e.target.value)}
            rows={10}
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
                    rows={2}
                  />
                </div>
              ))}
            </div>
          )}

          <button onClick={handleNext} disabled={nextLoading} className="generator-button">
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

          <div>
            <h4>Learner Personas</h4>
            {personas.length === 0 && (
              <button
                onClick={() => handleGeneratePersona("add")}
                disabled={personaLoading}
                className="generator-button"
              >
                {personaLoading ? "Generating..." : "Generate Persona & Avatar"}
              </button>
            )}

            {personas.length > 0 && (
              <div>
                {personas.length > 1 && (
                  <div className="persona-tabs">
                    {personas.map((p, i) => (
                      <button
                        key={p.id || i}
                        type="button"
                        onClick={() => {
                          setActivePersonaIndex(i);
                          setEditingPersona(null);
                        }}
                        className={`persona-tab ${i === activePersonaIndex ? "active" : ""}`}
                      >
                        {p.avatar && (
                          <img
                            src={p.avatar}
                            alt={`${p.name} avatar`}
                            className="persona-tab-avatar"
                          />
                        )}
                        <span>{p.name}</span>
                      </button>
                    ))}
                  </div>
                )}

                {currentPersona && (
                  <div className="persona-card">
                    {editingPersona ? (
                      <>
                        {editingPersona.avatar && (
                          <img
                            src={editingPersona.avatar}
                            alt={`${editingPersona.name} avatar`}
                            className="persona-avatar"
                          />
                        )}
                        <input
                          className="generator-input"
                          value={editingPersona.name}
                          onChange={(e) => handlePersonaFieldChange("name", e.target.value)}
                        />
                        <p>
                          <strong>Motivation - {editingPersona.motivation?.keyword}</strong>
                        </p>
                        <textarea
                          className="generator-input"
                          value={editingPersona.motivation?.text || ""}
                          onChange={(e) =>
                            handlePersonaFieldChange("motivation", {
                              ...editingPersona.motivation,
                              text: e.target.value,
                            })
                          }
                          rows={2}
                        />
                        <div className="persona-options">
                          {editingPersona.motivationOptions?.length > 0 && (
                            <>
                              <p>Other possible motivations...</p>
                              {editingPersona.motivationOptions.map((opt) => (
                                <button
                                  key={opt.keyword}
                                  type="button"
                                  onClick={() => selectMotivationOption(opt)}
                                  className="generator-button"
                                >
                                  {opt.keyword}
                                </button>
                              ))}
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => refreshOptions("motivation")}
                            className="generator-button"
                          >
                            Generate more
                          </button>
                        </div>
                        <p>
                          <strong>Challenges - {editingPersona.challenges?.keyword}</strong>
                        </p>
                        <textarea
                          className="generator-input"
                          value={editingPersona.challenges?.text || ""}
                          onChange={(e) =>
                            handlePersonaFieldChange("challenges", {
                              ...editingPersona.challenges,
                              text: e.target.value,
                            })
                          }
                          rows={2}
                        />
                        <div className="persona-options">
                          {editingPersona.challengeOptions?.length > 0 && (
                            <>
                              <p>Other possible challenges...</p>
                              {editingPersona.challengeOptions.map((opt) => (
                                <button
                                  key={opt.keyword}
                                  type="button"
                                  onClick={() => selectChallengeOption(opt)}
                                  className="generator-button"
                                >
                                  {opt.keyword}
                                </button>
                              ))}
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => refreshOptions("challenges")}
                            className="generator-button"
                          >
                            Generate more
                          </button>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            onClick={handleRegenerateAvatar}
                            disabled={personaLoading}
                            className="generator-button"
                            type="button"
                          >
                            {personaLoading ? "Generating..." : "Regenerate Avatar"}
                          </button>
                          <button
                            onClick={handleSavePersonaEdits}
                            disabled={personaLoading}
                            className="generator-button"
                            type="button"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingPersona(null)}
                            className="generator-button"
                            type="button"
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        {currentPersona.avatar && (
                          <img
                            src={currentPersona.avatar}
                            alt={`${currentPersona.name} avatar`}
                            className="persona-avatar"
                          />
                        )}
                        <h5>{currentPersona.name}</h5>
                        <p>
                          <strong>Motivation - {currentPersona.motivation?.keyword}:</strong> {currentPersona.motivation?.text}
                        </p>
                        <p>
                          <strong>Challenges - {currentPersona.challenges?.keyword}:</strong> {currentPersona.challenges?.text}
                        </p>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            onClick={() =>
                              setEditingPersona(
                                JSON.parse(JSON.stringify(currentPersona))
                              )
                            }
                            className="generator-button"
                            type="button"
                          >
                            Edit Persona
                          </button>
                          <button
                            onClick={() => handleGeneratePersona("replace")}
                            disabled={personaLoading}
                            className="generator-button"
                            type="button"
                          >
                            {personaLoading ? "Generating..." : "Replace Persona"}
                          </button>
                          {personas.length < 3 && (
                            <button
                              onClick={() => handleGeneratePersona("add")}
                              disabled={personaLoading}
                              className="generator-button"
                              type="button"
                            >
                              {personaLoading ? "Generating..." : "Add Persona"}
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {personaError && <p className="generator-error">{personaError}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default InitiativesNew;
