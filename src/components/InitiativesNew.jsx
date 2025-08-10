import { useState, useEffect, useRef } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app, auth } from "../firebase.js";
import {
  loadPersonas,
  savePersona,
  deletePersona,
} from "../utils/personas.js";
import {
  loadInitiative,
  saveInitiative,
} from "../utils/initiatives.js";
import { useSearchParams } from "react-router-dom";
import "./AIToolsGenerators.css";

const formatKeyword = (kw = "") =>
  kw ? kw.charAt(0).toUpperCase() + kw.slice(1) : "";

const normalizePersona = (p = {}) => ({
  ...p,
  motivation:
    typeof p.motivation === "string"
      ? { keyword: "General", text: p.motivation }
      : {
          keyword: formatKeyword(p.motivation?.keyword) || "General",
          text: p.motivation?.text || "",
        },
  challenges:
    typeof p.challenges === "string"
      ? { keyword: "General", text: p.challenges }
      : {
          keyword: formatKeyword(p.challenges?.keyword) || "General",
          text: p.challenges?.text || "",
        },
  motivationOptions: (p.motivationOptions || []).map((o) => ({
    ...o,
    keyword: formatKeyword(o.keyword),
  })),
  challengeOptions: (p.challengeOptions || []).map((o) => ({
    ...o,
    keyword: formatKeyword(o.keyword),
  })),
});

