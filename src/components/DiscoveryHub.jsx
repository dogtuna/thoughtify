import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, functions, appCheck } from "../firebase";
import { doc, getDoc, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getToken as getAppCheckToken } from "firebase/app-check";
import { loadInitiative, saveInitiative } from "../utils/initiatives";
import ai from "../ai";
import ProjectStatus from "./ProjectStatus.jsx";
import PastUpdateView from "./PastUpdateView.jsx";
import "./AIToolsGenerators.css";
import "./DiscoveryHub.css";

const colorPalette = [
  "#f8d7da",
  "#d1ecf1",
  "#d4edda",
  "#fff3cd",
  "#cce5ff",
  "#e2ccff",
];

const normalizeContacts = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const DiscoveryHub = () => {
  const [searchParams] = useSearchParams();
  const initiativeId = searchParams.get("initiativeId");
  const [questions, setQuestions] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [contactFilter, setContactFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [groupBy, setGroupBy] = useState("");
  const [selected, setSelected] = useState([]);
  const [selectMode, setSelectMode] = useState(false);
  const [uid, setUid] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState("questions");
  const [summary, setSummary] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [menu, setMenu] = useState(null);
  const [focusRole, setFocusRole] = useState("");
  const [editData, setEditData] = useState(null);
  const [emailConnected, setEmailConnected] = useState(false);
  const [emailDraft, setEmailDraft] = useState(null);
  const [generatingEmail, setGeneratingEmail] = useState(false);
  const [editingDraft, setEditingDraft] = useState(false);
  const [draftQueue, setDraftQueue] = useState([]);
  const [draftIndex, setDraftIndex] = useState(0);
  const [recipientModal, setRecipientModal] = useState(null);
  const [analysisModal, setAnalysisModal] = useState(null);
  const [answerDrafts, setAnswerDrafts] = useState({});
  const [analyzing, setAnalyzing] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [businessGoal, setBusinessGoal] = useState("");
  const [statusHistory, setStatusHistory] = useState("");
  const [audienceProfile, setAudienceProfile] = useState("");
  const [projectConstraints, setProjectConstraints] = useState("");
  const [viewingStatus, setViewingStatus] = useState("");
  const navigate = useNavigate();

  const generateDraft = (recipients, questionObjs) => {
    const userName =
      auth.currentUser?.displayName || auth.currentUser?.email || "";
    const toNames = recipients.join(", ");
    const questionsText =
      questionObjs.length === 1
        ? questionObjs[0].text
        : questionObjs.map((q) => `- ${q.text}`).join("\n");
    const subject =
      questionObjs.length === 1
        ? `Clarification Needed: ${questionObjs[0].text}`
        : `Clarification Needed on ${questionObjs.length} Questions`;
    const body = `Hi ${toNames},\n\nWe're collecting information to ensure our work stays on track and would appreciate your input. Could you please answer the following ${
      questionObjs.length > 1 ? "questions" : "question"
    }?\n\n${questionsText}\n\nYour response will help us move forward.\n\nBest regards,\n${userName}`;
    return {
      subject,
      body,
      recipients,
      questionIds: questionObjs.map((q) => q.id),
    };
  };

  const showDraft = (draft) => {
    setGeneratingEmail(true);
    setEditingDraft(false);
    setEmailDraft({
      recipients: draft.recipients,
      questionIds: draft.questionIds,
    });
    setTimeout(() => {
      setEmailDraft(draft);
      setGeneratingEmail(false);
    }, 500);
  };

  const startDraftQueue = (drafts) => {
    setDraftQueue(drafts);
    setDraftIndex(0);
    showDraft(drafts[0]);
  };

  const nextDraft = () => {
    if (draftIndex < draftQueue.length - 1) {
      const next = draftIndex + 1;
      setDraftIndex(next);
      showDraft(draftQueue[next]);
    } else {
      setEmailDraft(null);
      setDraftQueue([]);
      setDraftIndex(0);
    }
  };

  useEffect(() => {
    try {
      const hist = JSON.parse(
        localStorage.getItem(`projectStatusHistory:${initiativeId}`) || "[]"
      );
      setStatusHistory(hist);
    } catch (err) {
      console.error("load status history", err);
    }
  }, [initiativeId]);

  useEffect(() => {
    document.body.classList.toggle("pulsing", analyzing);
    return () => document.body.classList.remove("pulsing");
  }, [analyzing]);

  const openRecipientModal = (options, onConfirm) => {
    setRecipientModal({ options, selected: [], onConfirm });
  };

  const draftEmail = (q) => {
    if (!emailConnected) {
      if (window.confirm("Connect your Gmail account in settings?")) {
        navigate("/settings");
      }
      return;
    }
    if (!auth.currentUser) {
      alert("Please log in to draft emails.");
      console.warn("auth.currentUser is null when drafting email");
      return;
    }
    const targets = q.contacts || [];
    if (!targets.length) return;
    const handleSelection = (chosen) => {
      if (!chosen.length) return;
      const drafts = chosen.map((name) =>
        generateDraft([name], [{ text: q.question, id: q.id }])
      );
      startDraftQueue(drafts);
    };
    if (targets.length === 1) {
      handleSelection(targets);
    } else {
      openRecipientModal(targets, handleSelection);
    }
  };

  const sendEmail = async () => {
    if (!emailDraft) return;
    const emails = emailDraft.recipients
      .map((n) => contacts.find((c) => c.name === n)?.email)
      .filter((e) => e);
    if (!emails.length) {
      alert("Missing email address for selected contact");
      return;
    }
    try {
      if (appCheck) {
        await getAppCheckToken(appCheck);
      }
      await auth.currentUser.getIdToken(true);
      const callable = httpsCallable(functions, "sendQuestionEmail");
      await callable({
        provider: "gmail",
        recipientEmail: emails.join(","),
        subject: emailDraft.subject,
        message: emailDraft.body,
        questionId: emailDraft.questionIds[0],
      });
      for (const idx of emailDraft.questionIds) {
        await markAsked(idx, emailDraft.recipients);
      }
      alert("Email sent");
      nextDraft();
    } catch (err) {
      console.error("sendEmail error", err);
      alert("Error sending email");
    }
  };

  const copyDraft = () => {
    if (emailDraft && navigator.clipboard) {
      navigator.clipboard.writeText(
        `${emailDraft.subject}\n\n${emailDraft.body}`
      );
      nextDraft();
    }
  };

  const analyzeAnswer = async (question, text) => {
    try {
      const contextPieces = [];
      if (projectName) contextPieces.push(`Project Name: ${projectName}`);
      if (businessGoal) contextPieces.push(`Business Goal: ${businessGoal}`);
      if (audienceProfile)
        contextPieces.push(`Audience Profile: ${audienceProfile}`);
      if (projectConstraints)
        contextPieces.push(`Project Constraints: ${projectConstraints}`);
      if (contacts.length) {
        contextPieces.push(
          `Key Contacts: ${contacts
            .map((c) => `${c.name}${c.role ? ` (${c.role})` : ""}`)
            .join(", ")}`
        );
      }
      if (questions.length) {
          const qa = questions
            .map((q) => {
              const answers = Object.entries(q.answers || {})
                .map(([name, value]) => `${name}: ${value?.text || ""}`)
                .filter((s) => s.trim())
                .join("; ");
              return answers ? `${q.question} | ${answers}` : `${q.question}`;
            })
            .join("\n");
        contextPieces.push(`Existing Q&A:\n${qa}`);
      }
      if (documents.length) {
        const docs = documents
          .map((d) => `${d.name}:\n${d.content}`)
          .join("\n");
        contextPieces.push(`Source Materials:\n${docs}`);
      }
      const projectContext = contextPieces.join("\n\n");

      const prompt = `You are an expert Instructional Designer and Performance Consultant. You are analyzing a stakeholder's answer to a specific discovery question. Your goal is to understand what this answer means for the training project and to determine if any further clarification is needed for this question only.

Project Context:
${projectContext}

Discovery Question:
${question}

Answer:
${text}

Please provide a JSON object with two fields:
- "analysis": a concise summary of what this answer reveals about the question in the context of the project.
- "suggestions": follow-up discovery actions strictly for clarifying or verifying this question. Avoid design, development, or implementation tasks. Do not propose actions that duplicate existing clarifying questions unless recommending that a different stakeholder be asked to confirm the information. If the answer fully addresses the question, return an empty array.

Respond ONLY in this JSON format:
{"analysis": "...", "suggestions": ["..."]}`;
      const { text: res } = await ai.generate(prompt);
      const parseResponse = (str) => {
        const parsed = JSON.parse(str);
        const analysis =
          typeof parsed.analysis === "string"
            ? parsed.analysis
            : JSON.stringify(parsed.analysis);
        const suggestions = Array.isArray(parsed.suggestions)
          ? parsed.suggestions.filter((s) => typeof s === "string")
          : [];
        return { analysis, suggestions };
      };

      if (typeof res === "string") {
        try {
          return parseResponse(res);
        } catch {
          const match = res.match(/\{[\s\S]*\}/);
          if (match) {
            try {
              return parseResponse(match[0]);
            } catch {
              // fall through
            }
          }
          return { analysis: res.trim(), suggestions: [] };
        }
      }
      return { analysis: "Unexpected response format.", suggestions: [] };
    } catch (err) {
      console.error("analyzeAnswer error", err);
      return {
        analysis: "Analysis could not be generated.",
        suggestions: [],
      };
    }
  };

  const draftReply = (idx, name, suggestions) => {
    const userName =
      auth.currentUser?.displayName || auth.currentUser?.email || "";
    const toNames = name;
    let body = `Hi ${toNames},\n\nThank you for the information.\n`;
    if (suggestions.length) {
      body += `Could you also provide the following: ${suggestions.join(", ")}?\n\n`;
    }
    body += `Best regards,\n${userName}`;
    const draft = {
      subject: "Thank you for the information",
      body,
      recipients: [name],
      questionIds: [idx],
    };
    startDraftQueue([draft]);
  };

  const createTasksFromAnalysis = async (name, suggestions) => {
    if (!uid || !suggestions.length) return;
    const email = contacts.find((c) => c.name === name)?.email || "";
    try {
      for (const s of suggestions) {
        await addDoc(collection(db, "profiles", uid, "taskQueue"), {
          name,
          email,
          message: `Locate: ${s}`,
          status: "open",
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      console.error("createTasksFromAnalysis error", err);
    }
  };

  const handleAnswerSubmit = async (idx, name) => {
    const key = `${idx}-${name}`;
    const text = (answerDrafts[key] || "").trim();
    if (!text) return;
      updateAnswer(idx, name, text);
    setAnswerDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setAnalyzing(true);
    const result = await analyzeAnswer(questions[idx]?.question || "", text);
    setAnalyzing(false);
    setAnalysisModal({ idx, name, ...result, selected: result.suggestions });
  };

  const toggleSuggestion = (s) => {
    setAnalysisModal((prev) => {
      const selected = prev.selected.includes(s)
        ? prev.selected.filter((t) => t !== s)
        : [...prev.selected, s];
      return { ...prev, selected };
    });
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUid(user.uid);
        const tokenSnap = await getDoc(
          doc(db, "users", user.uid, "emailTokens", "gmail")
        );
        setEmailConnected(tokenSnap.exists());
        if (initiativeId) {
          const init = await loadInitiative(user.uid, initiativeId);
          setProjectName(init?.projectName || "");
          setBusinessGoal(init?.businessGoal || "");
          setAudienceProfile(init?.audienceProfile || "");
          setProjectConstraints(init?.projectConstraints || "");
          const contactsInit = (init?.keyContacts || []).map((c, i) => ({
            ...c,
            color: colorPalette[i % colorPalette.length],
          }));
          setContacts(contactsInit);
          const qs = (init?.clarifyingQuestions || []).map((q, idx) => {
            const contactValue =
              init?.clarifyingContacts?.[idx] ?? q.stakeholders ?? [];
            const names = normalizeContacts(contactValue).map((c) => {
              const match = contactsInit.find(
                (k) => k.role === c || k.name === c
              );
              return match?.name || c;
            });
            const askedData = init?.clarifyingAsked?.[idx] || {};
            const asked = {};
            names.forEach((n) => {
              if (typeof askedData === "object") {
                asked[n] = !!askedData[n];
              } else {
                asked[n] = !!askedData;
              }
            });
            const rawAnswers = init?.clarifyingAnswers?.[idx] || {};
            const dateMap = init?.clarifyingAnswerDates?.[idx] || {};
            const answers = {};
            Object.entries(rawAnswers).forEach(([n, v]) => {
              if (v && typeof v === "object" && "text" in v) {
                answers[n] = v;
              } else {
                answers[n] = {
                  text: v,
                  timestamp: dateMap[n] || null,
                };
              }
            });
            return {
              question: typeof q === "string" ? q : q.question,
              contacts: names,
              answers,
              asked,
              id: idx,
            };
          });
          setQuestions(qs);
          setDocuments(init?.sourceMaterials || []);
        }
        setLoaded(true);
      } else {
        setLoaded(true);
      }
    });
    return () => unsubscribe();
  }, [initiativeId]);

  const updateAnswer = (idx, name, value) => {
    setQuestions((prev) => {
      const updated = [...prev];
      const q = updated[idx];
      q.answers = {
        ...q.answers,
        [name]: { text: value, timestamp: new Date().toISOString() },
      };
      if (value && !q.asked[name]) {
        q.asked[name] = true;
      }
      if (uid) {
        saveInitiative(uid, initiativeId, {
          clarifyingAnswers: updated.map((qq) => qq.answers),
          clarifyingAsked: updated.map((qq) => qq.asked),
        });
      }
      return updated;
    });
  };

  const addContact = () => {
    const name = prompt("Contact name?");
    if (!name) return null;
    const role = prompt("Contact role? (optional)") || "";
    const email = prompt("Contact email? (optional)") || "";
    const color = colorPalette[contacts.length % colorPalette.length];
    const newContact = { role, name, email, color };
    const updated = [...contacts, newContact];
    setContacts(updated);
    if (uid) {
      saveInitiative(uid, initiativeId, {
        keyContacts: updated.map(({ name, role, email }) => ({
          name,
          role,
          email,
        })),
      });
    }
    return name;
  };

  const addContactToQuestion = (idx, name) => {
    setQuestions((prev) => {
      const updated = [...prev];
      const q = updated[idx];
      if (!q.contacts.includes(name)) {
        q.contacts = [...q.contacts, name];
        q.asked = { ...q.asked, [name]: false };
      }
      if (uid) {
        saveInitiative(uid, initiativeId, {
          clarifyingContacts: Object.fromEntries(
            updated.map((qq, i) => [i, qq.contacts])
          ),
          clarifyingAsked: updated.map((qq) => qq.asked),
        });
      }
      return updated;
    });
  };

  const removeContactFromQuestion = (idx, name) => {
    setQuestions((prev) => {
      const updated = [...prev];
      const q = updated[idx];
      q.contacts = q.contacts.filter((r) => r !== name);
      if (q.answers[name]) {
        delete q.answers[name];
      }
      if (q.asked[name] !== undefined) {
        delete q.asked[name];
      }
      if (uid) {
        saveInitiative(uid, initiativeId, {
          clarifyingContacts: Object.fromEntries(
            updated.map((qq, i) => [i, qq.contacts])
          ),
          clarifyingAnswers: updated.map((qq) => qq.answers),
          clarifyingAsked: updated.map((qq) => qq.asked),
        });
      }
      return updated;
    });
  };

  const handleContactSelect = (idx, value) => {
    if (value === "__add__") {
      const newName = addContact();
      if (newName) addContactToQuestion(idx, newName);
    } else if (value) {
      addContactToQuestion(idx, value);
    }
  };

  const markAsked = async (idx, names = []) => {
    const text = questions[idx]?.question || "";
    let updatedQuestions = questions;
    setQuestions((prev) => {
      const updated = [...prev];
      const q = updated[idx];
      if (q) {
        const targets = names.length ? names : q.contacts;
        targets.forEach((n) => {
          q.asked[n] = true;
        });
      }
      updatedQuestions = updated;
      return updated;
    });
    if (uid) {
      const askedArray = updatedQuestions.map((qq) => qq?.asked || {});
      await saveInitiative(uid, initiativeId, {
        clarifyingAsked: askedArray,
      });
    }
    return text;
  };

  const handleDocFiles = async (files) => {
    const newDocs = [];
    for (const file of Array.from(files)) {
      const content = await file.text();
      newDocs.push({ name: file.name, content, addedAt: new Date().toISOString() });
    }
    setDocuments((prev) => {
      const updated = [...prev, ...newDocs];
      if (uid) {
        saveInitiative(uid, initiativeId, { sourceMaterials: updated });
      }
      return updated;
    });
  };

  const handleDocInput = (e) => {
    if (e.target.files) handleDocFiles(e.target.files);
  };

  const handleDocDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files) handleDocFiles(e.dataTransfer.files);
  };

  const handleDocDragOver = (e) => {
    e.preventDefault();
  };

  const removeDocument = (idx) => {
    setDocuments((prev) => {
      const updated = prev.filter((_, i) => i !== idx);
      if (uid) {
        saveInitiative(uid, initiativeId, { sourceMaterials: updated });
      }
      return updated;
    });
  };

  const summarizeText = (text) => {
    const words = text.trim().split(/\s+/);
    return words.slice(0, 50).join(" ") + (words.length > 50 ? "..." : "");
  };

  const handleSummarize = (text) => {
    setSummary(summarizeText(text));
    setShowSummary(true);
  };

  const handleSummarizeAll = () => {
    const combined = documents.map((d) => d.content).join(" ");
    handleSummarize(combined);
  };

  const toggleSelect = (key) => {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((i) => i !== key) : [...prev, key]
    );
  };

  const askSelected = () => {
    if (!selected.length) return;
    const selections = selected.map((k) => {
      const parts = k.split("|");
      return {
        idx: parseInt(parts[0], 10),
        names: parts[2] ? parts[2].split(",") : [],
      };
    });
    const contactMap = {};
    selections.forEach((s) => {
      const q = questions[s.idx];
      const targets = s.names.length ? s.names : q.contacts;
      targets.forEach((n) => {
        if (!contactMap[n]) contactMap[n] = [];
        contactMap[n].push({ text: q.question, id: s.idx });
      });
    });
    const allContacts = Object.keys(contactMap);
    if (!allContacts.length) return;
    const handleSelection = (chosen) => {
      const drafts = chosen
        .map((name) =>
          contactMap[name] ? generateDraft([name], contactMap[name]) : null
        )
        .filter((d) => d && d.questionIds.length);
      if (!drafts.length) return;
      startDraftQueue(drafts);
      setSelected([]);
    };
    if (allContacts.length === 1) {
      handleSelection(allContacts);
    } else {
      openRecipientModal(allContacts, handleSelection);
    }
  };

  const sortUnassignedFirst = (arr) =>
    arr.sort((a, b) => {
      const aUn = a.contacts.length === 0;
      const bUn = b.contacts.length === 0;
      if (aUn && !bUn) return -1;
      if (!aUn && bUn) return 1;
      return a.idx - b.idx;
    });

  const getColor = (name) =>
    contacts.find((c) => c.name === name)?.color || "#e9ecef";

  const openContextMenu = (e, name, idx) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, name, idx });
  };

  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const startEditContact = (name) => {
    const contact = contacts.find((c) => c.name === name);
    if (!contact) return;
    setEditData({
      original: name,
      name: contact.name,
      role: contact.role,
      email: contact.email || "",
    });
  };

  const saveEditContact = () => {
    if (!editData) return;
    const { original, name, role, email } = editData;
    const idx = contacts.findIndex((c) => c.name === original);
    if (idx === -1) return;
    const updatedContacts = contacts.map((c, i) =>
      i === idx ? { ...c, name, role, email } : c
    );
    const updatedQuestions = questions.map((q) => {
      const newContacts = q.contacts.map((n) => (n === original ? name : n));
      const newAnswers = {};
      Object.entries(q.answers).forEach(([n, v]) => {
        newAnswers[n === original ? name : n] = v;
      });
      const newAsked = {};
      Object.entries(q.asked).forEach(([n, v]) => {
        newAsked[n === original ? name : n] = v;
      });
      return {
        ...q,
        contacts: newContacts,
        answers: newAnswers,
        asked: newAsked,
      };
    });
    setContacts(updatedContacts);
    setQuestions(updatedQuestions);
    if (uid) {
      saveInitiative(uid, initiativeId, {
        keyContacts: updatedContacts.map(({ name, role, email }) => ({
          name,
          role,
          email,
        })),
        clarifyingContacts: Object.fromEntries(
          updatedQuestions.map((qq, i) => [i, qq.contacts])
        ),
        clarifyingAnswers: updatedQuestions.map((qq) => qq.answers),
        clarifyingAsked: updatedQuestions.map((qq) => qq.asked),
      });
    }
    setEditData(null);
  };

  if (!loaded) {
    return (
      <div className="dashboard-container">
        <h2>Loading...</h2>
      </div>
    );
  }
  const statusLabel = (s) =>
    s === "toask" ? "To Ask" : s === "asked" ? "Asked" : "Answered";

  const items = [];
  questions.forEach((q, idx) => {
    const toAskNames = q.contacts.filter((n) => !q.asked[n]);
    if (toAskNames.length || q.contacts.length === 0) {
      items.push({ ...q, idx, contacts: toAskNames, status: "toask" });
    }
    const askedNames = q.contacts.filter(
      (n) => q.asked[n] && !(q.answers[n]?.text || "").trim()
    );
    if (askedNames.length) {
      items.push({ ...q, idx, contacts: askedNames, status: "asked" });
    }
    const answeredNames = q.contacts.filter((n) => (q.answers[n]?.text || "").trim());
    if (answeredNames.length) {
      items.push({ ...q, idx, contacts: answeredNames, status: "answered" });
    }
  });

  let filtered = items.filter(
    (q) =>
      (!contactFilter || q.contacts.includes(contactFilter)) &&
      (!statusFilter || q.status === statusFilter)
  );
  sortUnassignedFirst(filtered);

  let grouped = { All: filtered };
  if (groupBy === "contact") {
    grouped = {};
    filtered.forEach((q) => {
      const names = q.contacts.length ? q.contacts : ["Unassigned"];
      names.forEach((n) => {
        const qCopy = { ...q, contacts: [n] };
        grouped[n] = grouped[n] || [];
        grouped[n].push(qCopy);
      });
    });
    const ordered = {};
    if (grouped["Unassigned"]) {
      ordered["Unassigned"] = sortUnassignedFirst(grouped["Unassigned"]);
      delete grouped["Unassigned"];
    }
    Object.keys(grouped)
      .sort()
      .forEach((k) => {
        ordered[k] = sortUnassignedFirst(grouped[k]);
      });
    grouped = ordered;
  } else if (groupBy === "role") {
    grouped = {};
    filtered.forEach((q) => {
      const roles = q.contacts.length
        ? q.contacts.map(
            (n) => contacts.find((c) => c.name === n)?.role || "No Role"
          )
        : ["Unassigned"];
      const uniqueRoles = Array.from(new Set(roles));
      uniqueRoles.forEach((r) => {
        const label = r && r !== "" ? r : "No Role";
        const namesForRole = q.contacts.filter(
          (n) => (contacts.find((c) => c.name === n)?.role || "No Role") === r
        );
        const qCopy = { ...q, contacts: namesForRole };
        grouped[label] = grouped[label] || [];
        grouped[label].push(qCopy);
      });
    });
    const ordered = {};
    if (grouped["Unassigned"]) {
      ordered["Unassigned"] = sortUnassignedFirst(grouped["Unassigned"]);
      delete grouped["Unassigned"];
    }
    if (focusRole && grouped[focusRole]) {
      ordered[focusRole] = sortUnassignedFirst(grouped[focusRole]);
      delete grouped[focusRole];
    }
    Object.keys(grouped)
      .sort()
      .forEach((k) => {
        ordered[k] = sortUnassignedFirst(grouped[k]);
      });
    grouped = ordered;
  } else if (groupBy === "status") {
    grouped = {};
    filtered.forEach((q) => {
      const label = statusLabel(q.status);
      grouped[label] = grouped[label] || [];
      grouped[label].push(q);
    });
    Object.keys(grouped).forEach((k) => sortUnassignedFirst(grouped[k]));
  } else {
    grouped["All"] = sortUnassignedFirst(grouped["All"]);
  }

  return (
    <div className="dashboard-container discovery-hub">
      <aside className="sidebar">
        <h2>Discovery Hub</h2>
        <ul>
          <li
            className={active === "documents" ? "active" : ""}
            onClick={() => setActive("documents")}
          >
            Documents
          </li>
          <li className={active === "questions" ? "active" : ""}>
            <span
              className="questions"
              onClick={() => {
                setActive("questions");
                setStatusFilter("");
              }}
            >
              Questions
            </span>
            {active === "questions" && (
              <ul className="sub-menu">
                <li
                  className={statusFilter === "toask" ? "active" : ""}
                  onClick={() => setStatusFilter("toask")}
                >
                  Ask
                </li>
                <li
                  className={statusFilter === "asked" ? "active" : ""}
                  onClick={() => setStatusFilter("asked")}
                >
                  Asked
                </li>
                <li
                  className={statusFilter === "answered" ? "active" : ""}
                  onClick={() => setStatusFilter("answered")}
                >
                  Answered
                </li>
              </ul>
            )}
          </li>
          <li
            className={active === "status" && !viewingStatus ? "active" : ""}
            onClick={() => {
              setActive("status");
              setViewingStatus(null);
            }}
          >
            Project Status
          </li>
          {active === "status" && statusHistory.filter((u) => u.sent).length > 0 && (
            <ul className="sub-menu">
              <li className="subheading">Past Updates</li>
              {statusHistory
                .filter((u) => u.sent)
                .map((u, i) => (
                  <li
                    key={i}
                    className={viewingStatus === u ? "active" : ""}
                    onClick={() => setViewingStatus(u)}
                  >
                    {new Date(u.date).toDateString()}
                  </li>
                ))}
            </ul>
          )}
        </ul>
      </aside>
      <div className="main-content">
        {active === "documents" ? (
          <div className="document-section">
            {documents.length > 0 && (
              <button
                className="generator-button summarize-all"
                onClick={handleSummarizeAll}
              >
                Summarize All Files
              </button>
            )}
            <ul className="document-list">
              {documents.map((doc, idx) => (
                <li key={idx} className="document-item">
                  {doc.name}
                  <span className="doc-actions">
                    <button onClick={() => handleSummarize(doc.content)}>
                      Summarize
                    </button>
                    <button onClick={() => removeDocument(idx)}>Remove</button>
                  </span>
                </li>
              ))}
            </ul>
            <div
              className="drop-zone"
              onDrop={handleDocDrop}
              onDragOver={handleDocDragOver}
            >
              Drag & Drop Documents Here
              <input type="file" multiple onChange={handleDocInput} />
            </div>
          </div>
         ) : active === "status" ? (
          viewingStatus ? (
            <PastUpdateView update={viewingStatus} />
          ) : (
            <ProjectStatus
              questions={questions}
              documents={documents}
              contacts={contacts}
              setContacts={setContacts}
              emailConnected={emailConnected}
              onHistoryChange={setStatusHistory}
              initiativeId={initiativeId}
              businessGoal={businessGoal}
            />
          )
        ) : (
          <>
            <div className="filter-bar">
              <label>
                Contact:
                <select
                  value={contactFilter}
                  onChange={(e) => setContactFilter(e.target.value)}
                >
                  <option value="">All</option>
                  {contacts.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status:
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">All</option>
                  <option value="toask">To Ask</option>
                  <option value="asked">Asked</option>
                  <option value="answered">Answered</option>
                </select>
              </label>
              <label>
                Group by:
                <select
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value)}
                >
                  <option value="">None</option>
                  <option value="contact">Contact</option>
                  <option value="role">Role</option>
                  <option value="status">Status</option>
                </select>
              </label>
              <button
                className="generator-button"
                onClick={() => {
                  setSelectMode((s) => !s);
                  if (selectMode) setSelected([]);
                }}
              >
                {selectMode ? "Cancel" : "Select"}
              </button>
              <button className="generator-button" onClick={addContact}>
                Add Contact
              </button>
              {selectMode && selected.length > 0 && (
                <button
                  className="generator-button ask-selected"
                  onClick={askSelected}
                >
                  Ask Selected
                </button>
              )}
            </div>
            {Object.entries(grouped).map(([grp, items]) => (
              <div key={grp} className="group-section">
                {groupBy && <h3>{grp}</h3>}
                {items.map((q) => {
                  const selKey = `${q.idx}|${q.status}|${q.contacts.join(',')}`;
                  return (
                  <div
                    key={selKey}
                    className={`initiative-card question-card ${q.status}`}
                  >
                    <div className="contact-row">
                      {q.contacts.map((name) => (
                        <span
                          key={name}
                          className="contact-tag"
                          style={{ backgroundColor: getColor(name) }}
                          onClick={(e) => openContextMenu(e, name, q.idx)}
                        >
                          {name}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeContactFromQuestion(q.idx, name);
                            }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      <button
                        className="add-contact-btn"
                        onClick={() =>
                          setOpenDropdown((d) => (d === q.idx ? null : q.idx))
                        }
                      >
                        +
                      </button>
                      {openDropdown === q.idx && (
                        <select
                          className="contact-select"
                          value=""
                          onChange={(e) => {
                            handleContactSelect(q.idx, e.target.value);
                            setOpenDropdown(null);
                          }}
                        >
                          <option value="">Select Contact</option>
                          {contacts
                            .filter((c) => !q.contacts.includes(c.name))
                            .map((c) => (
                              <option key={c.name} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                          <option value="__add__">Add New Contact</option>
                        </select>
                      )}
                    </div>
                    <div className="question-header">
                      {selectMode && (
                        <input
                          type="checkbox"
                          checked={selected.includes(selKey)}
                          onChange={() => toggleSelect(selKey)}
                        />
                      )}
                      <p>{q.question}</p>
                      <span className="status-tag">{statusLabel(q.status)}</span>
                      <button
                        className="draft-email-btn"
                        onClick={() => draftEmail(q)}
                      >
                        Draft Email
                      </button>
                    </div>
                    {q.status !== "toask" &&
                      q.contacts.map((name) => {
                        const key = `${q.idx}-${name}`;
                        const draft = answerDrafts[key];
                        return (
                          <div key={name} className="answer-block">
                            <strong>{name}:</strong>
                            <textarea
                              className="generator-input"
                              placeholder="Enter answer or notes here"
                              value={
                                draft !== undefined
                                  ? draft
                                  : q.answers[name]?.text || ""
                              }
                              onChange={(e) =>
                                setAnswerDrafts((prev) => ({
                                  ...prev,
                                  [key]: e.target.value,
                                }))
                              }
                              rows={3}
                            />
                            <button
                              className="generator-button"
                              disabled={!answerDrafts[key]?.trim()}
                              onClick={() => handleAnswerSubmit(q.idx, name)}
                            >
                              Submit
                            </button>
                          </div>
                        );
                      })}
                  </div>
                );
                })}
              </div>
            ))}
          </>
        )}
      </div>
      {menu && (
        <ul
          className="contact-menu"
          style={{ top: menu.y, left: menu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <li
            onClick={() => {
              startEditContact(menu.name);
              setMenu(null);
            }}
          >
            Edit
          </li>
          <li
            onClick={async () => {
              await markAsked(menu.idx, [menu.name]);
              setMenu(null);
            }}
          >
            Ask
          </li>
          <li
            onClick={() => {
              setContactFilter(menu.name);
              setMenu(null);
            }}
          >
            Filter
          </li>
            <li
              onClick={() => {
                const role =
                  contacts.find((c) => c.name === menu.name)?.role || "No Role";
                setGroupBy("role");
                setFocusRole(role);
                setMenu(null);
              }}
            >
              Group
            </li>
        </ul>
        )}
      {analysisModal && (
        <div
          className="modal-overlay"
          onClick={() => setAnalysisModal(null)}
        >
          <div
            className="initiative-card modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Answer Analysis</h3>
            <p>Question has been moved to answered.</p>
            {analysisModal.analysis && (
              <p>
                {typeof analysisModal.analysis === "string"
                  ? analysisModal.analysis
                  : JSON.stringify(analysisModal.analysis)}
              </p>
            )}
            {analysisModal.suggestions && analysisModal.suggestions.length > 0 && (
              <>
                <p>Suggested tasks:</p>
                <ul>
                  {analysisModal.suggestions.map((s, i) => (
                    <li key={i}>
                      <label>
                        <input
                          type="checkbox"
                          checked={analysisModal.selected.includes(s)}
                          onChange={() => toggleSuggestion(s)}
                        />
                        {s}
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="modal-actions">
              <button
                className="generator-button"
                onClick={() => {
                  draftReply(
                    analysisModal.idx,
                    analysisModal.name,
                    analysisModal.selected,
                  );
                  setAnalysisModal(null);
                }}
              >
                Draft Reply
              </button>
              {analysisModal.suggestions.length > 0 && (
                <button
                  className="generator-button"
                  onClick={async () => {
                    await createTasksFromAnalysis(
                      analysisModal.name,
                      analysisModal.selected,
                    );
                    setAnalysisModal(null);
                  }}
                >
                  Add Selected Tasks
                </button>
              )}
              <button
                className="generator-button"
                onClick={() => setAnalysisModal(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {recipientModal && (
        <div
          className="modal-overlay"
          onClick={() => setRecipientModal(null)}
        >
            <div
              className="initiative-card modal-content"
              onClick={(e) => e.stopPropagation()}
            >
              <h3>Select Contacts</h3>
              <select
                multiple
                className="generator-input"
                value={recipientModal.selected}
                onChange={(e) =>
                  setRecipientModal((m) => ({
                    ...m,
                    selected: Array.from(
                      e.target.selectedOptions,
                      (o) => o.value
                    ),
                  }))
                }
              >
                {recipientModal.options.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <div className="modal-actions">
                <button
                  className="generator-button"
                  onClick={() => {
                    recipientModal.onConfirm(recipientModal.selected);
                    setRecipientModal(null);
                  }}
                >
                  Confirm
                </button>
                <button
                  className="generator-button"
                  onClick={() => setRecipientModal(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
        {emailDraft && (
          <div
            className="modal-overlay"
            onClick={() => {
              setEmailDraft(null);
              setEditingDraft(false);
              setDraftQueue([]);
              setDraftIndex(0);
            }}
          >
            <div
              className="initiative-card modal-content"
              onClick={(e) => e.stopPropagation()}
            >
              {generatingEmail ? (
                <p>Generating...</p>
               ) : active === "status" ? (
          <ProjectStatus
            questions={questions}
            documents={documents}
            contacts={contacts}
            setContacts={setContacts}
            emailConnected={emailConnected}
            onHistoryChange={setStatusHistory}
            initiativeId={initiativeId}
            businessGoal={businessGoal}
          />
        ) : (
          <>
                  {draftQueue.length > 1 && (
                    <p>
                      Draft {draftIndex + 1} of {draftQueue.length}
                    </p>
                  )}
                  {editingDraft ? (
                    <>
                      <input
                        className="generator-input"
                        value={emailDraft.subject}
                        onChange={(e) =>
                          setEmailDraft((d) => ({
                            ...d,
                            subject: e.target.value,
                          }))
                        }
                      />
                      <textarea
                        className="generator-input"
                        rows={10}
                        value={emailDraft.body}
                        onChange={(e) =>
                          setEmailDraft((d) => ({
                            ...d,
                            body: e.target.value,
                          }))
                        }
                      />
                    </>
                   ) : active === "status" ? (
          <ProjectStatus
            questions={questions}
            documents={documents}
            contacts={contacts}
            setContacts={setContacts}
            emailConnected={emailConnected}
            onHistoryChange={setStatusHistory}
            initiativeId={initiativeId}
            businessGoal={businessGoal}
          />
        ) : (
          <>
                      <h3>{emailDraft.subject}</h3>
                      <pre style={{ whiteSpace: "pre-wrap" }}>{emailDraft.body}</pre>
                    </>
                  )}
                  <div className="modal-actions">
                    <button
                      className="generator-button"
                      onClick={() => setEditingDraft((e) => !e)}
                    >
                      {editingDraft ? "Done" : "Edit Draft"}
                    </button>
                    <button
                      className="generator-button"
                      onClick={sendEmail}
                    >
                      Send with Gmail
                    </button>
                    <button
                      className="generator-button"
                      onClick={copyDraft}
                    >
                      Copy Draft
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        {editData && (
          <div className="modal-overlay" onClick={() => setEditData(null)}>
            <div
              className="initiative-card modal-content"
              onClick={(e) => e.stopPropagation()}
            >
            <h3>Edit Contact</h3>
            <label>
              Name:
              <input
                className="generator-input"
                value={editData.name}
                onChange={(e) =>
                  setEditData((d) => ({ ...d, name: e.target.value }))
                }
              />
            </label>
            <label>
              Role:
              <input
                className="generator-input"
                value={editData.role}
                onChange={(e) =>
                  setEditData((d) => ({ ...d, role: e.target.value }))
                }
              />
            </label>
            <label>
              Email:
              <input
                className="generator-input"
                value={editData.email}
                onChange={(e) =>
                  setEditData((d) => ({ ...d, email: e.target.value }))
                }
              />
            </label>
            <div className="modal-actions">
              <button className="generator-button" onClick={saveEditContact}>
                Save
              </button>
              <button
                className="generator-button"
                onClick={() => setEditData(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {showSummary && (
        <div className="modal-overlay" onClick={() => setShowSummary(false)}>
          <div className="initiative-card modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Summary</h3>
            <p>{summary}</p>
            <button className="generator-button" onClick={() => setShowSummary(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DiscoveryHub;

