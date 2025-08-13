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

const BLENDED_OPTIONS = [
  "In-Person Workshops",
  "Virtual Instructor-Led Sessions",
  "Self-Paced Online Modules",
  "Discussion Forums",
  "Coaching or Mentoring",
  "Job Aids or Reference Guides",
];

const normalizePersona = (p = {}) => {
  const formatOption = (o = {}) => ({
    keyword: formatKeyword(o.keyword) || "General",
    text: o.text || "",
  });

  const motivations = (p.motivations || []).map((m) => ({
    ...formatOption(m),
    selected: true,
  }));
  const motivationExtras = (p.motivationOptions || []).map((m) => ({
    ...formatOption(m),
    selected: false,
  }));

  // If no motivations stored, fall back to old fields and randomize selection
  if (motivations.length === 0 && (p.motivation || motivationExtras.length)) {
    const combined = [
      p.motivation ? formatOption(p.motivation) : null,
      ...motivationExtras.map((m) => ({ ...m })),
    ].filter(Boolean);
    const rand = Math.floor(Math.random() * combined.length);
    combined.forEach((opt, i) => (opt.selected = i === rand));
    motivations.push(...combined.filter((o) => o.selected));
    motivationExtras.length = 0;
    motivationExtras.push(...combined.filter((o) => !o.selected));
  }

  const challenges = (p.challengesList || []).map((c) => ({
    ...formatOption(c),
    selected: true,
  }));
  const challengeExtras = (p.challengeOptions || []).map((c) => ({
    ...formatOption(c),
    selected: false,
  }));

  if (challenges.length === 0 && (p.challenges || challengeExtras.length)) {
    const combined = [
      p.challenges ? formatOption(p.challenges) : null,
      ...challengeExtras.map((c) => ({ ...c })),
    ].filter(Boolean);
    const rand = Math.floor(Math.random() * combined.length);
    combined.forEach((opt, i) => (opt.selected = i === rand));
    challenges.push(...combined.filter((o) => o.selected));
    challengeExtras.length = 0;
    challengeExtras.push(...combined.filter((o) => !o.selected));
  }

  return {
    ...p,
    ageRange: p.ageRange || "",
    ageRangeOptions: p.ageRangeOptions || [],
    educationLevel: p.educationLevel || "",
    educationLevelOptions: p.educationLevelOptions || [],
    techProficiency: p.techProficiency || "",
    techProficiencyOptions: p.techProficiencyOptions || [],
    learningPreferences: p.learningPreferences?.text || p.learningPreferences || "",
    learningPreferencesKeyword: formatKeyword(
      p.learningPreferences?.keyword
    ) || "",
    learningPreferencesOptions: (p.learningPreferencesOptions || []).map(
      (o) => (typeof o === "string" ? o : o.text || "")
    ),
    learningPreferenceOptionKeywords: (p.learningPreferencesOptions || []).map(
      (o) => (typeof o === "string" ? "" : formatKeyword(o.keyword))
    ),
    motivationChoices: [...motivations, ...motivationExtras],
    challengeChoices: [...challenges, ...challengeExtras],
  };
};

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
  const [sourceMaterials, setSourceMaterials] = useState([]);
  const getCombinedSource = () =>
    sourceMaterials.map((f) => f.content).join("\n");
  const [projectConstraints, setProjectConstraints] = useState("");

  const [projectBrief, setProjectBrief] = useState("");
  const [clarifyingQuestions, setClarifyingQuestions] = useState([]);
  const [clarifyingAnswers, setClarifyingAnswers] = useState([]);
  const [questionPage, setQuestionPage] = useState(0);
  const QUESTIONS_PER_PAGE = 3;
  const totalQuestionPages = Math.max(
    1,
    Math.ceil(clarifyingQuestions.length / QUESTIONS_PER_PAGE)
  );
  const isFirstQuestionPage = questionPage === 0;
  const isLastQuestionPage = questionPage >= totalQuestionPages - 1;

  const [strategy, setStrategy] = useState(null);
  const [selectedModality, setSelectedModality] = useState("");
  const [blendModalities, setBlendModalities] = useState([]);

  const [isEditingBrief, setIsEditingBrief] = useState(false);

  const [loading, setLoading] = useState(false);
  const [nextLoading, setNextLoading] = useState(false);
  const [personaLoading, setPersonaLoading] = useState(false);

  useEffect(() => {
    const isBusy = loading || nextLoading || personaLoading;
    document.body.classList.toggle("pulsing", isBusy);
    return () => document.body.classList.remove("pulsing");
  }, [loading, nextLoading, personaLoading]);

  const [error, setError] = useState("");
  const [nextError, setNextError] = useState("");
  const [personaError, setPersonaError] = useState("");

  const [personas, setPersonas] = useState([]);
  const [activePersonaIndex, setActivePersonaIndex] = useState(0);
  const [editingPersona, setEditingPersona] = useState(null);
  const [personaCount, setPersonaCount] = useState(0);
  const [usedMotivationKeywords, setUsedMotivationKeywords] = useState([]);
  const [usedChallengeKeywords, setUsedChallengeKeywords] = useState([]);
  const [usedNames, setUsedNames] = useState([]);
  const [usedLearningPrefKeywords, setUsedLearningPrefKeywords] = useState([]);

  const {
    learningObjectives,
    setLearningObjectives,
    courseOutline,
    setCourseOutline,
    learningDesignDocument,
    setLearningDesignDocument,
    resetProject,
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
  const addUsedName = (names = []) => {
    setUsedNames((prev) =>
      Array.from(new Set([...prev, ...names.filter(Boolean)]))
    );
  };
  const addUsedLearningPref = (prefs = []) => {
    setUsedLearningPrefKeywords((prev) =>
      Array.from(new Set([...prev, ...prefs.filter(Boolean)]))
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
        sourceMaterials,
        projectConstraints,
        projectBrief,
        clarifyingQuestions,
        clarifyingAnswers,
        strategy,
        selectedModality,
        blendModalities,
        learningObjectives,
        courseOutline,
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

    // Reset all local and project state when switching initiatives
    resetProject();
    setProjectName("");
    setBusinessGoal("");
    setAudienceProfile("");
    setSourceMaterials([]);
    setProjectConstraints("");
    setProjectBrief("");
    setClarifyingQuestions([]);
    setClarifyingAnswers([]);
    setQuestionPage(0);
    setStrategy(null);
    setSelectedModality("");
    setPersonas([]);
    setActivePersonaIndex(0);
    setPersonaCount(0);
    setUsedMotivationKeywords([]);
    setUsedChallengeKeywords([]);
    setUsedNames([]);
    setUsedLearningPrefKeywords([]);
    setBlendModalities([]);

    loadInitiative(uid, initiativeId)
      .then((data) => {
        if (data) {
          setProjectName(data.projectName || "");
          setBusinessGoal(data.businessGoal || "");
          setAudienceProfile(data.audienceProfile || "");
          setSourceMaterials(
            Array.isArray(data.sourceMaterials)
              ? data.sourceMaterials
              : data.sourceMaterial
              ? [{ name: "Imported", content: data.sourceMaterial }]
              : []
          );
          setProjectConstraints(data.projectConstraints || "");
          setProjectBrief(data.projectBrief || "");
          const qs = (data.clarifyingQuestions || []).slice(0, 9);
          const ans = (data.clarifyingAnswers || []).slice(0, 9);
          setClarifyingQuestions(qs);
          setClarifyingAnswers(qs.map((_, i) => ans[i] || ""));
          setQuestionPage(0);
          setStrategy(data.strategy || null);
          setSelectedModality(data.selectedModality || "");
          setBlendModalities(data.blendModalities || []);
          setLearningObjectives(data.learningObjectives || null);
          setCourseOutline(data.courseOutline || "");
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
          addUsedName([p.name]);
          addUsedLearningPref([
            p.learningPreferencesKeyword,
            ...(p.learningPreferenceOptionKeywords || []),
          ]);
        });
      })
      .catch((err) => console.error("Error loading personas:", err));
  }, [
    initiativeId,
    resetProject,
    setLearningDesignDocument,
    setLearningObjectives,
    setCourseOutline,
  ]);

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

  const extractTextFromPdf = async (buffer) => {
  const BASE = "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.54";
  const pdfjs = await import(
    /* @vite-ignore */
    `${BASE}/build/pdf.mjs`
  );

  // Set the worker source to the matching ESM worker file
  pdfjs.GlobalWorkerOptions.workerSrc = `${BASE}/build/pdf.worker.mjs`;

  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  let text = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    text += content.items.map((item) => item.str).join(" ") + "\n";
  }
  return text.trim();
};

  const extractTextFromDocx = async (buffer) => {
    if (
      typeof window === "undefined" ||
      typeof window.DecompressionStream === "undefined"
    )
      return "";
    const view = new DataView(buffer);
    const decoder = new TextDecoder();
    let offset = buffer.byteLength - 22;
    while (offset >= 0 && view.getUint32(offset, true) !== 0x06054b50) {
      offset--;
    }
    if (offset < 0) return "";
    const entries = view.getUint16(offset + 8, true);
    const cdOffset = view.getUint32(offset + 16, true);
    offset = cdOffset;
    for (let i = 0; i < entries; i++) {
      if (view.getUint32(offset, true) !== 0x02014b50) break;
      const nameLen = view.getUint16(offset + 28, true);
      const extraLen = view.getUint16(offset + 30, true);
      const commentLen = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      const name = decoder.decode(
        new Uint8Array(buffer, offset + 46, nameLen)
      );
      if (name === "word/document.xml") {
        const lhNameLen = view.getUint16(localOffset + 26, true);
        const lhExtraLen = view.getUint16(localOffset + 28, true);
        const compSize = view.getUint32(localOffset + 18, true);
        const dataStart = localOffset + 30 + lhNameLen + lhExtraLen;
        const compressed = buffer.slice(dataStart, dataStart + compSize);
        const ds = new window.DecompressionStream("deflate-raw");
        const stream = new Response(
          new Blob([compressed]).stream().pipeThrough(ds)
        );
        const xml = await stream.text();
        return xml
          .replace(/<w:p[^>]*>/g, "\n")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }
      offset += 46 + nameLen + extraLen + commentLen;
    }
    return "";
  };

  const handleFiles = async (files) => {
    for (const file of Array.from(files)) {
      try {
        if (file.name.toLowerCase().endsWith(".pdf")) {
          const buffer = await file.arrayBuffer();
          let text = await extractTextFromPdf(buffer);
          if (!text) text = await file.text();
          setSourceMaterials((prev) => [
            ...prev,
            { name: file.name, content: text },
          ]);
        } else if (file.name.toLowerCase().endsWith(".docx")) {
          const buffer = await file.arrayBuffer();
          const text = await extractTextFromDocx(buffer);
          setSourceMaterials((prev) => [
            ...prev,
            { name: file.name, content: text },
          ]);
        } else {
          const text = await file.text();
          setSourceMaterials((prev) => [
            ...prev,
            { name: file.name, content: text },
          ]);
        }
      } catch (err) {
        console.error("Failed to read file", err);
        setError(`Failed to process ${file.name}`);
      }
    }
  };

  const handleFileInput = (e) => {
    const { files } = e.target;
    if (files) handleFiles(files);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const removeFile = (index) => {
    setSourceMaterials((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setProjectBrief("");
    setClarifyingQuestions([]);
    setClarifyingAnswers([]);
    setQuestionPage(0);
    setStrategy(null);
    setPersonas([]);
    setActivePersonaIndex(0);
    setEditingPersona(null);
    setPersonaCount(0);

    try {
      const { data } = await generateProjectBrief({
        businessGoal,
        audienceProfile,
        sourceMaterial: getCombinedSource(),
        projectConstraints,
      });

      const qs = (data.clarifyingQuestions || []).slice(0, 9);
      setClarifyingQuestions(qs);
      setClarifyingAnswers(qs.map(() => ""));
      setQuestionPage(0);

      const uid = auth.currentUser?.uid;
      if (uid) {
        await saveInitiative(uid, initiativeId, {
          projectName,
          businessGoal,
          audienceProfile,
          sourceMaterials,
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
        sourceMaterial: getCombinedSource(),
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
          sourceMaterials,
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
        personaCount: personas.length,
        sourceMaterial: getCombinedSource(),
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
      setBlendModalities(data.blendedModalities || []);
      const uid = auth.currentUser?.uid;
      if (uid) {
        await saveInitiative(uid, initiativeId, {
          projectName,
          strategy: data,
          selectedModality: data.modalityRecommendation,
          blendModalities: data.blendedModalities || [],
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
    const lower = value.toLowerCase();
    setBlendModalities((prev) => {
      const next = lower.includes("blended") ? prev : [];
      const uid = auth.currentUser?.uid;
      if (uid) {
        saveInitiative(uid, initiativeId, {
          selectedModality: value,
          blendModalities: next,
        });
      }
      return next;
    });
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
      let existingNames = [...usedNames, ...personas.map((p) => p.name)];
      for (let i = 0; i < toGenerate; i++) {
        const personaRes = await generateLearnerPersona({
          projectBrief,
          businessGoal,
          audienceProfile,
          projectConstraints,
          sourceMaterial: getCombinedSource(),
          existingMotivationKeywords: usedMotivationKeywords,
          existingChallengeKeywords: usedChallengeKeywords,
          existingNames,
          existingLearningPreferenceKeywords: usedLearningPrefKeywords,
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
        const { motivationChoices = [], challengeChoices = [], ...rest } =
          personaData;
        const motivations = motivationChoices
          .filter((m) => m.selected)
          .map(({ selected, ...o }) => {
            void selected;
            return o;
          });
        const motivationOptions = motivationChoices
          .filter((m) => !m.selected)
          .map(({ selected, ...o }) => {
            void selected;
            return o;
          });
        const challengesList = challengeChoices
          .filter((c) => c.selected)
          .map(({ selected, ...o }) => {
            void selected;
            return o;
          });
        const challengeOptions = challengeChoices
          .filter((c) => !c.selected)
          .map(({ selected, ...o }) => {
            void selected;
            return o;
          });
        const personaToSave = {
          ...rest,
          motivations,
          motivation: motivations[0] || null,
          motivationOptions,
          challengesList,
          challenges: challengesList[0] || null,
          challengeOptions,
          avatar: avatarRes?.data?.avatar || null,
        };
        addUsedMotivation([
          ...motivations.map((o) => o.keyword),
          ...motivationOptions.map((o) => o.keyword),
        ]);
        addUsedChallenge([
          ...challengesList.map((o) => o.keyword),
          ...challengeOptions.map((o) => o.keyword),
        ]);
        addUsedName([personaData.name]);
        addUsedLearningPref([
          rest.learningPreferencesKeyword,
          ...(rest.learningPreferenceOptionKeywords || []),
        ]);
        existingNames.push(personaData.name);
        const uid = auth.currentUser?.uid;
        let savedPersona = personaToSave;
        if (uid) {
          const id = await savePersona(uid, initiativeId, personaToSave);
          savedPersona = { id, ...personaToSave };
        }
        newPersonas.push(normalizePersona(savedPersona));
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
      const existingNamesCurrent = personas
        .filter((_, i) => !(action === "replace" && i === activePersonaIndex))
        .map((p) => p.name);
      const existingNames = [
        ...usedNames,
        ...existingNamesCurrent,
      ];
      const personaRes = await generateLearnerPersona({
        projectBrief,
        businessGoal,
        audienceProfile,
        projectConstraints,
        sourceMaterial: getCombinedSource(),
        existingMotivationKeywords: usedMotivationKeywords,
        existingChallengeKeywords: usedChallengeKeywords,
        existingNames,
        existingLearningPreferenceKeywords: usedLearningPrefKeywords,
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

      const { motivationChoices = [], challengeChoices = [], ...rest } =
        personaData;
      const motivations = motivationChoices
        .filter((m) => m.selected)
        .map(({ selected, ...o }) => {
          void selected;
          return o;
        });
      const motivationOptions = motivationChoices
        .filter((m) => !m.selected)
        .map(({ selected, ...o }) => {
          void selected;
          return o;
        });
      const challengesList = challengeChoices
        .filter((c) => c.selected)
        .map(({ selected, ...o }) => {
          void selected;
          return o;
        });
      const challengeOptions = challengeChoices
        .filter((c) => !c.selected)
        .map(({ selected, ...o }) => {
          void selected;
          return o;
        });
      const personaToSave = {
        ...rest,
        motivations,
        motivation: motivations[0] || null,
        motivationOptions,
        challengesList,
        challenges: challengesList[0] || null,
        challengeOptions,
        avatar: avatarRes?.data?.avatar || null,
      };
      // record used keywords
      addUsedMotivation([
        ...motivations.map((o) => o.keyword),
        ...motivationOptions.map((o) => o.keyword),
      ]);
      addUsedChallenge([
        ...challengesList.map((o) => o.keyword),
        ...challengeOptions.map((o) => o.keyword),
      ]);
      addUsedName([personaData.name]);
      addUsedLearningPref([
        rest.learningPreferencesKeyword,
        ...(rest.learningPreferenceOptionKeywords || []),
      ]);
      const uid = auth.currentUser?.uid;
      if (uid) {
        if (action === "replace" && currentPersona) {
          const id = currentPersona.id;
          await savePersona(uid, initiativeId, { ...personaToSave, id });
          setPersonas((prev) =>
            prev.map((p, i) =>
              i === activePersonaIndex
                ? normalizePersona({ id, ...personaToSave })
                : p
            )
          );
        } else {
          const id = await savePersona(uid, initiativeId, personaToSave);
          const newPersona = normalizePersona({ id, ...personaToSave });
          const newIndex = personas.length;
          setPersonas((prev) => [...prev, newPersona]);
          setActivePersonaIndex(newIndex);
        }
      } else {
        if (action === "replace" && currentPersona) {
          setPersonas((prev) =>
            prev.map((p, i) =>
              i === activePersonaIndex ? normalizePersona(personaToSave) : p
            )
          );
        } else {
          const newIndex = personas.length;
          setPersonas((prev) => [...prev, normalizePersona(personaToSave)]);
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

  const toggleChoice = (field, index) => {
    const key = field === "motivation" ? "motivationChoices" : "challengeChoices";
    setEditingPersona((prev) => {
      const updated = [...(prev[key] || [])];
      const selectedCount = updated.filter((c) => c.selected).length;
      if (updated[index]) {
        if (updated[index].selected) {
          updated[index].selected = false;
        } else if (selectedCount < 3) {
          updated[index].selected = true;
        }
      }
      return { ...prev, [key]: updated };
    });
  };

  const refreshChoices = async (field) => {
    if (!editingPersona) return;
    setPersonaLoading(true);
    setPersonaError("");
    try {
      const { data } = await generateLearnerPersona({
        projectBrief,
        businessGoal,
        audienceProfile,
        projectConstraints,
        sourceMaterial: getCombinedSource(),
        existingMotivationKeywords: usedMotivationKeywords,
        existingChallengeKeywords: usedChallengeKeywords,
        refreshField: field === "motivation" ? "motivation" : "challenges",
        personaName: editingPersona.name,
      });
      const list =
        field === "motivation"
          ? data.motivationOptions || []
          : data.challengeOptions || [];
      const formatted = list.map((o) => ({
        keyword: formatKeyword(o.keyword),
        text: o.text,
        selected: false,
      }));
      if (formatted.length === 0) {
        setPersonaError("No new options available.");
      } else {
        setEditingPersona((prev) => {
          const key = field === "motivation" ? "motivationChoices" : "challengeChoices";
          const updated = [...(prev[key] || [])];
          const unselectedIdx = [];
          updated.forEach((c, i) => {
            if (!c.selected) unselectedIdx.push(i);
          });
          unselectedIdx.forEach((idx, i) => {
            if (formatted[i]) updated[idx] = formatted[i];
          });
          if (field === "motivation") {
            addUsedMotivation(formatted.map((o) => o.keyword));
          } else {
            addUsedChallenge(formatted.map((o) => o.keyword));
          }
          return { ...prev, [key]: updated };
        });
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
    const { id, motivationChoices = [], challengeChoices = [], ...rest } =
      editingPersona;
    const motivations = motivationChoices
      .filter((m) => m.selected)
      .map(({ selected, ...o }) => {
        void selected;
        return o;
      });
    const motivationOptions = motivationChoices
      .filter((m) => !m.selected)
      .map(({ selected, ...o }) => {
        void selected;
        return o;
      });
    const challengesList = challengeChoices
      .filter((c) => c.selected)
      .map(({ selected, ...o }) => {
        void selected;
        return o;
      });
    const challengeOptions = challengeChoices
      .filter((c) => !c.selected)
      .map(({ selected, ...o }) => {
        void selected;
        return o;
      });
    const personaToSave = {
      id,
      ...rest,
      motivations,
      motivation: motivations[0] || null,
      motivationOptions,
      challengesList,
      challenges: challengesList[0] || null,
      challengeOptions,
    };
    try {
      if (uid) {
        await savePersona(uid, initiativeId, personaToSave);
      }
      addUsedMotivation([
        ...motivations.map((o) => o.keyword),
        ...motivationOptions.map((o) => o.keyword),
      ]);
      addUsedChallenge([
        ...challengesList.map((o) => o.keyword),
        ...challengeOptions.map((o) => o.keyword),
      ]);
      addUsedLearningPref([
        rest.learningPreferencesKeyword,
        ...(rest.learningPreferenceOptionKeywords || []),
      ]);
      setPersonas((prev) =>
        prev.map((p, i) =>
          i === activePersonaIndex ? normalizePersona(personaToSave) : p
        )
      );
      setEditingPersona(null);
    } catch (err) {
      console.error("Error saving persona:", err);
      setPersonaError(err?.message || "Error saving persona.");
    }
  };

  const handleRegeneratePersonaEdit = async () => {
    await handleGeneratePersona("replace");
    setEditingPersona(null);
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
        {steps.map((label, idx) => (
          <div
            key={label}
            className={`step-segment ${
              idx + 1 === step ? "active" : idx + 1 < step ? "completed" : ""
            }`}
            onClick={() => setStep(idx + 1)}
          >
            {label}
          </div>
        ))}
      </div>
      {saveStatus && <p className="save-status">{saveStatus}</p>}

      {step === 1 && (
        <div className="initiative-card">
          <form onSubmit={handleSubmit} className="generator-form">
            <h3>Project Intake</h3>
            <p>Tell us about your project. The more detail, the better.</p>
            <div className="intake-grid">
              <div className="intake-left">
                <label>
                  Project Name
                  <input
                    type="text"
                    value={projectName}
                    placeholder="e.g., 'Q3 Sales Onboarding'"
                    onChange={(e) => setProjectName(e.target.value)}
                    className="generator-input"
                  />
                </label>
                <label>
                What is the primary business goal?
                <input
                  type="text"
                  value={businessGoal}
                  placeholder="e.g., 'Reduce support tickets for Product X by 20%'"
                  onChange={(e) => setBusinessGoal(e.target.value)}
                  className="generator-input"
                />
              </label>
              <label>
                Who is the target audience?
                <textarea
                  value={audienceProfile}
                  placeholder="e.g., 'New sales hires, age 22-28, with no prior industry experience'"
                  onChange={(e) => setAudienceProfile(e.target.value)}
                  className="generator-input"
                  rows={3}
                />
              </label>
            </div>
            <div
              className="upload-card"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <input
                type="file"
                onChange={handleFileInput}
                className="file-input"
                accept=".pdf,.docx,.txt"
                multiple
              />
              <div className="upload-title">Upload Source Material (Optional)</div>
              <div className="upload-subtitle">Click to upload or drag and drop</div>
              <div className="upload-hint">PDF, DOCX, TXT (MAX. 10MB)</div>
              {sourceMaterials.length > 0 && (
                <ul className="file-list">
                  {sourceMaterials.map((f, idx) => (
                    <li key={idx}>
                      {f.name}
                      <button
                        type="button"
                        className="remove-file"
                        onClick={() => removeFile(idx)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="button-row">
            <button
              type="button"
              onClick={handleSave}
              className="generator-button save-button"
              disabled={loading}
            >
              Save
            </button>
            <button
              type="submit"
              disabled={loading}
              className="generator-button next-button"
            >
              {loading ? "Analyzing..." : "Next"}
            </button>
          </div>
          {error && <p className="generator-error">{error}</p>}
        </form>
        </div>
      )}

      {step === 2 && (
        <div className="initiative-card generator-result">
          <p>
            These questions are optional but answering them will strengthen your project brief.
          </p>
          <p className="page-indicator">
            Page {questionPage + 1} of {totalQuestionPages}
          </p>
          {clarifyingQuestions
            .slice(
              questionPage * QUESTIONS_PER_PAGE,
              questionPage * QUESTIONS_PER_PAGE + QUESTIONS_PER_PAGE
            )
            .map((q, idx) => {
              const overallIdx = questionPage * QUESTIONS_PER_PAGE + idx;
              return (
                <div key={overallIdx}>
                  <p>{q}</p>
                  <textarea
                    className="generator-input clarify-textarea"
                    value={clarifyingAnswers[overallIdx] || ""}
                    onChange={(e) =>
                      handleAnswerChange(overallIdx, e.target.value)
                    }
                    rows={3}
                  />
                </div>
              );
            })}
          <p className="page-indicator">
            Page {questionPage + 1} of {totalQuestionPages}
          </p>
          <div className="button-row">
            <button
              type="button"
              onClick={() =>
                isFirstQuestionPage
                  ? setStep(1)
                  : setQuestionPage((prev) => Math.max(prev - 1, 0))
              }
              className="generator-button back-button"
            >
              Back
            </button>
            <button
              type="button"
              onClick={async () => {
                await handleSave();
                if (isLastQuestionPage) {
                  await handleGenerateBrief();
                } else {
                  setQuestionPage((prev) => prev + 1);
                }
              }}
              disabled={loading}
              className="generator-button next-button"
            >
              {loading
                ? "Generating..."
                : isLastQuestionPage
                ? "Next: Generate Brief"
                : "Next"}
            </button>
          </div>
          {error && <p className="generator-error">{error}</p>}
        </div>
      )}

      {step === 3 && (
        <div
          className="initiative-card generator-result"
          ref={projectBriefRef}
        >
          <h3>Project Brief</h3>
          {isEditingBrief ? (
            <textarea
              className="generator-input project-brief-textarea"
              value={projectBrief}
              onChange={(e) => setProjectBrief(e.target.value)}
              rows={10}
            />
          ) : (
            <div className="project-brief-display">
              {projectBrief
                .split("\n")
                .map((para, idx) => (
                  <p key={idx}>{para}</p>
                ))}
            </div>
          )}
          <div className="button-row">
            <button
              type="button"
              onClick={() => {
                setQuestionPage(totalQuestionPages - 1);
                setStep(2);
              }}
              className="generator-button back-button"
            >
              Back
            </button>
            {isEditingBrief ? (
              <button
                type="button"
                onClick={async () => {
                  await handleSave();
                  setIsEditingBrief(false);
                }}
                className="generator-button save-button"
              >
                Save
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingBrief(true)}
                className="generator-button edit-button"
              >
                Edit
              </button>
            )}
            <button
              type="button"
              onClick={handleDownload}
              className="generator-button"
            >
              Download Brief
            </button>
            <button
              type="button"
              onClick={() => setStep(4)}
              className="generator-button next-button"
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
        <div
          className="initiative-card generator-result"
        >
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
                    <div className="persona-edit-grid">
                      <div className="grid-item glass-card top-row">
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
                        <textarea
                          className="generator-input"
                          placeholder="Brief Bio"
                          value={editingPersona.learningPreferences || ""}
                          onChange={(e) =>
                            handlePersonaFieldChange(
                              "learningPreferences",
                              e.target.value
                            )
                          }
                          rows={3}
                        />
                      </div>
                      <div className="grid-item glass-card top-row">
                        <div className="field-group">
                          <label>Age Group</label>
                          <select
                            className="generator-input"
                            value={editingPersona.ageRange}
                            onChange={(e) =>
                              handlePersonaFieldChange("ageRange", e.target.value)
                            }
                          >
                            {[editingPersona.ageRange,
                              ...editingPersona.ageRangeOptions].map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="field-group">
                          <label>Education Level</label>
                          <select
                            className="generator-input"
                            value={editingPersona.educationLevel}
                            onChange={(e) =>
                              handlePersonaFieldChange(
                                "educationLevel",
                                e.target.value
                              )
                            }
                          >
                            {[editingPersona.educationLevel,
                              ...editingPersona.educationLevelOptions].map(
                              (opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              )
                            )}
                          </select>
                        </div>
                        <div className="field-group">
                          <label>Tech Proficiency</label>
                          <select
                            className="generator-input"
                            value={editingPersona.techProficiency}
                            onChange={(e) =>
                              handlePersonaFieldChange(
                                "techProficiency",
                                e.target.value
                              )
                            }
                          >
                            {[editingPersona.techProficiency,
                              ...editingPersona.techProficiencyOptions].map(
                              (opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              )
                            )}
                          </select>
                        </div>
                      </div>
                      <div className="grid-item glass-card bottom-row">
                        <h5>Motivation</h5>
                        <div className="pill-row">
                          {editingPersona.motivationChoices?.map((m, i) => (
                            <button
                              key={i}
                              type="button"
                              className={`pill ${m.selected ? "selected" : ""}`}
                              onClick={() => toggleChoice("motivation", i)}
                            >
                              {m.keyword}
                            </button>
                          ))}
                        </div>
                        {(editingPersona.motivationChoices?.filter((m) => m.selected) || []).length < 3 && (
                          <button
                            type="button"
                            onClick={() => refreshChoices("motivation")}
                            className="generator-button"
                          >
                            Generate more
                          </button>
                        )}
                      </div>
                      <div className="grid-item glass-card bottom-row">
                        <h5>Challenges</h5>
                        <div className="pill-row">
                          {editingPersona.challengeChoices?.map((c, i) => (
                            <button
                              key={i}
                              type="button"
                              className={`pill ${c.selected ? "selected" : ""}`}
                              onClick={() => toggleChoice("challenge", i)}
                            >
                              {c.keyword}
                            </button>
                          ))}
                        </div>
                        {(editingPersona.challengeChoices?.filter((c) => c.selected) || []).length < 3 && (
                          <button
                            type="button"
                            onClick={() => refreshChoices("challenge")}
                            className="generator-button"
                          >
                            Generate more
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="button-row">
                      <button
                        onClick={() => handleRegeneratePersonaEdit()}
                        disabled={personaLoading}
                        className="generator-button"
                        type="button"
                      >
                        {personaLoading ? "Generating..." : "Regenerate Persona"}
                      </button>
                      <button
                        onClick={() => setEditingPersona(null)}
                        className="generator-button cancel-button"
                        type="button"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSavePersonaEdits}
                        disabled={personaLoading}
                        className="generator-button save-button"
                        type="button"
                      >
                        Save
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
          {!editingPersona && (
            <div className="button-row">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="generator-button back-button"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="generator-button save-button"
              >
                Save
              </button>
              <button
                type="button"
                onClick={handleGenerateStrategy}
                disabled={nextLoading}
                className="generator-button next-button"
              >
                {nextLoading ? "Generating..." : "Next"}
              </button>
            </div>
          )}
          {nextError && <p className="generator-error">{nextError}</p>}
        </div>
      )}

      {step === 5 && strategy && (
        <div
          className="initiative-card generator-result"
        >
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
                {selectedModality.toLowerCase().includes("blended") && (
                  <div className="blend-options">
                    {BLENDED_OPTIONS.map((mod) => (
                      <label key={mod} className="blend-option">
                        <input
                          type="checkbox"
                          checked={blendModalities.includes(mod)}
                          onChange={() =>
                            setBlendModalities((prev) => {
                              const next = prev.includes(mod)
                                ? prev.filter((m) => m !== mod)
                                : [...prev, mod];
                              const uid = auth.currentUser?.uid;
                              if (uid) {
                                saveInitiative(uid, initiativeId, {
                                  blendModalities: next,
                                });
                              }
                              return next;
                            })
                          }
                        />
                        {mod}
                      </label>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
          <div className="button-row">
            <button
              type="button"
              onClick={() => setStep(4)}
              className="generator-button back-button"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="generator-button save-button"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setStep(6)}
              className="generator-button next-button"
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
          blendModalities={blendModalities}
          sourceMaterials={sourceMaterials}
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
          blendModalities={blendModalities}
          learningObjectives={learningObjectives}
          sourceMaterials={sourceMaterials}
          onBack={() => setStep(6)}
          onNext={() => setStep(8)}
        />
      )}

      {step === 8 && (
        <LearningDesignDocument
          projectName={projectName}
          projectBrief={projectBrief}
          businessGoal={businessGoal}
          audienceProfile={audienceProfile}
          projectConstraints={projectConstraints}
          selectedModality={selectedModality}
          blendModalities={blendModalities}
          learningObjectives={learningObjectives}
          courseOutline={courseOutline}
          sourceMaterials={sourceMaterials}
          onBack={() => setStep(7)}
        />
      )}

    </div>
  );
};

export default InitiativesNew;