const InitiativesNew = () => {
  const TOTAL_STEPS = 4;
  const [step, setStep] = useState(1);
  const [businessGoal, setBusinessGoal] = useState("");
  const [audienceProfile, setAudienceProfile] = useState("");
  const [sourceMaterial, setSourceMaterial] = useState("");
  const [projectConstraints, setProjectConstraints] = useState("");

  const [projectBrief, setProjectBrief] = useState("");
  const [clarifyingQuestions, setClarifyingQuestions] = useState([]);
  const [clarifyingAnswers, setClarifyingAnswers] = useState([]);

  const [strategy, setStrategy] = useState(null);

  const [isEditingBrief, setIsEditingBrief] = useState(false);

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

  const projectBriefRef = useRef(null);
  const nextButtonRef = useRef(null);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const [showFixedNext, setShowFixedNext] = useState(false);

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
        const normalized = items.map((p) => normalizePersona(p));
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

  useEffect(() => {
    if (!projectBriefRef.current || !nextButtonRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowScrollHint(!entry.isIntersecting),
      { root: projectBriefRef.current, threshold: 1 }
    );
    observer.observe(nextButtonRef.current);
    return () => observer.disconnect();
  }, [projectBrief, clarifyingQuestions]);

  useEffect(() => {
    const allAnswered =
      clarifyingQuestions.length > 0 &&
      clarifyingAnswers.every((a) => a && a.trim());
    setShowFixedNext(allAnswered && !strategy);
  }, [clarifyingAnswers, clarifyingQuestions, strategy]);

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
          clarifyingQuestions: qs,
          clarifyingAnswers: qs.map(() => ""),
        });
      }
      setStep(2);
    } catch (err) {
      console.error("Error generating clarifying questions:", err);
      setError(err?.message || "Error generating clarifying questions.");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateBrief = async () => {
    setLoading(true);
    setError("");

    try {
      const { data } = await generateProjectBrief({
        businessGoal,
        audienceProfile,
        sourceMaterial,
        projectConstraints,
        clarifyingQuestions,
        clarifyingAnswers,
      });

      if (!data?.projectBrief) {
        throw new Error("No project brief returned.");
      }

      setProjectBrief(data.projectBrief);

      const uid = auth.currentUser?.uid;
      if (uid) {
        await saveInitiative(uid, initiativeId, {
          businessGoal,
          audienceProfile,
          sourceMaterial,
          projectConstraints,
          projectBrief: data.projectBrief,
          clarifyingQuestions,
          clarifyingAnswers,
        });
      }
      setStep(3);
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
      setStep(4);
    } catch (err) {
      console.error("Error generating learning strategy:", err);
      setNextError(err?.message || "Error generating learning strategy.");
    } finally {
      setNextLoading(false);
    }
  };

  const currentPersona = personas[activePersonaIndex] || null;

  const handleGeneratePersona = async (action = "add") => {
    if (action === "add" && personas.length >= 3) {
      setPersonaError("You can only have up to three personas.");
      return;
    }
    setPersonaLoading(true);
    setPersonaError("");
    try {
      const existingNames = personas
        .filter((_, i) => !(action === "replace" && i === activePersonaIndex))
        .map((p) => p.name);
      const personaRes = await generateLearnerPersona({
        projectBrief,
        businessGoal,
        audienceProfile,
        projectConstraints,
        existingMotivationKeywords: usedMotivationKeywords,
        existingChallengeKeywords: usedChallengeKeywords,
        existingNames,
      });
      const personaData = normalizePersona(personaRes.data);
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
        personaToSave.motivation?.keyword,
        ...(personaToSave.motivationOptions || []).map((o) => o.keyword),
      ]);
      addUsedChallenge([
        personaToSave.challenges?.keyword,
        ...(personaToSave.challengeOptions || []).map((o) => o.keyword),
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
    if (field === "motivation") {
      setEditingPersona((prev) => ({ ...prev, motivationOptions: [] }));
    } else {
      setEditingPersona((prev) => ({ ...prev, challengeOptions: [] }));
    }
    try {
      const { data } = await generateLearnerPersona({
        projectBrief,
        businessGoal,
        audienceProfile,
        projectConstraints,
        existingMotivationKeywords: usedMotivationKeywords,
        existingChallengeKeywords: usedChallengeKeywords,
        refreshField: field,
        personaName: editingPersona.name,
      });
      if (field === "motivation") {
        const opts = (data.motivationOptions || []).map((o) => ({
          ...o,
          keyword: formatKeyword(o.keyword),
        }));
        if (opts.length === 0) {
          setPersonaError("No new options available.");
        } else {
          addUsedMotivation(opts.map((o) => o.keyword));
          setEditingPersona((prev) => ({ ...prev, motivationOptions: opts }));
        }
      } else {
        const opts = (data.challengeOptions || []).map((o) => ({
          ...o,
          keyword: formatKeyword(o.keyword),
        }));
        if (opts.length === 0) {
          setPersonaError("No new options available.");
        } else {
          addUsedChallenge(opts.map((o) => o.keyword));
          setEditingPersona((prev) => ({ ...prev, challengeOptions: opts }));
        }
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

  const handleDeletePersona = async (index) => {
    const persona = personas[index];
    if (!persona) return;
    setPersonaLoading(true);
    setPersonaError("");
    try {
      const uid = auth.currentUser?.uid;
      if (uid && persona.id) {
        await deletePersona(uid, initiativeId, persona.id);
      }
      const updated = personas.filter((_, i) => i !== index);
      setPersonas(updated);
      const newActive =
        updated.length === 0
          ? 0
          : activePersonaIndex > index
          ? activePersonaIndex - 1
          : Math.min(activePersonaIndex, updated.length - 1);
      setActivePersonaIndex(newActive);
      setEditingPersona(null);
    } catch (err) {
      console.error("Error deleting persona:", err);
      setPersonaError(err?.message || "Error deleting persona.");
    } finally {
      setPersonaLoading(false);
    }
  };

  return (
    <div className="generator-container">
      <h2>Initiatives - Project Intake & Analysis</h2>

      {step === 1 && (
        <form onSubmit={handleSubmit} className="generator-form">
          <div className="progress-indicator">Step 1 of {TOTAL_STEPS}</div>
          <label>
            Goal
            <input
              type="text"
              value={businessGoal}
              onChange={(e) => setBusinessGoal(e.target.value)}
              className="generator-input"
            />
          </label>
          <label>
            Audience Profile
            <textarea
              value={audienceProfile}
              onChange={(e) => setAudienceProfile(e.target.value)}
              className="generator-input"
              rows={3}
            />
          </label>
          <label>
            Source Material or Links
            <textarea
              value={sourceMaterial}
              onChange={(e) => setSourceMaterial(e.target.value)}
              className="generator-input"
              rows={4}
            />
          </label>
          <label>
            Source File
            <input type="file" onChange={handleFileUpload} className="generator-input" />
          </label>
          <label>
            Project Constraints
            <textarea
              value={projectConstraints}
              onChange={(e) => setProjectConstraints(e.target.value)}
              className="generator-input"
              rows={2}
            />
          </label>
          <button type="submit" disabled={loading} className="generator-button">
            {loading ? "Analyzing..." : "Advance to Step 2"}
          </button>
          {error && <p className="generator-error">{error}</p>}
        </form>
      )}

      {step === 2 && (
        <div className="generator-result">
          <div className="progress-indicator">Step 2 of {TOTAL_STEPS}</div>
          <p>
            Answering the questions below is optional, but it will help ensure the brief is as good as possible.
          </p>
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setStep(1)} className="generator-button">
              Back to Step 1
            </button>
            <button
              type="button"
              onClick={handleGenerateBrief}
              disabled={loading}
              className="generator-button"
            >
              {loading ? "Generating..." : "Generate Brief"}
            </button>
          </div>
          {error && <p className="generator-error">{error}</p>}
        </div>
      )}

      {step === 3 && (
        <div className="generator-result">
          <div className="progress-indicator">Step 3 of {TOTAL_STEPS}</div>
          <h3>Project Brief</h3>
          <textarea
            className="generator-input"
            value={projectBrief}
            onChange={(e) => setProjectBrief(e.target.value)}
            readOnly={!isEditingBrief}
            rows={10}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setStep(2)} className="generator-button">
              Back to Step 2
            </button>
            <button
              type="button"
              onClick={() => {
                if (isEditingBrief) {
                  const uid = auth.currentUser?.uid;
                  if (uid) {
                    saveInitiative(uid, initiativeId, { projectBrief });
                  }
                }
                setIsEditingBrief((prev) => !prev);
              }}
              className="generator-button"
            >
              {isEditingBrief ? "Save Brief" : "Edit Brief"}
            </button>
            <button type="button" onClick={handleDownload} className="generator-button">
              Download Brief
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={nextLoading}
              className="generator-button"
            >
              {nextLoading ? "Generating..." : "Advance to Step 4"}
            </button>
          </div>
          {nextError && <p className="generator-error">{nextError}</p>}
          {showScrollHint && !showFixedNext && (
            <div className="scroll-hint">Scroll down for Next Step ↓</div>
          )}
        </div>
      )}

      {step === 4 && strategy && (
        <div className="generator-result">
          <div className="progress-indicator">Step 4 of {TOTAL_STEPS}</div>
          <button
            type="button"
            onClick={() => setStep(3)}
            className="generator-button"
            style={{ marginBottom: 10 }}
          >
            Back to Step 3
          </button>
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
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}

                {editingPersona ? (
                  <>
                    <input
                      className="generator-input"
                      value={editingPersona.name || ""}
                      onChange={(e) =>
                        handlePersonaFieldChange("name", e.target.value)
                      }
                    />
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
                        onClick={() => handleDeletePersona(activePersonaIndex)}
                        disabled={personaLoading}
                        className="generator-button"
                        type="button"
                      >
                        Delete
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
                      <button
                        onClick={() => handleDeletePersona(activePersonaIndex)}
                        disabled={personaLoading}
                        className="generator-button"
                        type="button"
                      >
                        Delete Persona
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
          </div>
      {personaError && <p className="generator-error">{personaError}</p>}
        </div>
      )}

      {showFixedNext && (
        <button
          className="generator-button next-step-fixed"
          onClick={handleNext}
          disabled={nextLoading}
        >
          {nextLoading ? "Generating..." : "Next Step"}
        </button>
      )}
    </div>
  );
};

export default InitiativesNew;
