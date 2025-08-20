import { useEffect, useState, useMemo } from "react";
import ReactDOM from "react-dom";
import { useSearchParams, useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, functions, appCheck } from "../firebase";
import {
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getToken as getAppCheckToken } from "firebase/app-check";
import { loadInitiative, saveInitiative } from "../utils/initiatives";
import ai, { generate } from "../ai";
import { classifyTask } from "../utils/taskUtils";
import ProjectStatus from "./ProjectStatus.jsx";
import PastUpdateView from "./PastUpdateView.jsx";
import "./AIToolsGenerators.css";
import "./DiscoveryHub.css";

const Zap = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const Layers = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);

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
  const [projectTasks, setProjectTasks] = useState([]);
  const [contactFilter, setContactFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [groupBy, setGroupBy] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState("all");
  const [taskProjectFilter, setTaskProjectFilter] = useState("all");
  const [taskContactFilter, setTaskContactFilter] = useState("all");
  const [synergyQueue, setSynergyQueue] = useState([]);
  const [synergyIndex, setSynergyIndex] = useState(0);
  const [synergyText, setSynergyText] = useState("");
  const [prioritized, setPrioritized] = useState(null);
  const [isPrioritizing, setIsPrioritizing] = useState(false);
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

  const tagStyles = {
    email: "bg-green-500/20 text-green-300",
    call: "bg-sky-500/20 text-sky-300",
    meeting: "bg-orange-500/20 text-orange-300",
    research: "bg-fuchsia-500/20 text-fuchsia-300",
    default: "bg-gray-500/20 text-gray-300",
  };

  const taskProjects = useMemo(() => {
    const set = new Set();
    projectTasks.forEach((t) => {
      set.add(t.project || "General");
    });
    return Array.from(set);
  }, [projectTasks]);

  const taskContacts = useMemo(() => {
    const set = new Set();
    projectTasks.forEach((t) => {
      set.add(t.assignee || t.name || "Unassigned");
    });
    return Array.from(set);
  }, [projectTasks]);

  const displayedTasks = useMemo(() => {
    let tasks = projectTasks.filter(
      (t) => taskStatusFilter === "all" || (t.status || "open") === taskStatusFilter
    );
    if (taskProjectFilter !== "all") {
      tasks = tasks.filter(
        (t) => (t.project || "General") === taskProjectFilter
      );
    }
    if (taskContactFilter !== "all") {
      tasks = tasks.filter(
        (t) => (t.assignee || t.name || "Unassigned") === taskContactFilter
      );
    }
    return tasks;
  }, [projectTasks, taskStatusFilter, taskProjectFilter, taskContactFilter]);

  const taskSubTypeIcon = (subType) => {
    switch (subType) {
      case "meeting":
        return "🗓️";
      case "communication":
        return "📨";
      case "research":
        return "🔎";
      default:
        return "📝";
    }
  };

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

      // --- MODIFICATION: Updated prompt for sub-task classification ---
      const prompt = `You are an expert Instructional Designer and Performance Consultant. You are analyzing a stakeholder's answer to a specific discovery question. Your goal is to understand what this answer means for the training project and to determine follow-up actions.

Project Context:
${projectContext}

Discovery Question:
${question}

Answer:
${text}

Please provide a JSON object with two fields:
- "analysis": a concise summary of what this answer reveals about the question in the context of the project.
- "suggestions": An array of objects for follow-up actions. Each object must have four string fields:
    1. "text": The follow-up action.
    2. "type": Either "question" for direct follow-ups or "task" for internal actions.
    3. "assignee": The name of the person or team to address (e.g., "Jessica Bell", "Engineering Team"), or "Project Manager" for internal tasks.
    4. "subType": For tasks, classify their nature. Use "meeting" for scheduling discussions, "communication" for sending emails/chats, or "research" for verification, data analysis, or finding documents. For questions, this can be "communication".

Respond ONLY in this JSON format:
{"analysis": "...", "suggestions": [{"text": "...", "type": "...", "assignee": "...", "subType": "..."}, ...]}`;

      const { text: res } = await ai.generate(prompt);
      
      const parseResponse = (str) => {
        const parsed = JSON.parse(str);
        const analysis =
          typeof parsed.analysis === "string"
            ? parsed.analysis
            : JSON.stringify(parsed.analysis);
        
        const suggestions = Array.isArray(parsed.suggestions)
          ? parsed.suggestions.filter(
              (s) =>
                s &&
                typeof s.text === "string" &&
                typeof s.type === "string" &&
                typeof s.assignee === "string" &&
                typeof s.subType === "string"
            )
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
      const suggestionTexts = suggestions.map(s => s.text);
      body += `Could you also provide the following: ${suggestionTexts.join(", ")}?\n\n`;
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
    if (!uid || !initiativeId || !suggestions.length) return;
    
    const questionsToAdd = [];
    const tasksToAdd = [];

    try {
      for (const s of suggestions) {
        if (s.type === 'question') {
          const contactExists = contacts.some(c => c.name === s.assignee);
          const assignedContact = contactExists ? s.assignee : name;
          
          questionsToAdd.push({
            question: s.text,
            contacts: assignedContact ? [assignedContact] : [],
            answers: {},
            asked: assignedContact ? { [assignedContact]: false } : {},
          });
        } else {
          const tag = await classifyTask(s.text);
          // --- MODIFICATION: Save assignee and subType with the task ---
          tasksToAdd.push({
            name,
            message: s.text,
            assignee: s.assignee || "Unassigned",
            subType: s.subType || "task",
            status: "open",
            createdAt: serverTimestamp(),
            tag,
          });
        }
      }

      if (tasksToAdd.length > 0) {
        const tasksCollection = collection(db, "users", uid, "initiatives", initiativeId, "tasks");
        await Promise.all(
          tasksToAdd.map((taskData) => addDoc(tasksCollection, taskData))
        );
      }

      if (questionsToAdd.length > 0) {
        setQuestions((prevQuestions) => {
          const updatedQuestions = [...prevQuestions, ...questionsToAdd];
          if (uid) {
            saveInitiative(uid, initiativeId, {
              clarifyingQuestions: updatedQuestions.map((q) => ({ question: q.question })),
              clarifyingContacts: Object.fromEntries(updatedQuestions.map((qq, i) => [i, qq.contacts])),
              clarifyingAnswers: updatedQuestions.map((qq) => qq.answers),
              clarifyingAsked: updatedQuestions.map((qq) => qq.asked),
            });
          }
          return updatedQuestions;
        });
      }
    } catch (err) {
      console.error("createTasksFromAnalysis error", err);
    }
  };

  const updateTaskStatus = async (id, status, extra = {}) => {
    if (!uid || !initiativeId) return;
    try {
      await updateDoc(
        doc(db, "users", uid, "initiatives", initiativeId, "tasks", id),
        { status, statusChangedAt: serverTimestamp(), ...extra }
      );
      const ids = JSON.parse(text.trim());
      const ordered = ids
        .map((id) => displayedTasks.find((t) => t.id === id))
        .filter(Boolean);
      setPrioritized(ordered.length ? ordered : [...displayedTasks]);
    } catch (err) {
      console.error("updateTaskStatus error", err);
    }
    setPrioritized(null);
  };

  const completeTask = (id) => updateTaskStatus(id, "completed");
  const scheduleTask = (id) => updateTaskStatus(id, "scheduled");
  const deleteTask = async (id) => {
    if (!uid || !initiativeId) return;
    try {
      await deleteDoc(
        doc(db, "users", uid, "initiatives", initiativeId, "tasks", id)
      );
    } catch (err) {
      console.error("deleteTask error", err);
    }
  };

  const computeBundles = () => {
    const map = {};
    displayedTasks.forEach((t) => {
      const key = `${t.project || "General"}-${t.subType || "other"}-${t.assignee || ""}`;
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return Object.values(map).filter((b) => b.length > 1);
  };

  const startSynergy = async () => {
    const bundles = computeBundles();
    const proposals = [];
    for (const b of bundles) {
      try {
        const { text } = await generate(
          `Combine the following tasks into one task description:\n${b
            .map((t) => `- ${t.message}`)
            .join("\n")}`
        );
        proposals.push({ bundle: b, text: text.trim() });
      } catch (err) {
        console.error("synergize", err);
        proposals.push({ bundle: b, text: b.map((t) => t.message).join(" ") });
      }
    }
    if (proposals.length) {
      setSynergyQueue(proposals);
      setSynergyIndex(0);
      setSynergyText(proposals[0].text);
    }
  };

  const nextSynergy = () => {
    const next = synergyIndex + 1;
    if (next < synergyQueue.length) {
      setSynergyIndex(next);
      setSynergyText(synergyQueue[next].text);
    } else {
      setSynergyQueue([]);
      setSynergyIndex(0);
      setSynergyText("");
    }
  };

  const handleSynergize = async (bundle, message) => {
    if (!uid || !initiativeId || !bundle.length) return;
    const [first, ...rest] = bundle;
    await updateDoc(
      doc(db, "users", uid, "initiatives", initiativeId, "tasks", first.id),
      { message }
    );
    for (const t of rest) {
      await deleteDoc(
        doc(db, "users", uid, "initiatives", initiativeId, "tasks", t.id)
      );
    }
    nextSynergy();
  };

  const startPrioritize = async () => {
    setIsPrioritizing(true);
    try {
      const { text } = await generate(
        `Order the following tasks by priority and return a JSON array of ids in order:\n${displayedTasks
          .map((t) => `${t.id}: ${t.message}`)
          .join("\n")}`
      );
      const ids = JSON.parse(text.trim());
      const ordered = ids
        .map((id) => displayedTasks.find((t) => t.id === id))
        .filter(Boolean);
      setPrioritized(ordered.length ? ordered : [...displayedTasks]);
    } catch (err) {
      console.error("prioritize", err);
      setPrioritized([...displayedTasks]);
    } finally {
      setIsPrioritizing(false);
    }
  };

  const movePriority = (index, delta) => {
    setPrioritized((prev) => {
      const arr = [...prev];
      const next = index + delta;
      if (next < 0 || next >= arr.length) return arr;
      const tmp = arr[index];
      arr[index] = arr[next];
      arr[next] = tmp;
      return arr;
    });
  };

  const savePrioritized = async () => {
    if (!uid || !initiativeId || !prioritized) return;
    for (let i = 0; i < prioritized.length; i++) {
      await updateDoc(
        doc(db, "users", uid, "initiatives", initiativeId, "tasks", prioritized[i].id),
        { order: i }
      );
    }
    setPrioritized(null);
  };

  const renderTaskCard = (t, actionButtons) => {
    const contact = t.assignee || t.name || "Unassigned";
    const project = t.project || projectName || "General";
    return (
      <div
        key={t.id}
        className="bg-gray-800/50 backdrop-blur-xl border border-gray-700 rounded-xl p-4 space-y-3"
      >
        <div className="flex justify-between items-center">
          <div className="flex gap-2">
            <span className="font-semibold">{contact}</span>
            <span className="text-sm text-gray-400">{project}</span>
          </div>
          {t.tag && (
            <span
              className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                tagStyles[t.tag] || tagStyles.default
              }`}
            >
              {t.tag}
            </span>
          )}
        </div>
        <p className="text-gray-200">{t.message}</p>
        <div className="flex gap-2">{actionButtons}</div>
      </div>
    );
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

  const toggleSuggestion = (suggestionObject) => {
    setAnalysisModal((prev) => {
      const isSelected = prev.selected.some(item => item.text === suggestionObject.text);
      let newSelected;
      if (isSelected) {
        newSelected = prev.selected.filter((item) => item.text !== suggestionObject.text);
      } else {
        newSelected = [...prev.selected, suggestionObject];
      }
      return { ...prev, selected: newSelected };
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

  useEffect(() => {
    if (!uid || !initiativeId) return;
    const tasksRef = collection(
      db,
      "users",
      uid,
      "initiatives",
      initiativeId,
      "tasks",
    );
    const unsub = onSnapshot(tasksRef, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setProjectTasks(list);
    });
    return () => unsub();
  }, [uid, initiativeId]);

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

  const editQuestion = (idx) => {
    const current = questions[idx]?.question || "";
    const revised = prompt("Edit question", current);
    if (!revised || revised === current) return;
    setQuestions((prev) => {
      const updated = [...prev];
      updated[idx].question = revised;
      if (uid) {
        saveInitiative(uid, initiativeId, {
          clarifyingQuestions: updated.map((q) => ({ question: q.question })),
        });
      }
      return updated;
    });
  };

  const deleteQuestion = (idx) => {
    if (!window.confirm("Delete this question?")) return;
    setQuestions((prev) => {
      const updated = prev.filter((_, i) => i !== idx);
      if (uid) {
        saveInitiative(uid, initiativeId, {
          clarifyingQuestions: updated.map((q) => ({ question: q.question })),
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

  const summarizeText = async (text) => {
    const context = `Project Name: ${projectName || "Unknown"}\nBusiness Goal: ${
      businessGoal || "Unknown"
    }`;
    const prompt = `${context}\n\nProvide a concise summary of the following document, describing how it impacts the project and highlighting any key or useful data points.\n\n${text}`;
    const { text: result } = await ai.generate(prompt);
    return result.trim();
  };

  const handleSummarize = async (text) => {
    setAnalyzing(true);
    try {
      const s = await summarizeText(text);
      setSummary(s);
    } catch (err) {
      console.error("Error summarizing document", err);
      setSummary("Failed to generate summary.");
    } finally {
      setShowSummary(true);
      setAnalyzing(false);
    }
  };

  const handleSummarizeAll = async () => {
    const combined = documents
      .map((d) => `Title: ${d.name}\n\n${d.content}`)
      .join("\n\n");
    await handleSummarize(combined);
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
          <li className={active === "tasks" ? "active" : ""}>
            <span
              onClick={() => setActive("tasks")}
              className="cursor-pointer"
            >
              Tasks
            </span>
            {active === "tasks" && (
              <ul className="sub-menu">
                <li
                  className={taskStatusFilter === "all" ? "active" : ""}
                  onClick={() => setTaskStatusFilter("all")}
                >
                  All Tasks
                </li>
                <li
                  className={taskStatusFilter === "open" ? "active" : ""}
                  onClick={() => setTaskStatusFilter("open")}
                >
                  Open Tasks
                </li>
                <li
                  className={taskStatusFilter === "scheduled" ? "active" : ""}
                  onClick={() => setTaskStatusFilter("scheduled")}
                >
                  Scheduled Tasks
                </li>
                <li
                  className={taskStatusFilter === "completed" ? "active" : ""}
                  onClick={() => setTaskStatusFilter("completed")}
                >
                  Completed Tasks
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
        // --- MODIFICATION: Revamped project tasks view with AI features ---
        ) : active === "tasks" ? (
          <div className="tasks-section">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-4">
              <h2 className="text-2xl font-bold text-white">Project Tasks</h2>
              <div className="flex gap-2">
                <button
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-4 rounded-lg disabled:bg-indigo-800 disabled:cursor-not-allowed"
                  disabled={isPrioritizing}
                  onClick={startPrioritize}
                >
                  <Zap className="w-5 h-5" />
                  {isPrioritizing ? "Prioritizing..." : "Prioritize"}
                </button>
                <button
                  className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold py-2 px-4 rounded-lg"
                  onClick={startSynergy}
                >
                  <Layers className="w-5 h-5" />
                  Synergize
                </button>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              <select
                value={taskProjectFilter}
                onChange={(e) => setTaskProjectFilter(e.target.value)}
                className="bg-gray-700 text-gray-300 rounded-md px-3 py-1"
              >
                <option value="all">All Projects</option>
                {taskProjects.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <select
                value={taskContactFilter}
                onChange={(e) => setTaskContactFilter(e.target.value)}
                className="bg-gray-700 text-gray-300 rounded-md px-3 py-1"
              >
                <option value="all">All Contacts</option>
                {taskContacts.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {prioritized ? (
              <div className="space-y-4">
                {prioritized.map((t, i) =>
                  renderTaskCard(
                    t,
                    <>
                      <button
                        className="generator-button"
                        onClick={() => movePriority(i, -1)}
                      >
                        ↑
                      </button>
                      <button
                        className="generator-button"
                        onClick={() => movePriority(i, 1)}
                      >
                        ↓
                      </button>
                      <button
                        className="generator-button"
                        onClick={() => scheduleTask(t.id)}
                      >
                        Schedule
                      </button>
                      <button
                        className="generator-button"
                        onClick={() => completeTask(t.id)}
                      >
                        Complete
                      </button>
                      <button
                        className="generator-button"
                        onClick={() => deleteTask(t.id)}
                      >
                        Delete
                      </button>
                    </>
                  )
                )}
                <button className="generator-button" onClick={savePrioritized}>
                  Save Order
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {displayedTasks.map((t) =>
                  renderTaskCard(
                    t,
                    <>
                      <button
                        className="generator-button"
                        onClick={() => completeTask(t.id)}
                      >
                        Complete
                      </button>
                      <button
                        className="generator-button"
                        onClick={() => scheduleTask(t.id)}
                      >
                        Schedule
                      </button>
                      <button
                        className="generator-button"
                        onClick={() => deleteTask(t.id)}
                      >
                        Delete
                      </button>
                    </>
                  )
                )}
                {displayedTasks.length === 0 && (
                  <p className="text-gray-400">No tasks.</p>
                )}
              </div>
            )}

            {synergyQueue.length > 0 &&
              ReactDOM.createPortal(
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
                  <div className="bg-white text-black rounded-lg p-6 w-full max-w-md">
                    <h3 className="text-lg font-semibold mb-2">Synergize Tasks</h3>
                    <ul className="list-disc list-inside mb-4 text-sm">
                      {synergyQueue[synergyIndex].bundle.map((t) => (
                        <li key={t.id}>{t.message}</li>
                      ))}
                    </ul>
                    <textarea
                      className="w-full border p-2 mb-4"
                      value={synergyText}
                      onChange={(e) => setSynergyText(e.target.value)}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        className="generator-button"
                        onClick={nextSynergy}
                      >
                        Skip
                      </button>
                      <button
                        className="generator-button"
                        onClick={() => handleSynergize(synergyQueue[synergyIndex].bundle, synergyText)}
                      >
                        Approve
                      </button>
                    </div>
                  </div>
                </div>,
                document.body
              )}
          </div>
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
                      <span className="status-tag">{statusLabel(q.status)}</span>
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
                      </div>
                      <div className="question-actions">
                        <button
                          className="generator-button"
                          onClick={() => draftEmail(q)}
                        >
                          Draft Email
                        </button>
                        <button
                          className="generator-button"
                          onClick={() => editQuestion(q.idx)}
                        >
                          Edit
                        </button>
                        <button
                          className="generator-button"
                          onClick={() => deleteQuestion(q.idx)}
                        >
                          Delete
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
                          checked={analysisModal.selected.some(item => item.text === s.text)}
                          onChange={() => toggleSuggestion(s)}
                        />
                         {taskSubTypeIcon(s.subType)} {`[${s.type}] ${s.text} (${s.assignee})`}
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