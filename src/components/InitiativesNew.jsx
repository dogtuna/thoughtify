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
import LearningObjectivesGenerator from "./LearningObjectivesGenerator.jsx";
import HierarchicalOutlineGenerator from "./HierarchicalOutlineGenerator.jsx";
import LearningDesignDocument from "./LearningDesignDocument.jsx";
import { useProject } from "../context/ProjectContext.jsx";
import "./AIToolsGenerators.css";

const formatKeyword = (kw = "") =>
  kw ? kw.charAt(0).toUpperCase() + kw.slice(1) : "";

const normalizePersona = (p = {}) => ({
  ...p,
  ageRange: p.ageRange || "",
  ageRangeOptions: p.ageRangeOptions || [],
  educationLevel: p.educationLevel || "",
  educationLevelOptions: p.educationLevelOptions || [],
  techProficiency: p.techProficiency || "",
  techProficiencyOptions: p.techProficiencyOptions || [],
  learningPreferences: p.learningPreferences || "",
  learningPreferencesOptions: p.learningPreferencesOptions || [],
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
  const steps = [
    "Project Info",
    "Clarify",
    "Brief",
    "Personas",
    "Approach",
    "Objectives",
    "Outline",
    "Design",
  ];
  const [step, setStep] = useState(1);
  const [projectName, setProjectName] = useState("");
  const [businessGoal, setBusinessGoal] = useState("");
  const [audienceProfile, setAudienceProfile] = useState("");
  const [sourceMaterial, setSourceMaterial] = useState("");
  const [projectConstraints, setProjectConstraints] = useState("");

  const [projectBrief, setProjectBrief] = useState("");
  const [clarifyingQuestions, setClarifyingQuestions] = useState([]);
  const [clarifyingAnswers, setClarifyingAnswers] = useState([]);

  const [strategy, setStrategy] = useState(null);
  const [selectedModality, setSelectedModality] = useState("");

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
  const [personaCount, setPersonaCount] = useState(0);
  const [usedMotivationKeywords, setUsedMotivationKeywords] = useState([]);
  const [usedChallengeKeywords, setUsedChallengeKeywords] = useState([]);

  const {
    learningObjectives,
    courseOutline,
    learningDesignDocument,
    setLearningDesignDocument,
  } = useProject();

  const projectBriefRef = useRef(null);
  const nextButtonRef = useRef(null);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");

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

  const handleSave = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await saveInitiative(uid, initiativeId, {
        projectName,
        businessGoal,
        audienceProfile,
        sourceMaterial,
        projectConstraints,
        projectBrief,
        clarifyingQuestions,
        clarifyingAnswers,
        strategy,
        selectedModality,
        learningDesignDocument,
      });
      setSaveStatus("Saved");
      setTimeout(() => setSaveStatus(""), 3000);
    } catch (err) {
      console.error("Error saving initiative:", err);
      setSaveStatus("Error Saving");
    }
  };

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    loadInitiative(uid, initiativeId)
      .then((data) => {
        if (data) {
          setProjectName(data.projectName || "");
          setBusinessGoal(data.businessGoal || "");
          setAudienceProfile(data.audienceProfile || "");
          setSourceMaterial(data.sourceMaterial || "");
          setProjectConstraints(data.projectConstraints || "");
          setProjectBrief(data.projectBrief || "");
          setClarifyingQuestions(data.clarifyingQuestions || []);
          setClarifyingAnswers(data.clarifyingAnswers || []);
          setStrategy(data.strategy || null);
          setSelectedModality(data.selectedModality || "");
          setLearningDesignDocument(data.learningDesignDocument || "");
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
  }, [initiativeId, setLearningDesignDocument]);

  useEffect(() => {
    if (!projectBriefRef.current || !nextButtonRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowScrollHint(!entry.isIntersecting),
      { root: projectBriefRef.current, threshold: 1 }
    );
    observer.observe(nextButtonRef.current);
    return () => observer.disconnect();
  }, [projectBrief, clarifyingQuestions]);

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
    setPersonaCount(0);

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
          projectName,
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
          projectName,
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

  const handleGenerateStrategy = async () => {
    setNextLoading(true);
    setNextError("");

    try {
      const { data } = await generateLearningStrategy({
        projectBrief,
        businessGoal,
        audienceProfile,
        projectConstraints,
        clarifyingQuestions,
        clarifyingAnswers,
        personaCount: 0,
      });

      if (
        !data?.modalityRecommendation ||
        !data?.rationale ||
        !data?.nuances ||
        !data?.alternatives
      ) {
        throw new Error("No learning strategy returned.");
      }
      setStrategy(data);
      setSelectedModality(data.modalityRecommendation);
      const uid = auth.currentUser?.uid;
      if (uid) {
        await saveInitiative(uid, initiativeId, {
          projectName,
          strategy: data,
          selectedModality: data.modalityRecommendation,
        });
      }
      setStep(5);
    } catch (err) {
      console.error("Error generating learning strategy:", err);
      setNextError(err?.message || "Error generating learning strategy.");
    } finally {
      setNextLoading(false);
    }
  };

  const handleModalityChange = (e) => {
    const value = e.target.value;
    setSelectedModality(value);
    const uid = auth.currentUser?.uid;
    if (uid) {
      saveInitiative(uid, initiativeId, { selectedModality: value });
    }
  };

  const currentPersona = personas[activePersonaIndex] || null;

  const handleGeneratePersonas = async (count) => {
    const toGenerate = Math.min(Math.max(Number(count), 0), 3);
    if (toGenerate === 0) return;
    if (personas.length + toGenerate > 3) {
      setPersonaError("You can only have up to three personas.");
      return;
    }
    setPersonaLoading(true);
    setPersonaError("");
    try {
      const startIndex = personas.length;
      const newPersonas = [];
      let existingNames = personas.map((p) => p.name);
      for (let i = 0; i < toGenerate; i++) {
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
          ageRange: personaData.ageRange || "",
          techProficiency: personaData.techProficiency || "",
          educationLevel: personaData.educationLevel || "",
          learningPreferences: personaData.learningPreferences || "",
        });
        const personaToSave = {
          ...personaData,
          avatar: avatarRes?.data?.avatar || null,
        };
        addUsedMotivation([
          personaToSave.motivation?.keyword,
          ...(personaToSave.motivationOptions || []).map((o) => o.keyword),
        ]);
        addUsedChallenge([
          personaToSave.challenges?.keyword,
          ...(personaToSave.challengeOptions || []).map((o) => o.keyword),
        ]);
        existingNames.push(personaData.name);
        const uid = auth.currentUser?.uid;
        let savedPersona = personaToSave;
        if (uid) {
          const id = await savePersona(uid, initiativeId, personaToSave);
          savedPersona = { id, ...personaToSave };
        }
        newPersonas.push(savedPersona);
      }
      if (newPersonas.length > 0) {
        setPersonas((prev) => [...prev, ...newPersonas]);
        setActivePersonaIndex(startIndex);
      }
    } catch (err) {
      console.error("Error generating persona:", err);
      setPersonaError(err?.message || "Error generating persona.");
    } finally {
      setPersonaLoading(false);
    }
  };

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
        ageRange: personaData.ageRange || "",
        techProficiency: personaData.techProficiency || "",
        educationLevel: personaData.educationLevel || "",
        learningPreferences: personaData.learningPreferences || "",
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

  const selectOption = (field, opt) => {
    setEditingPersona((prev) => ({ ...prev, [field]: opt }));
  };

  const refreshOptions = async (field) => {
    if (!editingPersona) return;
    setPersonaLoading(true);
    setPersonaError("");
    const optionField = `${field}Options`;
    setEditingPersona((prev) => ({ ...prev, [optionField]: [] }));
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
      let opts = data[optionField] || [];
      if (field === "motivation" || field === "challenges") {
        opts = opts.map((o) => ({ ...o, keyword: formatKeyword(o.keyword) }));
        if (field === "motivation") {
          addUsedMotivation(opts.map((o) => o.keyword));
        } else {
          addUsedChallenge(opts.map((o) => o.keyword));
        }
      }
      if (opts.length === 0) {
        setPersonaError("No new options available.");
      } else {
        setEditingPersona((prev) => ({ ...prev, [optionField]: opts }));
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
        ageRange: editingPersona.ageRange || "",
        techProficiency: editingPersona.techProficiency || "",
        educationLevel: editingPersona.educationLevel || "",
        learningPreferences: editingPersona.learningPreferences || "",
        seedExtra: Date.now().toString(),
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
      <h2>Thoughtify Project Architect</h2>
      <p className="generator-subheading">
        Your AI Partner for End-to-End Course Creation
      </p>
      <div className="step-tracker">
        <div className="steps">
          {steps.map((label, idx) => (
            <div
              key={label}
              className={`step-item ${
                idx + 1 === step ? "active" : idx + 1 < step ? "completed" : ""
              }`}
              onClick={() => setStep(idx + 1)}
            >
              <div className="step-circle">
                {idx + 1 < step ? "\u2713" : idx + 1}
              </div>
              <div className="step-label">{label}</div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={handleSave}
          className="generator-button save-button"
        >
          Save
        </button>
      </div>
      {saveStatus && <p className="save-status">{saveStatus}</p>}

      {step === 1 && (
        <form onSubmit={handleSubmit} className="generator-form">
          <h3>Project Intake</h3>
          <p>Tell us about your project. The more detail, the better.</p>
          <div className="intake-grid">
            <div className="intake-left">
              <label>
                Project Name (e.g., &apos;Q3 Sales Onboarding&apos;)
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="generator-input"
                />
              </label>
              <label>
                What is the primary business goal? (e.g., &apos;Reduce support tickets for Product X by 20%&apos;)
                <input
                  type="text"
                  value={businessGoal}
                  onChange={(e) => setBusinessGoal(e.target.value)}
                  className="generator-input"
                />
              </label>
              <label>
                Who is the target audience? (e.g., &apos;New sales hires, age 22-28, with no prior industry experience&apos;)
                <textarea
                  value={audienceProfile}
                  onChange={(e) => setAudienceProfile(e.target.value)}
                  className="generator-input"
                  rows={3}
                />
              </label>
            </div>
            <label className="upload-card">
              <input
                type="file"
                onChange={handleFileUpload}
                className="file-input"
                accept=".pdf,.docx,.txt"
              />
              <div className="upload-title">Upload Source Material (Optional)</div>
              <div className="upload-subtitle">Click to upload or drag and drop</div>
              <div className="upload-hint">PDF, DOCX, TXT (MAX. 10MB)</div>
            </label>
          </div>
          <button type="submit" disabled={loading} className="generator-button">
            {loading ? "Analyzing..." : "Next"}
          </button>
          {error && <p className="generator-error">{error}</p>}
        </form>
      )}

      {step === 2 && (
        <div className="generator-result">
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
              Back
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
        <div className="generator-result" ref={projectBriefRef}>
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
              Back
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
              onClick={() => setStep(4)}
              className="generator-button"
              ref={nextButtonRef}
            >
              Next
            </button>
          </div>
          {showScrollHint && (
            <div className="scroll-hint">Scroll down for Next Step ↓</div>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="generator-result">
          <button
            type="button"
            onClick={() => setStep(3)}
            className="generator-button"
            style={{ marginBottom: 10 }}
          >
            Back
          </button>

          <div>
            <h3>Learner Personas</h3>
            {personas.length === 0 ? (
              <>
                <p>
                  Learner personas help tailor the training to different
                  audience segments by highlighting motivations, challenges,
                  and preferences. They can influence project decisions and
                  outcomes. You may generate up to three personas, but none are
                  required.
                </p>
                <label>
                  How many personas would you like to generate? (0-3)
                </label>
                <select
                  value={personaCount}
                  onChange={(e) => setPersonaCount(Number(e.target.value))}
                  className="generator-input"
                  style={{ maxWidth: 80, marginTop: 4 }}
                >
                  <option value={0}>0</option>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
                <div
                  style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}
                >
                  <button
                    onClick={() => handleGeneratePersonas(personaCount)}
                    disabled={personaLoading || personaCount === 0}
                    className="generator-button"
                  >
                    {personaLoading ? "Generating..." : "Generate Personas"}
                  </button>
                </div>
              </>
            ) : (
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
                    {editingPersona.avatar && (
                      <img
                        src={editingPersona.avatar}
                        alt={`${editingPersona.name} avatar`}
                        className="persona-avatar"
                      />
                    )}
                    <input
                      className="generator-input"
                      value={editingPersona.name || ""}
                      onChange={(e) =>
                        handlePersonaFieldChange("name", e.target.value)
                      }
                    />
                    <input
                      className="generator-input"
                      placeholder="Age Range"
                      value={editingPersona.ageRange || ""}
                      onChange={(e) =>
                        handlePersonaFieldChange("ageRange", e.target.value)
                      }
                    />
                    <div className="persona-options">
                      {editingPersona.ageRangeOptions?.length > 0 && (
                        <>
                          <p>Other possible age ranges...</p>
                          {editingPersona.ageRangeOptions.map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => selectOption("ageRange", opt)}
                              className="generator-button"
                            >
                              {opt}
                            </button>
                          ))}
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => refreshOptions("ageRange")}
                        className="generator-button"
                      >
                        Generate more
                      </button>
                    </div>
                    <input
                      className="generator-input"
                      placeholder="Education Level"
                      value={editingPersona.educationLevel || ""}
                      onChange={(e) =>
                        handlePersonaFieldChange(
                          "educationLevel",
                          e.target.value
                        )
                      }
                    />
                    <div className="persona-options">
                      {editingPersona.educationLevelOptions?.length > 0 && (
                        <>
                          <p>Other possible education levels...</p>
                          {editingPersona.educationLevelOptions.map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => selectOption("educationLevel", opt)}
                              className="generator-button"
                            >
                              {opt}
                            </button>
                          ))}
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => refreshOptions("educationLevel")}
                        className="generator-button"
                      >
                        Generate more
                      </button>
                    </div>
                    <input
                      className="generator-input"
                      placeholder="Tech Proficiency"
                      value={editingPersona.techProficiency || ""}
                      onChange={(e) =>
                        handlePersonaFieldChange(
                          "techProficiency",
                          e.target.value
                        )
                      }
                    />
                    <div className="persona-options">
                      {editingPersona.techProficiencyOptions?.length > 0 && (
                        <>
                          <p>Other possible tech proficiency levels...</p>
                          {editingPersona.techProficiencyOptions.map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => selectOption("techProficiency", opt)}
                              className="generator-button"
                            >
                              {opt}
                            </button>
                          ))}
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => refreshOptions("techProficiency")}
                        className="generator-button"
                      >
                        Generate more
                      </button>
                    </div>
                    <textarea
                      className="generator-input"
                      placeholder="Learning Preferences"
                      value={editingPersona.learningPreferences || ""}
                      onChange={(e) =>
                        handlePersonaFieldChange(
                          "learningPreferences",
                          e.target.value
                        )
                      }
                      rows={2}
                    />
                    <div className="persona-options">
                      {editingPersona.learningPreferencesOptions?.length > 0 && (
                        <>
                          <p>Other possible learning preferences...</p>
                          {editingPersona.learningPreferencesOptions.map(
                            (opt) => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() =>
                                  selectOption("learningPreferences", opt)
                                }
                                className="generator-button"
                              >
                                {opt}
                              </button>
                            )
                          )}
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => refreshOptions("learningPreferences")}
                        className="generator-button"
                      >
                        Generate more
                      </button>
                    </div>
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
                              onClick={() => selectOption("motivation", opt)}
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
                              onClick={() => selectOption("challenges", opt)}
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
                      <strong>Age Range:</strong> {currentPersona.ageRange}
                    </p>
                    <p>
                      <strong>Education Level:</strong> {currentPersona.educationLevel}
                    </p>
                    <p>
                      <strong>Tech Proficiency:</strong> {currentPersona.techProficiency}
                    </p>
                    <p>
                      <strong>Learning Preferences:</strong> {currentPersona.learningPreferences}
                    </p>
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleGenerateStrategy}
              disabled={nextLoading}
              className="generator-button"
            >
              {nextLoading ? "Generating..." : "Next"}
            </button>
          </div>
          {nextError && <p className="generator-error">{nextError}</p>}
        </div>
      )}

      {step === 5 && strategy && (
        <div className="generator-result">
          <button
            type="button"
            onClick={() => setStep(4)}
            className="generator-button"
            style={{ marginBottom: 10 }}
          >
            Back
          </button>
          <h3>Select Learning Approach</h3>
          <select
            className="generator-input"
            value={selectedModality}
            onChange={handleModalityChange}
          >
            <option value={strategy.modalityRecommendation}>
              {strategy.modalityRecommendation}
            </option>
            {strategy.alternatives?.map((alt) => (
              <option key={alt.modality} value={alt.modality}>
                {alt.modality}
              </option>
            ))}
          </select>
          {(() => {
            const info =
              selectedModality === strategy.modalityRecommendation
                ? { rationale: strategy.rationale, nuances: strategy.nuances }
                : strategy.alternatives?.find(
                    (a) => a.modality === selectedModality
                  ) || { rationale: "", nuances: "" };
            return (
              <>
                <p>
                  <strong>Rationale:</strong> {info.rationale}
                </p>
                <p>
                  <strong>Nuances:</strong> {info.nuances}
                </p>
              </>
            );
          })()}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setStep(6)}
              className="generator-button"
            >
              Confirm & Continue
            </button>
          </div>
        </div>
      )}

      {step === 6 && (
        <LearningObjectivesGenerator
          projectBrief={projectBrief}
          businessGoal={businessGoal}
          audienceProfile={audienceProfile}
          projectConstraints={projectConstraints}
          selectedModality={selectedModality}
          onBack={() => setStep(5)}
          onNext={() => setStep(7)}
        />
      )}

      {step === 7 && (
        <HierarchicalOutlineGenerator
          projectBrief={projectBrief}
          businessGoal={businessGoal}
          audienceProfile={audienceProfile}
          projectConstraints={projectConstraints}
          selectedModality={selectedModality}
          learningObjectives={learningObjectives}
          onBack={() => setStep(6)}
          onNext={() => setStep(8)}
        />
      )}

      {step === 8 && (
        <LearningDesignDocument
          projectBrief={projectBrief}
          businessGoal={businessGoal}
          audienceProfile={audienceProfile}
          projectConstraints={projectConstraints}
          selectedModality={selectedModality}
          learningObjectives={learningObjectives}
          courseOutline={courseOutline}
          onBack={() => setStep(7)}
        />
      )}

    </div>
  );
};

export default InitiativesNew;
