import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, functions, appCheck } from "../firebase";
import {
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
  Timestamp,
  onSnapshot,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getToken } from "firebase/app-check";
import { loadInitiative, saveInitiative } from "../utils/initiatives";
import { generateQuestionId } from "../utils/questions.js";
import ai, { generate } from "../ai";
import { saveUserContact } from "../utils/contacts.js";
import { parseJsonFromText } from "../utils/json";
import { useInquiryMap } from "../context/InquiryMapContext.jsx";
import {
  classifyTask,
  dedupeByMessage,
  normalizeAssigneeName,
} from "../utils/taskUtils";
import { getPriority } from "../utils/priorityMatrix";
import {
  markAnswered,
  markAsked as markAskedStatus,
  initStatus,
  getContactStatus,
  setContactStatus,
  removeContactStatus,
} from "../utils/questionStatus";
import ProjectStatus from "./ProjectStatus.jsx";
import PastUpdateView from "./PastUpdateView.jsx";
import ActionDashboard from "./ActionDashboard.jsx";
import AnswerSlideOver from "./AnswerSlideOver.jsx";
import ProjectOverview from "./ProjectOverview.jsx";
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

const parseContactNames = (whoRaw) => {
  if (!whoRaw) return [];
  const suffixMatch = whoRaw.trim().match(/\b(Teams?|Departments?|Groups?)$/i);
  if (suffixMatch) {
    const base = whoRaw.trim().slice(0, suffixMatch.index).trim();
    const parts = base
      .split(/\s*(?:,|and|&)\s*/i)
      .map((p) => p.trim())
      .filter(Boolean);
    if (
      parts.length > 1 &&
      parts.every((p) => !/\b(Team|Department|Group)\b$/i.test(p))
    ) {
      const suffix = " " + suffixMatch[1].replace(/s$/i, "");
      return parts.map((p) => p + suffix);
    }
  }
  return whoRaw
    .split(/\s*(?:,|and|&)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
};

const DiscoveryHub = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initiativeId = searchParams.get("initiativeId");
  const [questions, setQuestions] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [showDocPaste, setShowDocPaste] = useState(false);
  const [docPasteText, setDocPasteText] = useState("");
  const [docPasteTitle, setDocPasteTitle] = useState("");
  const [projectTasks, setProjectTasks] = useState([]);
  const [suggestedTasks, setSuggestedTasks] = useState([]);
  const [suggestedQuestions, setSuggestedQuestions] = useState([]);
  const projectTasksRef = useRef([]);
  const prevHypothesisConfidence = useRef({});
  const [contactFilter, setContactFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [groupBy, setGroupBy] = useState("");
  const taskStatusFilter = "all";
  const [taskProjectFilter, setTaskProjectFilter] = useState("all");
  const [taskContactFilter, setTaskContactFilter] = useState("all");
  const [taskTypeFilter, setTaskTypeFilter] = useState("all");
  const [synergyQueue, setSynergyQueue] = useState([]);
  const [synergyIndex, setSynergyIndex] = useState(0);
  const [prioritized, setPrioritized] = useState(null);
  const [isPrioritizing, setIsPrioritizing] = useState(false);
  const [selected, setSelected] = useState([]);
  const [selectMode, setSelectMode] = useState(false);
  const [uid, setUid] = useState(null);
  const [currentUserName, setCurrentUserName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState("overview");
  const [summary, setSummary] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [openTaskDropdown, setOpenTaskDropdown] = useState(null);
  const [menu, setMenu] = useState(null);
  const [focusRole, setFocusRole] = useState("");
  const [editData, setEditData] = useState(null);
  const [editTask, setEditTask] = useState(null);
  const [completionModal, setCompletionModal] = useState(null);
  const [emailProvider, setEmailProvider] = useState(null);
  const [emailDraft, setEmailDraft] = useState(null);
  const [generatingEmail, setGeneratingEmail] = useState(false);
  const [editingDraft, setEditingDraft] = useState(false);
  const [draftQueue, setDraftQueue] = useState([]);
  const [draftIndex, setDraftIndex] = useState(0);
  const [recipientModal, setRecipientModal] = useState(null);
  const [analysisModal, setAnalysisModal] = useState(null);
  const [answerPanel, setAnswerPanel] = useState(null);
  const [showNewQuestion, setShowNewQuestion] = useState(false);
  const [newQuestionText, setNewQuestionText] = useState("");
  const [newQuestionContacts, setNewQuestionContacts] = useState([]); // array of contactIds
  const [whoInput, setWhoInput] = useState("");
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskText, setNewTaskText] = useState("");
  const [newTaskType, setNewTaskType] = useState("general");
  const [newTaskHypotheses, setNewTaskHypotheses] = useState([]);
  const [answerDrafts, setAnswerDrafts] = useState({});
  const [activeComposer, setActiveComposer] = useState(null);
  const [restoredDraftKey, setRestoredDraftKey] = useState(null);
  const [composerError, setComposerError] = useState(null);
  const [toast, setToast] = useState(null);
  const [assigneeChoices, setAssigneeChoices] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("assigneeChoices") || "{}");
    } catch {
      return {};
    }
  });
  const restoredRef = useRef(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectStage, setProjectStage] = useState("");
  const { triageEvidence, loadHypotheses, hypotheses, addHypothesis } = useInquiryMap();
  const [businessGoal, setBusinessGoal] = useState("");
  const [audienceProfile, setAudienceProfile] = useState("");
  const [projectConstraints, setProjectConstraints] = useState("");
  const [viewingStatus] = useState("");
  const setStatusHistory = () => {};
  const [qaModal, setQaModal] = useState(null);
  const emailConnected = Boolean(emailProvider);
  const providerLabel =
    emailProvider === "imap"
      ? "IMAP"
      : emailProvider === "pop3"
      ? "POP3"
      : emailProvider
      ? emailProvider.charAt(0).toUpperCase() + emailProvider.slice(1)
      : "Email";

  const handleAnswerClick = (e, q) => {
    // Prevent the card's click handlers from firing and grab the
    // authoritative question object before opening the slide-over.
    e.preventDefault();
    e.stopPropagation();
    const original = questions.find((qq) => qq.id === q.id) || q;
    setAnswerPanel({ id: q.id, idx: q.idx, question: original });
  };

  useEffect(() => {
    const section = searchParams.get("section");
    if (section) {
      setActive(section);
    } else if (searchParams.has("actionDashboard")) {
      setActive("actionDashboard");
    } else {
      setActive("overview");
    }
    const status = searchParams.get("status");
    if (status) {
      setStatusFilter(status);
    } else {
      // When navigating back to Questions without a status param, show all
      setStatusFilter("");
    }
    const pending = searchParams.get("new");
    if (pending === "question") {
      setShowNewQuestion(true);
    } else if (pending === "task") {
      setShowNewTask(true);
    }
  }, [searchParams]);

  const clearNewParam = () => {
    if (!searchParams.get("new")) return;
    const sp = new URLSearchParams(searchParams);
    sp.delete("new");
    setSearchParams(sp, { replace: true });
  };

  const closeNewQuestion = () => {
    setShowNewQuestion(false);
    clearNewParam();
  };

  const closeNewTask = () => {
    setShowNewTask(false);
    clearNewParam();
  };

  // Close any open slide-over with Escape
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        if (showNewQuestion) {
          closeNewQuestion();
        } else if (showNewTask) {
          closeNewTask();
        } else if (answerPanel) {
          setAnswerPanel(null);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showNewQuestion, showNewTask, answerPanel]);

  const normalizeAssignee = useCallback(
    (a) => normalizeAssigneeName(a, currentUserName),
    [currentUserName],
  );

  const focusQuestionCard = useCallback((idx, answerIdx = null) => {
    const el = document.getElementById(`question-${idx}`);
    if (el) {
      el.classList.add("highlight-question");
      el.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => el.classList.remove("highlight-question"), 2000);
      if (answerIdx !== null) {
        const answerEl = document.getElementById(`answer-${idx}-${answerIdx}`);
        if (answerEl) {
          answerEl.classList.add("highlight-question");
          answerEl.scrollIntoView({ behavior: "smooth" });
          setTimeout(
            () => answerEl.classList.remove("highlight-question"),
            2000,
          );
        }
      }
    }
  }, []);

  const openQAModal = useCallback(
    (qIdx, aIdx = null) => {
      focusQuestionCard(qIdx, aIdx);
      setQaModal({ qIdx, aIdx });
    },
    [focusQuestionCard],
  );

  const getContactIds = useCallback(
    (q) =>
      q.contactIds && q.contactIds.length
        ? q.contactIds
        : q.contacts.map(
            (n) => contacts.find((c) => c.name === n)?.id || n,
          ),
    [contacts],
  );

  const getContactId = useCallback(
    (q, name) => {
      const idx = q.contacts.indexOf(name);
      return (
        q.contactIds?.[idx] ??
        contacts.find((c) => c.name === name)?.id ??
        name
      );
    },
    [contacts],
  );

  useEffect(() => {
    if (uid && initiativeId) {
      loadHypotheses(uid, initiativeId);
    }
  }, [uid, initiativeId, loadHypotheses]);

  useEffect(() => {
    const interval = setInterval(() => {
      Object.entries(answerDrafts).forEach(([k, v]) => {
        localStorage.setItem(`answerDraft_${k}`, v);
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [answerDrafts]);

  useEffect(() => {
    if (restoredRef.current) return;
    if (!questions.length) return;
    const keys = Object.keys(localStorage).filter((k) =>
      k.startsWith("answerDraft_")
    );
    if (keys.length) {
      const key = keys[0].replace("answerDraft_", "");
      const [idxStr, name] = key.split("-");
      const idx = parseInt(idxStr, 10);
      if (!Number.isNaN(idx) && questions[idx]) {
        const q = questions[idx];
        const id = getContactId(q, name);
        setAnswerDrafts((prev) => ({
          ...prev,
          [key]: localStorage.getItem(`answerDraft_${key}`) || "",
        }));
        markAsked(idx, [id]);
        setActiveComposer({ idx, name, contacts: q.contacts });
        setRestoredDraftKey(key);
        restoredRef.current = true;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    localStorage.setItem("assigneeChoices", JSON.stringify(assigneeChoices));
  }, [assigneeChoices]);

  useEffect(() => {
    const focus = searchParams.get("focus");
    if (focus !== null) {
      const idx = parseInt(focus, 10);
      const answerParam = searchParams.get("answer");
      const ansIdx =
        answerParam !== null ? parseInt(answerParam, 10) : null;
      if (!Number.isNaN(idx)) {
        const qa = searchParams.get("qa");
        setTimeout(() => {
          if (qa === "1") openQAModal(idx, ansIdx);
          else focusQuestionCard(idx, ansIdx);
        }, 500);
      }
    }
  }, [searchParams, questions, openQAModal, focusQuestionCard]);

  useEffect(() => {
    const qId = searchParams.get("questionId");
    const msgId = searchParams.get("messageId");
    if (qId && msgId && questions.length && uid) {
      const idx = questions.findIndex((q) => String(q.id) === String(qId));
      if (idx !== -1) {
        openQAModal(idx);
        getDoc(doc(db, "users", uid, "messages", msgId)).then((snap) => {
          const data = snap.data();
          if (data) {
            setAnalysisModal({
              idx,
              name: data.from || currentUserName,
              loading: false,
              analysis: data.analysis || "",
              suggestions: data.suggestions || [],
              selected: data.suggestions || [],
            });
          }
        });
      }
    }
  }, [searchParams, questions, uid, openQAModal, currentUserName]);

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
      const assignees =
        t.assignees && t.assignees.length
          ? t.assignees.map(normalizeAssignee)
          : [normalizeAssignee(t.assignee || currentUserName)];
      assignees.forEach((a) => {
        set.add(a === currentUserName ? "My Tasks" : a);
      });
    });
    return Array.from(set);
  }, [projectTasks, currentUserName, normalizeAssignee]);

  const taskTypeOptions = useMemo(() => {
    const set = new Set();
    projectTasks.forEach((t) => {
      set.add(t.subType || "other");
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
      tasks = tasks.filter((t) => {
        const assignees =
          t.assignees && t.assignees.length
            ? t.assignees.map(normalizeAssignee)
            : [normalizeAssignee(t.assignee || currentUserName)];
        const labels = assignees.map((a) =>
          a === currentUserName ? "My Tasks" : a
        );
        return labels.includes(taskContactFilter);
      });
    }
    if (taskTypeFilter !== "all") {
      tasks = tasks.filter((t) => (t.subType || "other") === taskTypeFilter);
    }
    return tasks;
  }, [
    projectTasks,
    taskStatusFilter,
    taskProjectFilter,
    taskContactFilter,
    taskTypeFilter,
    currentUserName,
    normalizeAssignee,
  ]);

  const tasksByAssignee = useMemo(() => {
    const map = {};
    displayedTasks.forEach((t) => {
      const assignees =
        t.assignees && t.assignees.length
          ? t.assignees.map(normalizeAssignee)
          : [normalizeAssignee(t.assignee || currentUserName)];
      if (assignees.length > 1) {
        const label = assignees.join(", ");
        if (!map[label]) map[label] = [];
        map[label].push(t);
      } else {
        const a = assignees[0];
        const label = a === currentUserName ? "My Tasks" : a;
        if (!map[label]) map[label] = [];
        map[label].push(t);
      }
    });
    return map;
  }, [displayedTasks, currentUserName, normalizeAssignee]);

  const taskCounts = useMemo(() => {
    const counts = { open: 0, scheduled: 0, completed: 0 };
    projectTasks.forEach((t) => {
      const status = t.status || "open";
      if (status === "scheduled") counts.scheduled++;
      else if (status === "completed") counts.completed++;
      else counts.open++;
    });
    return counts;
  }, [projectTasks]);

  const questionCounts = useMemo(() => {
    let open = 0;
    let answered = 0;
    questions.forEach((q) => {
      const ids = getContactIds(q);
      if (ids.length === 0) {
        open++;
      } else {
        ids.forEach((id) => {
          const ans = q.answers?.[id];
          const text = typeof ans === "string" ? ans : ans?.text;
          if (typeof text === "string" && text.trim()) {
            answered++;
          } else {
            open++;
          }
        });
      }
    });
    return { open, answered };
  }, [questions]);

  const suggestionIcon = (category) => {
    switch (category) {
      case "meeting":
        return "🗓️";
      case "email":
        return "📨";
      case "research":
        return "🔎";
      case "instructional-design":
        return "🎨";
      case "question":
        return "❓";
      default:
        return "📝";
    }
  };

  const generateDraft = (recipientIds, questionObjs) => {
    const userName =
      auth.currentUser?.displayName || auth.currentUser?.email || "";
    const toNames = recipientIds
      .map((id) => contacts.find((c) => c.id === id)?.name || id)
      .join(", ");
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
      recipients: recipientIds,
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
      if (window.confirm("Connect your email account?")) {
        window.dispatchEvent(new Event("openUserSettings"));
      }
      return;
    }
    if (!auth.currentUser) {
      alert("Please log in to draft emails.");
      console.warn("auth.currentUser is null when drafting email");
      return;
    }
    const targets = getContactIds(q);
    if (!targets.length) return;
    const targetNames = targets.map((id) =>
      contacts.find((c) => c.id === id)?.name || id
    );
    const handleSelection = (chosenNames) => {
      if (!chosenNames.length) return;
      const ids = chosenNames.map(
        (n) => contacts.find((c) => c.name === n)?.id || n
      );
      const drafts = ids.map((id) =>
        generateDraft([id], [{ text: q.question, id: q.id }])
      );
      startDraftQueue(drafts);
    };
    if (targets.length === 1) {
      handleSelection([targetNames[0]]);
    } else {
      openRecipientModal(targetNames, handleSelection);
    }
  };

  const generateTaskEmail = (recipientIds, task) => {
    const userName =
      auth.currentUser?.displayName || auth.currentUser?.email || "";
    const toNames = recipientIds
      .map((id) => contacts.find((c) => c.id === id)?.name || id)
      .join(", ");
    const subject = `Regarding: ${task.message}`;
    const body = `Hi ${toNames},\n\n${task.message}\n\nBest regards,\n${userName}`;
    return { subject, body, recipients: recipientIds, taskIds: [task.id] };
  };

  const draftTaskEmail = (task) => {
    if (!emailConnected) {
      if (window.confirm("Connect your email account?")) {
        window.dispatchEvent(new Event("openUserSettings"));
      }
      return;
    }
    if (!auth.currentUser) {
      alert("Please log in to draft emails.");
      console.warn("auth.currentUser is null when drafting email");
      return;
    }
    const targets =
      task.assignees && task.assignees.length
        ? task.assignees
        : [task.assignee || currentUserName];
    if (!targets.length) return;
    const handleSelection = (chosenNames) => {
      if (!chosenNames.length) return;
      const ids = chosenNames.map(
        (n) => contacts.find((c) => c.name === n)?.id || n
      );
      const drafts = ids.map((id) => generateTaskEmail([id], task));
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
      .map((id) => contacts.find((c) => c.id === id)?.info?.email)
      .filter((e) => e);
    if (!emails.length) {
      alert("Missing email address for selected contact");
      return;
    }
    try {
      if (appCheck) await getToken(appCheck);
      await auth.currentUser.getIdToken(true);
      const callable = httpsCallable(functions, "sendQuestionEmail");
      await callable({
        provider: emailProvider,
        recipientEmail: emails.join(","),
        subject: emailDraft.subject,
        message: emailDraft.body,
        questionId: emailDraft.questionIds[0],
      });
      const qIdx = questions.findIndex(
        (q) => q.id === emailDraft.questionIds[0],
      );
      if (qIdx >= 0) await markAsked(qIdx, emailDraft.recipients);
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

  const analyzeAnswer = async (question, text, respondent) => {
    try {
      if (appCheck) await getToken(appCheck);
      if (auth.currentUser) await auth.currentUser.getIdToken(true);
      const callable = httpsCallable(functions, "analyzeDiscoveryAnswer");
      const resp = await callable({
        uid,
        initiativeId,
        questionId: null,
        questionText: question,
        answerText: text,
        respondent,
      });
      const data = resp?.data || {};
      return {
        analysis: typeof data.analysis === "string" ? data.analysis : JSON.stringify(data.analysis || ""),
        suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
        messageId: data.messageId || null,
      };
    } catch (err) {
      console.error("analyzeAnswer error", err);
      return { analysis: "Analysis could not be generated.", suggestions: [] };
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
      questionIds: [questions[idx]?.id],
    };
    startDraftQueue([draft]);
  };


  const createTasksFromAnalysis = async (idx, name, suggestions) => {
    if (!uid || !initiativeId || !suggestions.length) return;

    const questionsToAdd = [];
    const tasksToAdd = [];
    let addedCount = 0;

    const existingQuestionSet = new Set(
      questions.map((q) => q.question.toLowerCase())
    );

    const answerObj = questions[idx]?.answers || {};
    const answerIndex = Math.max(
      0,
      Object.keys(answerObj).indexOf(name)
    );
    const answerText = answerObj[name]?.text || "";
    const answerPreview = answerText
      .split(/(?<=\.)\s+/)
      .slice(0, 2)
      .join(" ")
      .slice(0, 200);
    const questionText = questions[idx]?.question || "";
    const questionPreview = questionText.slice(0, 200);

    try {
      for (const s of suggestions) {
        const lowerText = s.text.toLowerCase();
        if (existingQuestionSet.has(lowerText)) continue;

        const duplicateTasks = projectTasks.filter(
          (t) => t.message.toLowerCase() === lowerText
        );
        if (duplicateTasks.length > 0) {
          const choice = prompt(
            `Task with the same intent already exists:\n${duplicateTasks
              .map((t) => `- ${t.message}`)
              .join("\n")}\nAdd anyway (a) / Skip (s) / Merge now (m)?`,
            "s"
          );
          const c = (choice || "").toLowerCase();
          if (c === "" || c === "s") {
            continue;
          }
          if (c === "m") {
            const existing = duplicateTasks[0];
            const merged = prompt(
              `Existing: ${existing.message}\nNew: ${s.text}\nMerged task:`,
              `${existing.message}; ${s.text}`
            );
            if (merged) {
              const tag = await classifyTask(merged);
              await updateDoc(
                doc(
                  db,
                  "users",
                  uid,
                  "initiatives",
                  initiativeId,
                  "tasks",
                  existing.id
                ),
                {
                  message: merged,
                  tag,
                  hypothesisId: existing.hypothesisId ?? null,
                  taskType: existing.taskType ?? "explore",
                  priority:
                    existing.priority ??
                    getPriority(
                      existing.taskType ?? "explore",
                      hypotheses.find((h) => h.id === existing.hypothesisId)?.confidence || 0,
                    ),
                }
              );
            }
            continue;
          }
        }

        const assigneeNames =
          s.assignees && s.assignees.length
            ? s.assignees.map(normalizeAssignee)
            : parseContactNames(s.who || "").map(normalizeAssignee);

        if (s.category === "question") {
          const contactsList = assigneeNames.length ? assigneeNames : [name];
          const asked = contactsList.reduce(
            (acc, c) => ({ ...acc, [c]: false }),
            {}
          );
          questionsToAdd.push({
            question: s.text,
            contacts: contactsList,
            answers: {},
            asked,
          });
          existingQuestionSet.add(lowerText);
        } else {
          const tag = await classifyTask(s.text);
          const allowedTaskTypes = ["validate", "refute", "explore"];
          const taskType = allowedTaskTypes.includes((s.taskType || "").toLowerCase())
            ? s.taskType.toLowerCase()
            : "explore";
          const finalAssignees = assigneeNames.length
            ? assigneeNames
            : [currentUserName];
          const provenance = [
            {
              question: idx,
              answer: answerIndex,
              questionPreview,
              answerPreview,
              preview: answerPreview,
              ruleId: s.ruleId || s.templateId || null,
            },
          ];
          const hypoConf = s.hypothesisId
            ? hypotheses.find((h) => h.id === s.hypothesisId)?.confidence || 0
            : 0;
          const priority = getPriority(taskType, hypoConf);
          tasksToAdd.push({
            name,
            message: s.text,
            assignees: finalAssignees,
            assignee: finalAssignees[0],
            subType: s.category,
            status: "open",
            createdAt: serverTimestamp(),
            tag,
            provenance,
            hypothesisId: s.hypothesisId || null,
            taskType,
            priority,
          });
          addedCount += 1;
        }
      }

      if (tasksToAdd.length > 0) {
        const tasksCollection = collection(
          db,
          "users",
          uid,
          "initiatives",
          initiativeId,
          "tasks"
        );
        await Promise.all(
          tasksToAdd.map((taskData) => addDoc(tasksCollection, taskData))
        );
      }

      if (questionsToAdd.length > 0) {
        setQuestions((prevQuestions) => {
          const updatedQuestions = [...prevQuestions, ...questionsToAdd];
          if (uid) {
            saveInitiative(uid, initiativeId, {
              clarifyingQuestions: updatedQuestions.map((q) => ({
                question: q.question,
              })),
              clarifyingContacts: Object.fromEntries(
                updatedQuestions.map((qq, i) => [i, qq.contacts])
              ),
              clarifyingAnswers: updatedQuestions.map((qq) => qq.answers),
              clarifyingAsked: updatedQuestions.map((qq) => qq.asked),
            });
          }
          return updatedQuestions;
        });
      }
      return addedCount;
    } catch (err) {
      console.error("createTasksFromAnalysis error", err);
    }
  };

  const updateTaskStatus = async (id, status, extra = {}) => {
    if (!uid || !initiativeId) return;
    try {
      const taskRef = doc(
        db,
        "users",
        uid,
        "initiatives",
        initiativeId,
        "tasks",
        id
      );
      const snap = await getDoc(taskRef);
      const current = snap.data() || {};
      const conf =
        hypotheses.find((h) => h.id === current.hypothesisId)?.confidence || 0;
      const priority =
        current.priority ??
        getPriority(current.taskType ?? "explore", conf);
      const data = {
        status,
        statusChangedAt: serverTimestamp(),
        hypothesisId: current.hypothesisId ?? null,
        taskType: current.taskType ?? "explore",
        priority,
        ...extra,
      };
      if (status === "completed") {
        data.completedAt = serverTimestamp();
      }
      await updateDoc(taskRef, data);
    } catch (err) {
      console.error("updateTaskStatus error", err);
    }
  };

  // Handlers for updating task status
  const openCompleteModal = (task) => {
    setCompletionModal({ task, notes: "", fileText: "" });
  };

  const submitCompletion = async () => {
    if (!completionModal) return;
    const { task, notes, fileText } = completionModal;
    const combined = [notes, fileText].filter(Boolean).join("\n\n");
    await updateTaskStatus(
      task.id,
      "completed",
      combined ? { completionNotes: combined } : {}
    );
    setProjectTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? { ...t, status: "completed", completionNotes: combined }
          : t
      )
    );
    setCompletionModal(null);
    if (combined.trim()) {
      setAnalyzing(true);
      setAnalysisModal({
        idx: null,
        name: currentUserName,
        loading: true,
        analysis: null,
        suggestions: [],
        selected: [],
        progress: "Analyzing completion...",
      });
      const timeoutId = setTimeout(() => {
        setAnalysisModal((prev) =>
          prev && prev.loading ? { ...prev, progress: "Still analyzing..." } : prev
        );
      }, 3000);
      const result = await analyzeAnswer(
        task.message,
        combined,
        currentUserName
      );
      clearTimeout(timeoutId);
      setAnalyzing(false);
      setAnalysisModal({
        idx: null,
        name: currentUserName,
        loading: false,
        ...result,
        selected: result.suggestions,
      });
    }
  };

  const handleCompletionFile = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setCompletionModal((prev) => ({ ...prev, fileText: ev.target.result }));
      };
      reader.readAsText(file);
    }
  };

  const handleScheduleTask = (id) => updateTaskStatus(id, "scheduled");
  const handleDeleteTask = async (id) => {

    if (!uid || !initiativeId) return;
    try {
      await deleteDoc(
        doc(db, "users", uid, "initiatives", initiativeId, "tasks", id)
      );
    } catch (err) {
      console.error("deleteTask error", err);
    }
  };

  const addAssigneeToTask = (taskId, name) => {
    const task = projectTasks.find((t) => t.id === taskId) || {};
    const normalized = normalizeAssigneeName(name, currentUserName);
    let newAssignees = [];
    setProjectTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        const assignees =
          t.assignees && t.assignees.length
            ? [...t.assignees]
            : [t.assignee || currentUserName];
        if (!assignees.includes(normalized)) assignees.push(normalized);
        newAssignees = assignees;
        return { ...t, assignees, assignee: assignees[0] };
      })
    );
    if (uid && initiativeId && newAssignees.length) {
      const conf =
        hypotheses.find((h) => h.id === task.hypothesisId)?.confidence || 0;
      const priority =
        task.priority ?? getPriority(task.taskType ?? "explore", conf);
      updateDoc(
        doc(db, "users", uid, "initiatives", initiativeId, "tasks", taskId),
        {
          assignees: newAssignees,
          assignee: newAssignees[0],
          hypothesisId: task.hypothesisId ?? null,
          taskType: task.taskType ?? "explore",
          priority,
        }
      ).catch((err) => console.error("addAssigneeToTask error", err));
    }
  };

  const removeAssigneeFromTask = (taskId, name) => {
    const task = projectTasks.find((t) => t.id === taskId) || {};
    const normalized = normalizeAssigneeName(name, currentUserName);
    let newAssignees = [];
    setProjectTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        const assignees = (
          t.assignees && t.assignees.length
            ? t.assignees
            : [t.assignee || currentUserName]
        ).filter((a) => a !== normalized);
        newAssignees = assignees;
        return { ...t, assignees, assignee: assignees[0] || "" };
      })
    );
    if (uid && initiativeId) {
      const conf =
        hypotheses.find((h) => h.id === task.hypothesisId)?.confidence || 0;
      const priority =
        task.priority ?? getPriority(task.taskType ?? "explore", conf);
      updateDoc(
        doc(db, "users", uid, "initiatives", initiativeId, "tasks", taskId),
        {
          assignees: newAssignees,
          assignee: newAssignees[0] || "",
          hypothesisId: task.hypothesisId ?? null,
          taskType: task.taskType ?? "explore",
          priority,
        }
      ).catch((err) => console.error("removeAssigneeFromTask error", err));
    }
  };

  const handleTaskContactSelect = (taskId, value) => {
    if (value === "__add__") {
      const newName = addContact();
      if (newName) addAssigneeToTask(taskId, newName);
    } else if (value) {
      addAssigneeToTask(taskId, value);
    }
  };

  const handleSubTaskToggle = async (taskId, index, completed) => {
    if (!uid || !initiativeId) return;
    const task = projectTasks.find((t) => t.id === taskId);
    if (!task) return;
    const updated = task.subTasks.map((st, i) =>
      i === index
        ? {
            ...st,
            completed,
            completedAt: completed ? Timestamp.now() : null,
          }
        : st
    );
    try {
      await updateDoc(
        doc(db, "users", uid, "initiatives", initiativeId, "tasks", taskId),
        {
          subTasks: updated,
          hypothesisId: task.hypothesisId ?? null,
          taskType: task.taskType ?? "explore",
          priority:
            task.priority ??
            getPriority(
              task.taskType ?? "explore",
              hypotheses.find((h) => h.id === task.hypothesisId)?.confidence || 0,
            ),
        }
      );
      setProjectTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, subTasks: updated } : t))
      );
    } catch (err) {
      console.error("handleSubTaskToggle error", err);
    }
  };

  const openEditModal = (task) => {
    setEditTask({
      id: task.id,
      assignees:
        task.assignees && task.assignees.length
          ? [...task.assignees]
          : [task.assignee || currentUserName],
      subType: task.subType || task.tag || "task",
      subTasks: task.subTasks ? task.subTasks.map((st) => ({ ...st })) : [],
      hypothesisId: task.hypothesisId || "",
      taskType: task.taskType || "explore",
    });
  };

  const updateEditTaskField = (field, value) => {
    setEditTask((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === "taskType" || field === "hypothesisId") {
        const conf =
          hypotheses.find((h) => h.id === (field === "hypothesisId" ? value : updated.hypothesisId))?.confidence || 0;
        updated.priority = getPriority(updated.taskType || "explore", conf);
      }
      return updated;
    });
  };

  const addEditSubTask = () => {
    setEditTask((prev) => ({
      ...prev,
      subTasks: [...(prev.subTasks || []), { text: "", completed: false }],
    }));
  };

  const updateEditSubTask = (idx, text) => {
    setEditTask((prev) => ({
      ...prev,
      subTasks: prev.subTasks.map((st, i) =>
        i === idx ? { ...st, text } : st
      ),
    }));
  };

  const removeEditSubTask = (idx) => {
    setEditTask((prev) => ({
      ...prev,
      subTasks: prev.subTasks.filter((_, i) => i !== idx),
    }));
  };

  const saveEditTask = async () => {
    if (!uid || !initiativeId || !editTask) return;
    const assignees =
      editTask.assignees && editTask.assignees.length
        ? editTask.assignees
        : [currentUserName];
    try {
      const conf =
        hypotheses.find((h) => h.id === editTask.hypothesisId)?.confidence || 0;
      const priority = getPriority(editTask.taskType ?? "explore", conf);
      await updateDoc(
        doc(db, "users", uid, "initiatives", initiativeId, "tasks", editTask.id),
        {
          assignees,
          assignee: assignees[0],
          subType: editTask.subType,
          tag: editTask.subType,
          subTasks: editTask.subTasks,
          hypothesisId: editTask.hypothesisId ?? null,
          taskType: editTask.taskType ?? "explore",
          priority,
        }
      );
      setProjectTasks((prev) =>
        prev.map((t) =>
          t.id === editTask.id
            ? {
                ...t,
                assignees,
                assignee: assignees[0],
                subType: editTask.subType,
                tag: editTask.subType,
                subTasks: editTask.subTasks,
                hypothesisId: editTask.hypothesisId ?? null,
                taskType: editTask.taskType ?? "explore",
                priority,
              }
            : t
        )
      );
      setEditTask(null);
    } catch (err) {
      console.error("saveEditTask error", err);
    }
  };

  const computeBundles = () => {
    const map = {};
    displayedTasks
      .filter((t) => (t.status || "open") === "open")
      .forEach((t) => {
        const assignees =
          t.assignees && t.assignees.length
            ? t.assignees
            : [t.assignee || t.name || ""];
        const key = `${assignees.slice().sort().join("|")}-${
          t.subType || t.tag || "other"
        }`;
        if (!map[key]) map[key] = [];
        map[key].push(t);
      });
    return Object.values(map).filter((b) => b.length > 1);
  };

  const startSynergy = () => {
    const bundles = computeBundles();
    if (!bundles.length) {
      alert("No synergy opportunities found.");
      return;
    }
    const proposals = bundles.map((b) => {
      const first = b[0];
      const assignees =
        first.assignees && first.assignees.length
          ? first.assignees
          : [first.assignee || first.name || ""];
      const assigneeLabel = assignees.join(", ");
      const type = first.subType || first.tag || "";
      let header;
      switch (type) {
        case "email":
          header = `Send an email to ${assigneeLabel}`;
          break;
        case "meeting":
          header =
            assignees.length === 1 && assignees[0] === currentUserName
              ? "Suggested meetings"
              : `Set up a meeting with ${assigneeLabel}`;
          break;
        case "call":
          header = `Call ${assigneeLabel}`;
          break;
        default: {
          const prettyType = type ? `${type.replace(/-/g, " ")} ` : "";
          header =
            assignees.length === 1 && assignees[0] === currentUserName
              ? `Here are your current ${prettyType}tasks:`
              : `Work with ${assigneeLabel}`;
          break;
        }
      }
      const bullets = dedupeByMessage(b).map((t) => t.message);
      const text = [header, ...bullets.map((m) => `- ${m}`)].join("\n");
      return { bundle: b, text, header, bullets };
    });
    if (proposals.length) {
      setSynergyQueue(proposals);
      setSynergyIndex(0);
    }
  };

  const nextSynergy = () => {
    const next = synergyIndex + 1;
    if (next < synergyQueue.length) {
      setSynergyIndex(next);
    } else {
      setSynergyQueue([]);
      setSynergyIndex(0);
    }
  };

  const handleSynergize = async (bundle, header, bullets) => {
    if (!uid || !initiativeId || !bundle.length) return;
    const [first, ...rest] = bundle;
    const subTasks = bullets.map((m) => ({ text: m, completed: false }));
    const provenance = [];
    bundle.forEach((t) => {
      (t.provenance || []).forEach((p) => {
        if (
          !provenance.some(
            (q) =>
              q.question === p.question &&
              q.answer === p.answer &&
              q.ruleId === p.ruleId
          )
        ) {
          provenance.push(p);
        }
      });
    });
    await updateDoc(
      doc(db, "users", uid, "initiatives", initiativeId, "tasks", first.id),
      {
        message: header,
        subTasks,
        provenance,
        hypothesisId: first.hypothesisId ?? null,
        taskType: first.taskType ?? "explore",
        priority:
          first.priority ??
          getPriority(
            first.taskType ?? "explore",
            hypotheses.find((h) => h.id === first.hypothesisId)?.confidence || 0,
          ),
      }
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
      const openTasks = displayedTasks.filter(
        (t) => (t.status || "open") === "open"
      );
      const { text } = await generate(
        `Order the following tasks by priority and return a JSON array of ids in order:\n${openTasks
          .map((t) => `${t.id}: ${t.message}`)
          .join("\n")}`
      );
      const match = text.match(/\[[^\]]*\]/);
      const ids = match ? JSON.parse(match[0]) : [];
      const ordered = ids
        .map((id) => openTasks.find((t) => t.id === id))
        .filter(Boolean);
      setPrioritized(ordered.length ? ordered : [...openTasks]);
    } catch (err) {
      console.error("prioritize", err);
      const openTasks = displayedTasks.filter(
        (t) => (t.status || "open") === "open"
      );
      setPrioritized([...openTasks]);
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
      const conf =
        hypotheses.find((h) => h.id === prioritized[i].hypothesisId)?.confidence || 0;
      const priority =
        prioritized[i].priority ??
        getPriority(prioritized[i].taskType ?? "explore", conf);
      await updateDoc(
        doc(db, "users", uid, "initiatives", initiativeId, "tasks", prioritized[i].id),
        {
          order: i,
          hypothesisId: prioritized[i].hypothesisId ?? null,
          taskType: prioritized[i].taskType ?? "explore",
          priority,
        }
      );
    }
    setPrioritized(null);
  };

  const renderTaskCard = (t, actionButtons) => {
    const contactsArr =
      t.assignees && t.assignees.length
        ? t.assignees
        : [t.assignee || currentUserName];
    const project = t.project || projectName || "General";
    return (
      <div key={t.id} className="initiative-card task-card space-y-3">
        {t.tag && <span className={`task-tag ${t.tag}`}>{t.tag}</span>}
        <div className="task-card-header">
          <div className="contact-row">
            {contactsArr.map((name) => (
              <span
                key={name}
                className="contact-tag"
                style={{ backgroundColor: getColor(name) }}
              >
                {name === currentUserName ? "My Tasks" : name}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeAssigneeFromTask(t.id, name);
                  }}
                >
                  ×
                </button>
              </span>
            ))}
            <button
              className="add-contact-btn"
              onClick={() =>
                setOpenTaskDropdown((d) => (d === t.id ? null : t.id))
              }
            >
              +
            </button>
            {openTaskDropdown === t.id && (
              <select
                className="contact-select"
                value=""
                onChange={(e) => {
                  handleTaskContactSelect(t.id, e.target.value);
                  setOpenTaskDropdown(null);
                }}
              >
                <option value="">Select Contact</option>
                {contacts
                  .filter((c) => !contactsArr.includes(c.name))
                  .map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                <option value="__add__">Add New Contact</option>
              </select>
            )}
          </div>
          <span className="task-project">{project}</span>
        </div>
        <p>{t.message}</p>
        {Array.isArray(t.provenance) && t.provenance.length > 0 && (
          <div className="provenance-chips">
            {t.provenance.map((p, idxP) => (
              <div key={idxP} className="provenance-group">
                <span
                  className="prov-chip"
                  title={p.questionPreview || p.preview}
                  onClick={() => openQAModal(p.question)}
                >
                  {`Q${p.question + 1}`}
                </span>
                <span
                  className="prov-chip"
                  title={p.answerPreview || p.preview}
                  onClick={() => openQAModal(p.question, p.answer)}
                >
                  {`A${p.answer + 1}`}
                </span>
                {p.ruleId && (
                  <span
                    className="prov-chip"
                    title={p.answerPreview || p.preview}
                    onClick={() => openQAModal(p.question, p.answer)}
                  >
                    {p.ruleId}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {t.subTasks && t.subTasks.length > 0 && (
          <ul className="ml-4 list-disc space-y-1">
            {t.subTasks.map((st, idx) => (
              <li key={idx} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!st.completed}
                  onChange={(e) =>
                    handleSubTaskToggle(t.id, idx, e.target.checked)
                  }
                />
                <span className={st.completed ? "line-through" : ""}>
                  {st.text}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">{actionButtons}</div>
      </div>
    );
  };

  const handleAnswerSubmit = async (idx, name) => {
    const key = `${idx}-${name}`;
    const text = (answerDrafts[key] || "").trim();
    if (text.length < 2) return;
    const q = questions[idx];
    const contactIdVal = getContactId(q, name);
    try {
      updateAnswer(q.id, contactIdVal, text);
      setAnswerDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      localStorage.removeItem(`answerDraft_${key}`);
      setActiveComposer(null);
      alert("Answer saved.");
    } catch {
      if (window.confirm("Error saving answer. Retry?")) {
        return handleAnswerSubmit(idx, name);
      }
      return;
    }
    setAnalyzing(true);
    setAnalysisModal({
      idx,
      name,
      loading: true,
      analysis: null,
      suggestions: [],
      selected: [],
      progress: "Analyzing answer...",
    });
    const timeoutId = setTimeout(() => {
      setAnalysisModal((prev) =>
        prev && prev.loading ? { ...prev, progress: "Still analyzing..." } : prev
      );
    }, 3000);
    const result = await analyzeAnswer(
      questions[idx]?.question || "",
      text,
      name
    );
    clearTimeout(timeoutId);
    setAnalyzing(false);
    setAnalysisModal({
      idx,
      name,
      loading: false,
      ...result,
      selected: result.suggestions,
    });
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
        setCurrentUserName(user.displayName || user.email || "My Tasks");
        const gmailSnap = await getDoc(
          doc(db, "users", user.uid, "emailTokens", "gmail"),
        );
        const imapSnap = await getDoc(
          doc(db, "users", user.uid, "emailTokens", "imap"),
        );
        const popSnap = await getDoc(
          doc(db, "users", user.uid, "emailTokens", "pop3"),
        );
        const outlookSnap = await getDoc(
          doc(db, "users", user.uid, "emailTokens", "outlook"),
        );
        const provider = gmailSnap.exists()
          ? "gmail"
          : imapSnap.exists()
          ? "imap"
          : popSnap.exists()
          ? "pop3"
          : outlookSnap.exists()
          ? "outlook"
          : null;
        setEmailProvider(provider);
        if (initiativeId) {
          const init = await loadInitiative(user.uid, initiativeId);
          setProjectName(init?.projectName || "");
          setProjectStage(init?.stage || "");
          setBusinessGoal(init?.businessGoal || "");
          setAudienceProfile(init?.audienceProfile || "");
          setProjectConstraints(init?.projectConstraints || "");
          const contactsInit = (init?.keyContacts || []).map((c, i) => ({
            id: c.id || crypto.randomUUID(),
            name: c.name || "",
            jobTitle: c.jobTitle || c.role || "",
            profile: c.profile || "",
            info: {
              email: c.info?.email || c.email || "",
              slack: c.info?.slack || "",
              teams: c.info?.teams || "",
            },
            color: colorPalette[i % colorPalette.length],
          }));
          setContacts(contactsInit);
          const contactMap = Object.fromEntries(
            contactsInit.map((c) => [c.id || c.name, c])
          );
          const qs = (init?.projectQuestions || []).map((q, idx) => {
            const statusArr = Array.isArray(q.contactStatus)
              ? q.contactStatus
              : Object.entries(q.contactStatus || {}).map(
                  ([contactId, status]) => ({ contactId, ...status })
                );
            const ids = (q.contacts && q.contacts.length)
              ? q.contacts
              : statusArr.map((cs) => cs.contactId);
            const names = ids.map((cid) => contactMap[cid]?.name || cid);
            const asked = {};
            const answers = {};
            statusArr.forEach((cs) => {
              asked[cs.contactId] =
                cs.currentStatus === "Asked" || cs.currentStatus === "Answered";
              const last = cs.answers?.[cs.answers.length - 1];
              if (last) {
                answers[cs.contactId] = last;
              }
            });
            return {
              ...q,
              id: q.id || generateQuestionId(),
              idx,
              contacts: names,
              contactIds: ids,
              contactStatus: statusArr,
              asked,
              answers,
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
      const list = snap.docs.map((d) => {
        const data = d.data();
        const assignees =
          data.assignees && data.assignees.length
            ? data.assignees.map(normalizeAssignee)
            : [normalizeAssignee(data.assignee || currentUserName)];
        return { id: d.id, ...data, assignees, assignee: assignees[0] };
      });
      setProjectTasks(list);
    });
    return () => unsub();
  }, [uid, initiativeId, currentUserName, normalizeAssignee]);

  // Listen for suggested tasks (pending acceptance)
  useEffect(() => {
    if (!uid || !initiativeId) return;
    const sref = collection(
      db,
      "users",
      uid,
      "initiatives",
      initiativeId,
      "suggestedTasks",
    );
    const unsub = onSnapshot(sref, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setSuggestedTasks(list);
    });
    return () => unsub();
  }, [uid, initiativeId]);

  // Auto-correct any misfiled suggested questions that were stored in suggestedTasks
  useEffect(() => {
    if (!uid || !initiativeId) return;
    const fix = async () => {
      const misfiled = (suggestedTasks || []).filter(
        (t) => (String(t.subType || t.tag || "").toLowerCase() === "question")
      );
      if (!misfiled.length) return;
      const qcol = collection(db, "users", uid, "initiatives", initiativeId, "suggestedQuestions");
      for (const t of misfiled) {
        try {
          await addDoc(qcol, {
            question: t.message || t.text || "",
            hypothesisId: t.hypothesisId || null,
            createdAt: serverTimestamp(),
            source: t.source || null,
          });
          await deleteDoc(doc(db, "users", uid, "initiatives", initiativeId, "suggestedTasks", t.id));
        } catch (err) {
          console.error("failed to move misfiled suggested question", err);
        }
      }
    };
    fix();
  }, [uid, initiativeId, suggestedTasks]);

  // Listen for suggested questions (pending acceptance)
  useEffect(() => {
    if (!uid || !initiativeId) return;
    const qref = collection(
      db,
      "users",
      uid,
      "initiatives",
      initiativeId,
      "suggestedQuestions",
    );
    const unsub = onSnapshot(qref, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setSuggestedQuestions(list);
    });
    return () => unsub();
  }, [uid, initiativeId]);

  const acceptSuggestedTask = async (t) => {
    if (!uid || !initiativeId) return;
    try {
      const tasksCol = collection(
        db,
        "users",
        uid,
        "initiatives",
        initiativeId,
        "tasks",
      );
      const assignees = t.who ? [t.who] : [currentUserName];
      await addDoc(tasksCol, {
        name: currentUserName,
        message: t.message,
        assignees,
        assignee: assignees[0],
        subType: t.subType,
        status: "open",
        createdAt: serverTimestamp(),
        tag: t.subType,
        provenance: t.source ? [t.source] : [],
        hypothesisId: t.hypothesisId || null,
        taskType: t.taskType || "explore",
      });
      await deleteDoc(doc(db, "users", uid, "initiatives", initiativeId, "suggestedTasks", t.id));
    } catch (err) {
      console.error("acceptSuggestedTask error", err);
    }
  };

  const rejectSuggestedTask = async (t) => {
    if (!uid || !initiativeId) return;
    try {
      await deleteDoc(doc(db, "users", uid, "initiatives", initiativeId, "suggestedTasks", t.id));
    } catch (err) {
      console.error("rejectSuggestedTask error", err);
    }
  };

  const acceptSuggestedQuestion = async (q) => {
    if (!uid || !initiativeId) return;
    try {
      const newQ = {
        id: `qq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        phase: "General",
        question: q.question,
        contacts: [],
        contactStatus: [],
      };
      await saveInitiative(uid, initiativeId, { projectQuestions: [newQ] });
      // Auto-link to hypotheses or general category
      try {
        if (Array.isArray(hypotheses) && hypotheses.length) {
          const hypList = hypotheses
            .map((h) => `${h.id}: ${h.statement || h.hypothesis || h.label || ""}`)
            .join("\n");
          const catPrompt = `You are a strategic analyst. Given the hypotheses and the question below, return JSON mapping the question id to either a list of linked hypothesis ids (if it directly investigates one or more hypotheses) or a general category when it does not. Use categories from this set only: [\"Logistics\",\"Scope\",\"Stakeholders\",\"Timeline\",\"Risks\",\"Dependencies\",\"Success Criteria\",\"Budget\",\"Tools/Systems\",\"Compliance\",\"Other\"].\n\nHypotheses:\n${hypList}\n\nQuestion:\n${newQ.id}: ${newQ.question}\n\nReturn JSON exactly like:\n{\"items\":[{\"id\":\"${newQ.id}\",\"hypothesisIds\":[\"A\"],\"category\":\"\"}]}`;
          const { text: resp } = await generate(catPrompt);
          const mapping = parseJsonFromText(resp);
          const item = (mapping.items || []).find((m) => m.id === newQ.id);
          const hypothesisIds = Array.isArray(item?.hypothesisIds) ? item.hypothesisIds.filter(Boolean) : [];
          const category = hypothesisIds.length ? undefined : (item?.category || undefined);
          if (hypothesisIds.length || category) {
            await saveInitiative(uid, initiativeId, {
              projectQuestions: [{ id: newQ.id, hypothesisIds, hypothesisId: hypothesisIds[0] || null, category }],
            });
          }
        }
      } catch (linkErr) {
        console.warn("Auto-linking suggested question to hypotheses failed", linkErr);
      }
      await deleteDoc(doc(db, "users", uid, "initiatives", initiativeId, "suggestedQuestions", q.id));
    } catch (err) {
      console.error("acceptSuggestedQuestion error", err);
    }
  };

  const rejectSuggestedQuestion = async (q) => {
    if (!uid || !initiativeId) return;
    try {
      await deleteDoc(doc(db, "users", uid, "initiatives", initiativeId, "suggestedQuestions", q.id));
    } catch (err) {
      console.error("rejectSuggestedQuestion error", err);
    }
  };

  useEffect(() => {
    projectTasksRef.current = projectTasks;
  }, [projectTasks]);

  useEffect(() => {
    if (!uid || !initiativeId) return;
    const ref = doc(db, "users", uid, "initiatives", initiativeId);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data();
      if (!data) return;
      const toArray = (val) =>
        Array.isArray(val)
          ? val
          : val && typeof val === "object"
            ? Object.values(val)
            : [];
      const hyps = toArray(data?.inquiryMap?.hypotheses ?? data?.hypotheses);
      const prev = prevHypothesisConfidence.current;
      hyps.forEach((h) => {
        const conf = typeof h.confidence === "number" ? h.confidence : 0;
        if (prev[h.id] !== conf) {
          prev[h.id] = conf;
          const related = projectTasksRef.current.filter(
            (t) => t.hypothesisId === h.id || (Array.isArray(t.hypothesisIds) && t.hypothesisIds.includes(h.id)),
          );
          const updates = [];
          related.forEach((task) => {
            const priority = getPriority(task.taskType || "explore", conf);
            if (priority !== task.priority) {
              updateDoc(
                doc(
                  db,
                  "users",
                  uid,
                  "initiatives",
                  initiativeId,
                  "tasks",
                  task.id,
                ),
                {
                  priority,
                  taskType: task.taskType ?? "explore",
                  hypothesisId: task.hypothesisId ?? null,
                },
              ).catch((err) => console.error("update priority error", err));
              updates.push({ id: task.id, priority });
            }
          });
          if (updates.length) {
            setProjectTasks((prevTasks) =>
              prevTasks.map((t) => {
                const found = updates.find((u) => u.id === t.id);
                return found ? { ...t, priority: found.priority } : t;
              }),
            );
          }
        }
      });
    });
    return () => unsub();
  }, [uid, initiativeId]);

  const updateAnswer = (id, contactId, text, analysis) => {
    setQuestions((prev) => {
      const updated = prev.map((q) => {
        if (q.id !== id) return q;
        const current = getContactStatus(q.contactStatus, contactId);
        const status = markAnswered(current, {
          text,
          analysis,
          answeredBy: currentUserName,
          channel: "hub",
        });
        const contactStatus = setContactStatus(
          q.contactStatus,
          contactId,
          status,
        );
        const updatedQ = {
          ...q,
          contactStatus,
          answers: {
            ...q.answers,
            [contactId]: status.answers[status.answers.length - 1],
          },
          asked: { ...q.asked, [contactId]: true },
        };
        if (uid) {
          const saveQ = { ...updatedQ, contacts: updatedQ.contactIds };
          delete saveQ.contactNames;
          delete saveQ.contactIds;
          delete saveQ.idx;
          saveQ.contactStatus = contactStatus;
          saveInitiative(uid, initiativeId, { projectQuestions: [saveQ] });
        }
        return updatedQ;
      });
      return updated;
    });
  };

  const addContact = () => {
    const name = prompt("Contact name?");
    if (!name) return null;
    const jobTitle = prompt("Job title? (optional)") || "";
    const email = prompt("Contact email? (optional)") || "";
    const color = colorPalette[contacts.length % colorPalette.length];
    const newContact = {
      id: crypto.randomUUID(),
      name,
      jobTitle,
      profile: "",
      info: { email, slack: "", teams: "" },
      color,
    };
    const updated = [...contacts, newContact];
    setContacts(updated);
    if (uid) {
      saveInitiative(uid, initiativeId, {
        keyContacts: updated.map(({ id, name, jobTitle, profile, info }) => ({
          id,
          name,
          jobTitle,
          profile,
          info,
        })),
      });
      // Also persist to global user contacts (fire-and-forget)
      saveUserContact(uid, { name, jobTitle, info: { email } }).catch((e) =>
        console.warn("Failed to save global contact", e)
      );
    }
    return name;
  };

  const addContactByName = (name) => {
    if (!name) return;
    setContacts((prev) => {
      const lower = name.toLowerCase();
      if (prev.some((c) => c.name.toLowerCase() === lower)) return prev;
      const color = colorPalette[prev.length % colorPalette.length];
      const newContact = {
        id: crypto.randomUUID(),
        name,
        jobTitle: "",
        profile: "",
        info: { email: "", slack: "", teams: "" },
        color,
      };
      const updated = [...prev, newContact];
      if (uid) {
        saveInitiative(uid, initiativeId, {
          keyContacts: updated.map(({ id, name, jobTitle, profile, info }) => ({
            id,
            name,
            jobTitle,
            profile,
            info,
          })),
        });
      }
      return updated;
    });
  };

  const resolveSuggestionsForContacts = async (suggestions) => {
    let updatedContacts = [...contacts];
    const known = new Set(updatedContacts.map((c) => c.name.toLowerCase()));
    const resolved = [];
    const allowedTaskTypes = ["validate", "refute", "explore"];
    for (const raw of suggestions) {
      const s = {
        ...raw,
        taskType: allowedTaskTypes.includes((raw.taskType || "").toLowerCase())
          ? raw.taskType.toLowerCase()
          : "explore",
        hypothesisId:
          typeof raw.hypothesisId === "string" && raw.hypothesisId.trim()
            ? raw.hypothesisId.trim()
            : null,
      };
      const names = parseContactNames(s.who || "");
      if (!names.length) {
        resolved.push({ ...s, assignees: [] });
        continue;
      }
      const finalNames = [];
      for (const name of names) {
        const lower = name.toLowerCase();
        if (
          !name ||
          lower === "current user" ||
          lower === currentUserName.toLowerCase()
        ) {
          finalNames.push(currentUserName);
          continue;
        }
        if (known.has(lower)) {
          finalNames.push(name);
          continue;
        }
        if (assigneeChoices[lower]) {
          if (assigneeChoices[lower] === "create") {
            finalNames.push(name);
            known.add(lower);
          } else {
            finalNames.push(currentUserName);
          }
          continue;
        }
        const create = window.confirm(
          `${name} is not a project contact.\nClick OK to create this contact or Cancel to assign to yourself.`
        );
        setAssigneeChoices((prev) => ({
          ...prev,
          [lower]: create ? "create" : "self",
        }));
        if (create) {
          const color =
            colorPalette[updatedContacts.length % colorPalette.length];
          const newContact = {
            id: crypto.randomUUID(),
            name,
            jobTitle: "",
            profile: "",
            info: { email: "", slack: "", teams: "" },
            color,
          };
          updatedContacts = [...updatedContacts, newContact];
          setContacts(updatedContacts);
          if (uid) {
            saveInitiative(uid, initiativeId, {
              keyContacts: updatedContacts.map(
                ({ id, name, jobTitle, profile, info }) => ({
                  id,
                  name,
                  jobTitle,
                  profile,
                  info,
                })
              ),
            });
          }
          known.add(lower);
          finalNames.push(name);
        } else {
          finalNames.push(currentUserName);
        }
      }
      resolved.push({
        ...s,
        who: finalNames.join(", "),
        assignees: finalNames,
      });
    }
    return resolved;
  };

  const addContactToQuestion = (idx, name) => {
    setQuestions((prev) => {
      const updated = [...prev];
      const q = updated[idx];
      if (!q.contacts.includes(name)) {
        const id = contacts.find((c) => c.name === name)?.id || name;
        q.contacts = [...q.contacts, name];
        q.contactIds = [...(q.contactIds || []), id];
        q.asked = { ...q.asked, [id]: false };
        q.contactStatus = setContactStatus(q.contactStatus, id, initStatus());
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
      const id = getContactId(q, name);
      const i = q.contacts.indexOf(name);
      q.contacts = q.contacts.filter((r) => r !== name);
      if (i !== -1) {
        if (q.contactIds) {
          q.contactIds = q.contactIds.filter((_, j) => j !== i);
        }
        if (q.answers[id]) {
          delete q.answers[id];
        }
        if (q.asked[id] !== undefined) {
          delete q.asked[id];
        }
        if (q.contactStatus) {
          q.contactStatus = removeContactStatus(q.contactStatus, id);
        }
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

  async function markAsked(idx, ids = []) {
    const text = questions[idx]?.question || "";
    let updatedQuestions = questions;
    const now = new Date().toISOString();
    setQuestions((prev) => {
      const updated = [...prev];
      const q = updated[idx];
      if (q) {
        const targets = ids.length ? ids : getContactIds(q);
        q.contactStatus = q.contactStatus || [];
        q.answers = q.answers || {};
        q.asked = q.asked || {};
        targets.forEach((id) => {
          const current = getContactStatus(q.contactStatus, id);
          const nextStatus = markAskedStatus(current);
          q.contactStatus = setContactStatus(q.contactStatus, id, nextStatus);
          q.asked[id] = true;
          q.answers[id] = {
            ...(q.answers[id] || {}),
            askedAt: now,
            askedBy: currentUserName,
          };
        });
      }
      updatedQuestions = updated;
      return updated;
    });
    if (uid) {
      const q = updatedQuestions[idx];
      const saveQ = { ...q, contacts: getContactIds(q) };
      delete saveQ.idx;
      delete saveQ.contactIds;
      await saveInitiative(uid, initiativeId, { projectQuestions: [saveQ] });
    }
    return text;
  }

  async function unmarkAsked(idx, contactId) {
    let updatedQuestions = questions;
    let removed = { asked: false, answers: false };
    setQuestions((prev) => {
      const updated = [...prev];
      const q = updated[idx];
      if (q) {
        if (q.asked && q.asked[contactId] !== undefined) {
          delete q.asked[contactId];
          removed.asked = true;
        }
        if (q.answers && q.answers[contactId]) {
          delete q.answers[contactId];
          removed.answers = true;
        }
        q.contactStatus = setContactStatus(
          q.contactStatus,
          contactId,
          initStatus(),
        );
      }
      updatedQuestions = updated;
      return updated;
    });
    if (uid) {
      const q = updatedQuestions[idx];
      const saveQ = { ...q, contacts: getContactIds(q) };
      delete saveQ.idx;
      delete saveQ.contactIds;
      if (removed.asked) {
        saveQ.asked = { ...(saveQ.asked || {}), [contactId]: null };
      }
      if (removed.answers) {
        saveQ.answers = { ...(saveQ.answers || {}), [contactId]: null };
      }
      saveQ.contactStatus = q.contactStatus;
      await saveInitiative(uid, initiativeId, { projectQuestions: [saveQ] });
    }
  }

  const openComposer = (idx, contactsList) => {
    try {
      const name = contactsList[0];
      const q = questions[idx];
      const id = getContactId(q, name);
      markAsked(idx, [id]);
      const key = `${idx}-${name}`;
      const saved = localStorage.getItem(`answerDraft_${key}`);
      if (saved) {
        setAnswerDrafts((prev) => ({ ...prev, [key]: saved }));
        setRestoredDraftKey(key);
      } else {
        setRestoredDraftKey(null);
      }
      setActiveComposer({ idx, name, contacts: contactsList });
      setComposerError(null);
    } catch {
      setComposerError(idx);
    }
  };

  const handleComposerContactChange = (newName) => {
    if (!activeComposer) return;
    const { idx, name: prev } = activeComposer;
    if (newName === prev) return;
    const q = questions[idx];
    const prevId = getContactId(q, prev);
    unmarkAsked(idx, prevId);
    const id = getContactId(q, newName);
    markAsked(idx, [id]);
    const key = `${idx}-${newName}`;
    const saved = localStorage.getItem(`answerDraft_${key}`);
    if (saved) {
      setAnswerDrafts((prev) => ({ ...prev, [key]: saved }));
      setRestoredDraftKey(key);
    } else {
      setRestoredDraftKey(null);
    }
    setActiveComposer({ idx, name: newName, contacts: activeComposer.contacts });
  };

  const cancelComposer = (idx, name) => {
    const q = questions[idx];
    const id = getContactId(q, name);
    unmarkAsked(idx, id);
    const key = `${idx}-${name}`;
    setAnswerDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    localStorage.removeItem(`answerDraft_${key}`);
    setActiveComposer(null);
  };

  const handleComposerKeyDown = (e, idx, name) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if ((answerDrafts[`${idx}-${name}`] || "").trim().length >= 2) {
        handleAnswerSubmit(idx, name);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelComposer(idx, name);
    }
  };

  const analyzeDocument = async (name, content) => {
    try {
      const prompt = `You are reviewing a document titled "${name}". Provide a JSON object {"analysis": "...", "suggestions": {"tasks": [], "hypotheses": [], "questions": [], "contacts": []}} where each array contains plain text strings. Document:\n\n${content}`;
      const { text } = await ai.generate(prompt);
      const parsed = JSON.parse(text);
      return {
        analysis: typeof parsed.analysis === "string" ? parsed.analysis : "",
        suggestions: {
          tasks: Array.isArray(parsed.suggestions?.tasks) ? parsed.suggestions.tasks : [],
          hypotheses: Array.isArray(parsed.suggestions?.hypotheses) ? parsed.suggestions.hypotheses : [],
          questions: Array.isArray(parsed.suggestions?.questions) ? parsed.suggestions.questions : [],
          contacts: Array.isArray(parsed.suggestions?.contacts) ? parsed.suggestions.contacts : [],
        },
      };
    } catch (err) {
      console.error("analyzeDocument error", err);
      return { analysis: "", suggestions: { tasks: [], hypotheses: [], questions: [], contacts: [] } };
    }
  };

  const handleDocFiles = async (files) => {
    const newDocs = [];
    for (const file of Array.from(files)) {
      const content = await file.text();
      const analysis = await analyzeDocument(file.name, content);
      newDocs.push({
        name: file.name,
        content,
        addedAt: new Date().toISOString(),
        analysis: analysis.analysis,
        suggestions: analysis.suggestions,
      });
      if (uid && initiativeId) {
        try {
          await triageEvidence(`Title: ${file.name}\n\n${content}`);
        } catch (err) {
          console.error("triageEvidence error", err);
        }
      }
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

  const handlePasteText = async () => {
    setShowDocPaste(true);
    setDocPasteText("");
    setDocPasteTitle("");
  };

  const addPastedDoc = async () => {
    const text = (docPasteText || "").trim();
    const name = (docPasteTitle || `pasted-${documents.length + 1}.txt`).trim();
    if (!text) return;
    const analysis = await analyzeDocument(name, text);
    const doc = {
      name,
      content: text,
      addedAt: new Date().toISOString(),
      analysis: analysis.analysis,
      suggestions: analysis.suggestions,
    };
    if (uid && initiativeId) {
      try {
        await triageEvidence(`Title: ${doc.name}\n\n${doc.content}`);
      } catch (err) {
        console.error("triageEvidence error", err);
      }
    }
    setDocuments((prev) => {
      const updated = [...prev, doc];
      if (uid) {
        saveInitiative(uid, initiativeId, { sourceMaterials: updated });
      }
      return updated;
    });
    setShowDocPaste(false);
    setDocPasteText("");
    setDocPasteTitle("");
  };

  const applyDocSuggestions = async (idx) => {
    const doc = documents[idx];
    if (!doc || !doc.suggestions) return;
    const { tasks: taskTexts = [], hypotheses: hypoTexts = [], questions: questionTexts = [], contacts: contactNames = [] } = doc.suggestions;
    contactNames.forEach((n) => addContactByName(n));
    hypoTexts.forEach((h) => addHypothesis && addHypothesis(h));
    if (questionTexts.length) {
      setQuestions((prev) => {
        const newQs = questionTexts.map((q) => ({
          question: q,
          contacts: [currentUserName],
          answers: {},
          asked: { [currentUserName]: false },
        }));
        const updated = [...prev, ...newQs];
        if (uid) {
          saveInitiative(uid, initiativeId, {
            clarifyingQuestions: updated.map((qq) => ({ question: qq.question })),
            clarifyingContacts: Object.fromEntries(updated.map((qq, i) => [i, qq.contacts])),
            clarifyingAnswers: updated.map((qq) => qq.answers),
            clarifyingAsked: updated.map((qq) => qq.asked),
          });
        }
        return updated;
      });
    }
    if (taskTexts.length && uid && initiativeId) {
      const tasksCollection = collection(db, "users", uid, "initiatives", initiativeId, "tasks");
      for (const t of taskTexts) {
        const tag = await classifyTask(t);
        const priority = getPriority("explore", 0);
        const ref = await addDoc(tasksCollection, {
          name: currentUserName,
          message: t,
          assignees: [currentUserName],
          assignee: currentUserName,
          subType: "general",
          status: "open",
          createdAt: serverTimestamp(),
          tag,
          hypothesisId: null,
          taskType: "explore",
          priority,
        });
        setProjectTasks((prev) => [
          ...prev,
          {
            id: ref.id,
            name: currentUserName,
            message: t,
            assignees: [currentUserName],
            assignee: currentUserName,
            subType: "general",
            status: "open",
            tag,
            hypothesisId: null,
            taskType: "explore",
            priority,
          },
        ]);
      }
    }
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
        contactMap[n].push({ text: q.question, id: q.id });
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

  const [newQuestionHypotheses, setNewQuestionHypotheses] = useState([]);

  const createManualQuestion = async () => {
    const text = (newQuestionText || "").trim();
    if (!uid || !initiativeId || !text) return;
    try {
      const contactStatus = (newQuestionContacts || []).map((id) => ({ contactId: id, ...initStatus() }));
      const newQ = {
        id: `qq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        phase: "General",
        question: text,
        contacts: newQuestionContacts,
        contactStatus,
        hypothesisId: null,
        hypothesisIds: [],
      };
      await saveInitiative(uid, initiativeId, { projectQuestions: [newQ] });
      // Auto-link to hypotheses or category behind the scenes
      try {
        if (Array.isArray(hypotheses) && hypotheses.length) {
          const hypList = hypotheses
            .map((h) => `${h.id}: ${h.statement || h.hypothesis || h.label || ""}`)
            .join("\n");
          const catPrompt = `You are a strategic analyst. Given the hypotheses and the question below, return JSON mapping the question id to either a list of linked hypothesis ids (if it directly investigates one or more hypotheses) or a general category when it does not. Use categories from this set only: ["Logistics","Scope","Stakeholders","Timeline","Risks","Dependencies","Success Criteria","Budget","Tools/Systems","Compliance","Other"].\n\nHypotheses:\n${hypList}\n\nQuestion:\n${newQ.id}: ${newQ.question}\n\nReturn JSON exactly like:\n{"items":[{"id":"${newQ.id}","hypothesisIds":["A"],"category":""}]}`;
          const { text: resp } = await generate(catPrompt);
          const mapping = parseJsonFromText(resp);
          const item = (mapping.items || []).find((m) => m.id === newQ.id);
          const hypothesisIds = Array.isArray(item?.hypothesisIds) ? item.hypothesisIds.filter(Boolean) : [];
          const category = hypothesisIds.length ? undefined : (item?.category || undefined);
          if (hypothesisIds.length || category) {
            await saveInitiative(uid, initiativeId, {
              projectQuestions: [{ id: newQ.id, hypothesisIds, hypothesisId: hypothesisIds[0] || null, category }],
            });
            // Reflect in local state too
            setQuestions((prev) => prev.map((qq) => (
              qq.id === newQ.id ? { ...qq, hypothesisIds, hypothesisId: hypothesisIds[0] || null, category } : qq
            )));
          }
        }
      } catch (linkErr) {
        console.warn("Auto-linking question to hypotheses failed", linkErr);
      }
      setQuestions((prev) => [
        ...prev,
        {
          ...newQ,
          idx: prev.length,
          contacts: (newQuestionContacts || []).map((cid) => contacts.find((c) => c.id === cid)?.name || cid),
          contactIds: newQuestionContacts,
          asked: {},
          answers: {},
        },
      ]);
      setToast("Question added.");
      setShowNewQuestion(false);
      setNewQuestionText("");
      setNewQuestionContacts([]);
      setWhoInput("");
      setActive("questions");
    } catch (err) {
      console.error("createManualQuestion error", err);
    }
  };

  const addWho = () => {
    const name = (whoInput || "").trim();
    if (!name) return;
    const existing = contacts.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (!newQuestionContacts.includes(existing.id)) {
        setNewQuestionContacts((prev) => [...prev, existing.id]);
      }
      setWhoInput("");
      return;
    }
    // Create a minimal new contact entry
    const id = crypto.randomUUID();
    const color = colorPalette[(contacts.length || 0) % colorPalette.length];
    const newContact = { id, name, jobTitle: "", profile: "", info: { email: "", slack: "", teams: "" }, color };
    const updated = [...contacts, newContact];
    setContacts(updated);
    setNewQuestionContacts((prev) => [...prev, id]);
    setWhoInput("");
    if (uid) {
      saveInitiative(uid, initiativeId, {
        keyContacts: updated.map(({ id, name, jobTitle, profile, info }) => ({ id, name, jobTitle, profile, info })),
      });
    }
  };

  const removeWho = (id) => {
    setNewQuestionContacts((prev) => prev.filter((x) => x !== id));
  };

  const createManualTask = async () => {
    const text = (newTaskText || "").trim();
    if (!uid || !initiativeId || !text) return;
    try {
      const tasksCol = collection(db, "users", uid, "initiatives", initiativeId, "tasks");
      const subType = newTaskType || "general";
      const hypothesisIds = Array.isArray(newTaskHypotheses) ? newTaskHypotheses : [];
      const hypothesisId = hypothesisIds[0] || null;
      const priority = getPriority("explore", 0);
      await addDoc(tasksCol, {
        name: currentUserName,
        message: text,
        assignees: [currentUserName],
        assignee: currentUserName,
        subType,
        status: "open",
        createdAt: serverTimestamp(),
        tag: subType,
        hypothesisId,
        hypothesisIds,
        taskType: "explore",
        priority,
      });
      setToast("Task added.");
      setShowNewTask(false);
      setNewTaskText("");
      setNewTaskType("general");
      setNewTaskHypotheses([]);
      setActive("tasks");
    } catch (err) {
      console.error("createManualTask error", err);
    }
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
      jobTitle: contact.jobTitle || "",
      email: contact.info?.email || "",
    });
  };

  const saveEditContact = () => {
    if (!editData) return;
    const { original, name, jobTitle, email } = editData;
    const idx = contacts.findIndex((c) => c.name === original);
    if (idx === -1) return;
    const updatedContacts = contacts.map((c, i) =>
      i === idx
        ? { ...c, name, jobTitle, info: { ...c.info, email } }
        : c
    );
    const updatedQuestions = questions.map((q) => {
      const newContacts = q.contacts.map((n) => (n === original ? name : n));
      return { ...q, contacts: newContacts };
    });
    setContacts(updatedContacts);
    setQuestions(updatedQuestions);
    if (uid) {
      saveInitiative(uid, initiativeId, {
        keyContacts: updatedContacts.map(
          ({ id, name, jobTitle, profile, info }) => ({
            id,
            name,
            jobTitle,
            profile,
            info,
          })
        ),
        clarifyingContacts: Object.fromEntries(
          updatedQuestions.map((qq, i) => [i, qq.contacts])
        ),
        clarifyingAnswers: updatedQuestions.map((qq) => qq.answers),
        clarifyingAsked: updatedQuestions.map((qq) => qq.asked),
      });
      // Update global contact record (fire-and-forget)
      saveUserContact(uid, { name, jobTitle, info: { email } }).catch((e) =>
        console.warn("Failed to update global contact", e)
      );
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
    const toAskNames = [];
    const toAskIds = [];
    const askedNames = [];
    const askedIds = [];
    const answeredNames = [];
    const answeredIds = [];
    const ids = getContactIds(q);
    ids.forEach((id, i) => {
      const name = q.contacts?.[i] || id;
      const status = getContactStatus(q.contactStatus, id);
      const cur = (status?.currentStatus || "").toLowerCase();
      if (cur === "answered") {
        answeredNames.push(name);
        answeredIds.push(id);
      } else if (cur === "asked") {
        askedNames.push(name);
        askedIds.push(id);
      } else {
        toAskNames.push(name);
        toAskIds.push(id);
      }
    });
    if (toAskNames.length || ids.length === 0) {
      items.push({
        ...q,
        idx,
        contacts: toAskNames,
        contactIds: toAskIds,
        status: "toask",
      });
    }
    if (askedNames.length) {
      items.push({
        ...q,
        idx,
        contacts: askedNames,
        contactIds: askedIds,
        status: "asked",
      });
    }
    if (answeredNames.length) {
      items.push({
        ...q,
        idx,
        contacts: answeredNames,
        contactIds: answeredIds,
        status: "answered",
      });
    }
  });

  let filtered = items.filter(
    (q) =>
      (!contactFilter || q.contactIds.includes(contactFilter)) &&
      (!statusFilter || q.status === statusFilter)
  );
  sortUnassignedFirst(filtered);

  let grouped = { All: filtered };
  if (groupBy === "contact") {
    grouped = {};
    filtered.forEach((q) => {
      const names = q.contacts.length ? q.contacts : ["Unassigned"];
      names.forEach((n, i) => {
        const id = q.contactIds?.[i];
        const qCopy = { ...q, contacts: [n], contactIds: id ? [id] : [] };
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
      const roles = q.contactIds && q.contactIds.length
        ? q.contactIds.map(
            (id) => contacts.find((c) => c.id === id)?.jobTitle || "No Role",
          )
        : ["Unassigned"];
      const uniqueRoles = Array.from(new Set(roles));
      uniqueRoles.forEach((r) => {
        const label = r && r !== "" ? r : "No Role";
        const namesForRole = [];
        const idsForRole = [];
        q.contactIds.forEach((id, i) => {
          const role = contacts.find((c) => c.id === id)?.jobTitle || "No Role";
          if (role === r) {
            namesForRole.push(q.contacts[i]);
            idsForRole.push(id);
          }
        });
        const qCopy = { ...q, contacts: namesForRole, contactIds: idsForRole };
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
    <div className="discovery-hub">
      {toast && <div className="toast">{toast}</div>}
      <div className="main-content">
        {active === "overview" ? (
          <ProjectOverview
            uid={uid}
            initiativeId={initiativeId}
            stage={projectStage}
            tasks={projectTasks}
            questions={questions}
            hypotheses={hypotheses}
            documents={documents}
          />
        ) : active === "documents" ? (
          <div className="document-section">
            {documents.length > 0 && (
              <button
                className="generator-button summarize-all"
                onClick={handleSummarizeAll}
              >
                Summarize All Files
              </button>
            )}
            <button
              className="generator-button paste-text"
              onClick={handlePasteText}
            >
              Paste Text
            </button>
            {showDocPaste && (
              <div className="glass-card" style={{ marginTop: 12 }}>
                <label className="block text-sm font-medium" style={{ marginBottom: 6 }}>Pasted Content</label>
                <textarea
                  className="generator-input"
                  rows={10}
                  placeholder="Paste or type your document text here"
                  value={docPasteText}
                  onChange={(e) => setDocPasteText(e.target.value)}
                />
                <label className="block text-sm font-medium" style={{ marginTop: 8 }}>Document Title</label>
                <input
                  className="generator-input"
                  placeholder="Enter a title"
                  value={docPasteTitle}
                  onChange={(e) => setDocPasteTitle(e.target.value)}
                />
                <div className="button-row" style={{ marginTop: 8 }}>
                  <button className="generator-button" onClick={() => { setShowDocPaste(false); setDocPasteText(""); setDocPasteTitle(""); }}>Cancel</button>
                  <button className="generator-button next-button" onClick={addPastedDoc} disabled={!docPasteText.trim()}>Add Document</button>
                </div>
              </div>
            )}
            <ul className="document-list">
              {documents.map((doc, idx) => (
                <li key={idx} className="document-item">
                  <div className="doc-header">
                    {doc.name}
                    <span className="doc-actions">
                      <button onClick={() => handleSummarize(doc.content)}>
                        Summarize
                      </button>
                      {(doc.suggestions?.tasks?.length ||
                        doc.suggestions?.hypotheses?.length ||
                        doc.suggestions?.questions?.length ||
                        doc.suggestions?.contacts?.length) && (
                        <button onClick={() => applyDocSuggestions(idx)}>
                          Apply Suggestions
                        </button>
                      )}
                      <button onClick={() => removeDocument(idx)}>Remove</button>
                    </span>
                  </div>
                  {doc.analysis && (
                    <p className="doc-analysis">{doc.analysis}</p>
                  )}
                  {doc.suggestions && (
                    <ul className="doc-suggestions">
                      {doc.suggestions.tasks?.length > 0 && (
                        <li>{`Tasks: ${doc.suggestions.tasks.join(", ")}`}</li>
                      )}
                      {doc.suggestions.hypotheses?.length > 0 && (
                        <li>{`Hypotheses: ${doc.suggestions.hypotheses.join(", ")}`}</li>
                      )}
                      {doc.suggestions.questions?.length > 0 && (
                        <li>{`Questions: ${doc.suggestions.questions.join(", ")}`}</li>
                      )}
                      {doc.suggestions.contacts?.length > 0 && (
                        <li>{`Contacts: ${doc.suggestions.contacts.join(", ")}`}</li>
                      )}
                    </ul>
                  )}
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
              emailProvider={emailProvider}
              onHistoryChange={setStatusHistory}
              initiativeId={initiativeId}
              businessGoal={businessGoal}
            />
          )
        // --- MODIFICATION: Revamped project tasks view with AI features ---
        ) : active === "tasks" ? (
  <div className="flex w-full flex-col gap-4">
    {/* Header: Title on the left, buttons on the right */}
    <div className="tasks-header">
      <h2 className="tasks-title">Project Tasks</h2>

      <div className="task-actions">
    <button
      type="button"
      className="generator-button"
      onClick={() => setShowNewTask(true)}
    >
      Add Task
    </button>
    <button
      type="button"
      className="appearance-none flex w-36 items-center justify-center gap-2 rounded-lg px-4 py-2 font-semibold text-white shadow
                 !bg-gradient-to-r !from-indigo-500 !to-purple-600 hover:brightness-110 disabled:opacity-60"
      disabled={isPrioritizing}
      aria-busy={isPrioritizing}
      onClick={startPrioritize}
    >
      <Zap className="h-5 w-5" />
      {isPrioritizing ? "Prioritizing..." : "Prioritize"}
    </button>

    <button
      type="button"
      className="appearance-none flex w-36 items-center justify-center gap-2 rounded-lg px-4 py-2 font-semibold text-white shadow
                 !bg-gradient-to-r !from-purple-600 !to-fuchsia-600 hover:brightness-110"
      onClick={startSynergy}
    >
      <Layers className="h-5 w-5" />
      Synergize
    </button>
  </div>
</div>

  {taskStatusFilter === "all" && (
    <div className="counter-row">
      <div className="initiative-card counter-card">
        <div className="text-sm opacity-80">Open Tasks</div>
        <div className="text-3xl font-bold">{taskCounts.open}</div>
      </div>
      <div className="initiative-card counter-card">
        <div className="text-sm opacity-80">Scheduled Tasks</div>
        <div className="text-3xl font-bold">{taskCounts.scheduled}</div>
      </div>
      <div className="initiative-card counter-card">
        <div className="text-sm opacity-80">Completed Tasks</div>
        <div className="text-3xl font-bold">{taskCounts.completed}</div>
      </div>
    </div>
  )}

    {/* Filters */}
    <div className="flex flex-wrap gap-2">
      <select
        value={taskProjectFilter}
        onChange={(e) => setTaskProjectFilter(e.target.value)}
        className="rounded-md bg-gray-700 px-3 py-1 text-gray-300"
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
        className="rounded-md bg-gray-700 px-3 py-1 text-gray-300"
      >
        <option value="all">All Contacts</option>
        {taskContacts.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <select
        value={taskTypeFilter}
        onChange={(e) => setTaskTypeFilter(e.target.value)}
        className="rounded-md bg-gray-700 px-3 py-1 text-gray-300"
      >
        <option value="all">All Types</option>
        {taskTypeOptions.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </div>

    {/* Task List */}
    {prioritized ? (
      <div className="space-y-4">
        {prioritized.map((t, i) => (
          <div key={t.id} className="flex items-start gap-2">
            <span className="task-rank">{i + 1}.</span>
            {renderTaskCard(
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
                  onClick={() => openEditModal(t)}
                >
                  Edit
                </button>
                {(t.subType === "email" || t.tag === "email") && (
                  <button
                    className="generator-button"
                    onClick={() => draftTaskEmail(t)}
                  >
                    Draft Email
                  </button>
                )}
                {(t.subType === "meeting" || t.tag === "meeting") && (
                  <button
                    className="generator-button"
                    onClick={() => handleScheduleTask(t.id)}
                  >
                    Schedule
                  </button>
                )}
                <button
                  className="generator-button"
                  onClick={() => openCompleteModal(t)}
                >
                  Complete
                </button>
                <button
                  className="generator-button"
                  onClick={() => handleDeleteTask(t.id)}
                >
                  Delete
                </button>
              </>
            )}
          </div>
        ))}
        <button className="generator-button" onClick={savePrioritized}>
          Save Order
        </button>
      </div>
    ) : (
      <div className="space-y-4">
        {Object.entries(tasksByAssignee)
          .sort((a, b) =>
            a[0] === "My Tasks" ? -1 : b[0] === "My Tasks" ? 1 : 0
          )
          .map(([assignee, tasks]) => (
            <div key={assignee} className="initiative-card space-y-2">
              <h3 className="font-semibold">{assignee}</h3>
              {tasks.map((t) =>
                renderTaskCard(
                  t,
                  <>
                    <button
                      className="generator-button"
                      onClick={() => openEditModal(t)}
                    >
                      Edit
                    </button>
                    {(t.subType === "email" || t.tag === "email") && (
                      <button
                        className="generator-button"
                        onClick={() => draftTaskEmail(t)}
                      >
                        Draft Email
                      </button>
                    )}
                    {(t.subType === "meeting" || t.tag === "meeting") && (
                      <button
                        className="generator-button"
                        onClick={() => handleScheduleTask(t.id)}
                      >
                        Schedule
                      </button>
                    )}
                    <button
                      className="generator-button"
                      onClick={() => openCompleteModal(t)}
                    >
                      Complete
                    </button>
                    <button
                      className="generator-button"
                      onClick={() => handleDeleteTask(t.id)}
                    >
                      Delete
                    </button>
                  </>
                )
              )}
            </div>
          ))}
        {displayedTasks.length === 0 && (
          <p className="text-gray-400">Looks like you are all caught up!</p>
        )}
      </div>
    )}

    {suggestedQuestions.length > 0 && (
      <div className="initiative-card">
        <h3>Suggested Questions</h3>
        {suggestedQuestions.map((q) => (
          <div key={q.id} className="flex items-center justify-between border-b border-gray-700 py-2">
            <div className="font-medium">{q.question}</div>
            <div className="flex gap-2">
              <button className="generator-button" onClick={() => acceptSuggestedQuestion(q)}>Accept</button>
              <button className="generator-button" onClick={() => rejectSuggestedQuestion(q)}>Reject</button>
            </div>
          </div>
        ))}
      </div>
    )}

    {suggestedTasks.length > 0 && (
      <div className="initiative-card">
        <h3>Suggested Tasks</h3>
        {suggestedTasks.map((t) => (
          <div key={t.id} className="flex items-center justify-between border-b border-gray-700 py-2">
            <div>
              <div className="font-medium">{t.message}</div>
              <div className="text-sm text-gray-400">
                {t.subType}
                {t.hypothesisIds && t.hypothesisIds.length
                  ? ` • Hypotheses ${t.hypothesisIds.join(", ")}`
                  : t.hypothesisId
                  ? ` • Hypothesis ${t.hypothesisId}`
                  : ""}
              </div>
            </div>
            <div className="flex gap-2">
              <button className="generator-button" onClick={() => acceptSuggestedTask(t)}>Accept</button>
              <button className="generator-button" onClick={() => rejectSuggestedTask(t)}>Reject</button>
            </div>
          </div>
        ))}
      </div>
    )}

    {synergyQueue.length > 0 &&
      createPortal(
        <div className="modal-overlay">
          <div className="initiative-card modal-content">
            <h3>Synergize Tasks</h3>
            <h4>{synergyQueue[synergyIndex].header}</h4>
            <ul className="mb-4 list-inside list-disc text-sm">
              {synergyQueue[synergyIndex].bullets.map((m, idx) => (
                <li key={idx}>{m}</li>
              ))}
            </ul>
            <div className="modal-actions">
              <button className="generator-button" onClick={nextSynergy}>
                Skip
              </button>
              <button
                className="generator-button"
                onClick={() =>
                  handleSynergize(
                    synergyQueue[synergyIndex].bundle,
                    synergyQueue[synergyIndex].header,
                    synergyQueue[synergyIndex].bullets
                  )
                }
              >
                Approve
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    {completionModal &&
      createPortal(
        <div className="modal-overlay">
          <div className="initiative-card modal-content space-y-4">
            <h3>Complete Task</h3>
            <p>
              {(() => {
                const type =
                  completionModal.task.subType || completionModal.task.tag || "";
                if (type === "meeting")
                  return "Do you want to include a transcript or any meeting notes?";
                if (type === "email") return "What was the response?";
                if (type === "research") return "What were your findings?";
                return "Add any notes about completing this task.";
              })()}
            </p>
            <textarea
              className="w-full rounded-md border px-2 py-1"
              value={completionModal.notes}
              onChange={(e) =>
                setCompletionModal((prev) => ({ ...prev, notes: e.target.value }))
              }
            />
            {(completionModal.task.subType === "meeting" ||
              completionModal.task.tag === "meeting") && (
              <input type="file" onChange={handleCompletionFile} />
            )}
            <div className="modal-actions">
              <button
                className="generator-button"
                onClick={() => setCompletionModal(null)}
              >
                Cancel
              </button>
              <button className="generator-button" onClick={submitCompletion}>
                Submit
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    {answerPanel &&
      createPortal(
        <AnswerSlideOver
          question={answerPanel.question}
          id={answerPanel.id}
          idx={answerPanel.idx}
          allContacts={contacts}
          currentUserName={currentUserName}
          updateAnswer={updateAnswer}
          analyzeAnswer={analyzeAnswer}
          createTasks={createTasksFromAnalysis}
          addContact={addContact}
          onClose={() => setAnswerPanel(null)}
          setToast={setToast}
          setAnalyzing={setAnalyzing}
        />,
        document.body
      )}
    
    {qaModal &&
      createPortal(
        <div className="modal-overlay" onClick={() => setQaModal(null)}>
          <div
            className="initiative-card modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{`Q${qaModal.qIdx + 1}`}</h3>
            <p>{questions[qaModal.qIdx]?.question}</p>
            {qaModal.aIdx !== null && (
              <>
                <h4>{`A${qaModal.aIdx + 1}`}</h4>
                <p>
                  {questions[qaModal.qIdx]?.answers?.[qaModal.aIdx] || ""}
                </p>
              </>
            )}
            <div className="modal-actions">
              <button
                className="generator-button"
                onClick={() => setQaModal(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    {editTask &&
      createPortal(
        <div className="modal-overlay">
          <div className="initiative-card modal-content space-y-4">
            <h3>Edit Task</h3>
            <div>
              <label className="block text-sm font-medium">Contacts</label>
              <select
                multiple
                value={editTask.assignees}
                onChange={(e) =>
                  updateEditTaskField(
                    "assignees",
                    Array.from(e.target.selectedOptions, (o) => o.value)
                  )
                }
                className="w-full rounded-md border px-2 py-1"
              >
                <option value={currentUserName}>My Tasks</option>
                {contacts.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium">Type</label>
              <select
                value={editTask.subType}
                onChange={(e) => updateEditTaskField("subType", e.target.value)}
                className="w-full rounded-md border px-2 py-1"
              >
                <option value="task">task</option>
                <option value="meeting">meeting</option>
                <option value="communication">communication</option>
                <option value="research">research</option>
                <option value="instructional-design">instructional-design</option>
                <option value="other">other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium">Hypothesis</label>
              <select
                value={editTask.hypothesisId}
                onChange={(e) => updateEditTaskField("hypothesisId", e.target.value)}
                className="w-full rounded-md border px-2 py-1"
              >
                <option value="">None</option>
                {hypotheses.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.statement || h.hypothesis || h.text || h.label || h.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium">Task Type</label>
              <select
                value={editTask.taskType}
                onChange={(e) => updateEditTaskField("taskType", e.target.value)}
                className="w-full rounded-md border px-2 py-1"
              >
                <option value="validate">Validate</option>
                <option value="explore">Explore</option>
                <option value="refute">Refute</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium">Subtasks</label>
              {editTask.subTasks.map((st, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    className="flex-1 rounded-md border px-2 py-1"
                    value={st.text}
                    onChange={(e) => updateEditSubTask(idx, e.target.value)}
                  />
                  <button
                    className="generator-button"
                    onClick={() => removeEditSubTask(idx)}
                  >
                    X
                  </button>
                </div>
              ))}
              <button className="generator-button" onClick={addEditSubTask}>
                Add Subtask
              </button>
            </div>
            <div className="modal-actions">
              <button
                className="generator-button"
                onClick={() => setEditTask(null)}
              >
                Cancel
              </button>
              <button className="generator-button" onClick={saveEditTask}>
                Save
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
  </div>
        ) : active === "actionDashboard" ? (
          <ActionDashboard />
        ) : (
          <>
            <div className="mb-3">
              <p className="mb-0 text-sm text-gray-500">
                Click the <strong>Ask</strong> button, choose the responder, and enter
                answer text to receive analysis and suggested tasks.
              </p>
            </div>
            <div className="filter-bar">
              <label>
                Contact:
                <select
                  value={contactFilter}
                  onChange={(e) => setContactFilter(e.target.value)}
                >
                  <option value="">All</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
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
              <button className="generator-button" onClick={() => setShowNewQuestion(true)}>
                Add Question
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
            {statusFilter === "" && (
              <div className="counter-row mb-4">
                <div className="initiative-card counter-card">
                  <div className="text-sm opacity-80">Open Questions</div>
                  <div className="text-3xl font-bold">{questionCounts.open}</div>
                </div>
                <div className="initiative-card counter-card">
                  <div className="text-sm opacity-80">Answered Questions</div>
                  <div className="text-3xl font-bold">{questionCounts.answered}</div>
                </div>
              </div>
            )}
            {Object.entries(grouped).map(([grp, items]) => (
              <div key={grp} className="group-section">
                {groupBy && <h3>{grp}</h3>}
                {items.map((q) => {
                  const selKey = `${q.idx}|${q.status}|${q.contacts.join(',')}`;
                  return (
                    <div
                      key={selKey}
                      id={`question-${q.idx}`}
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
                      <div className="question-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <div className="qa-left" style={{ display: 'flex', gap: '8px' }}>
                          {q.status === 'toask' && (
                            <button
                              className="generator-button"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                              onClick={() => markAsked(q.idx)}
                            >
                              Mark Asked
                            </button>
                          )}
                          <button
                            type="button"
                            className="generator-button"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                            onClick={(e) => handleAnswerClick(e, q)}
                          >
                            Answer
                          </button>
                        </div>
                        <div className="qa-right" style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                          <button
                            className="icon-button"
                            title="Draft Email"
                            aria-label="Draft Email"
                            onClick={() => draftEmail(q)}
                            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z"/><path d="m22 6-10 7L2 6"/></svg>
                          </button>
                          <button
                            className="icon-button"
                            title="Edit Question"
                            aria-label="Edit Question"
                            onClick={() => editQuestion(q.idx)}
                            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>
                          </button>
                          <button
                            className="icon-button"
                            title="Delete Question"
                            aria-label="Delete Question"
                            onClick={() => deleteQuestion(q.idx)}
                            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>
                          </button>
                        </div>
                      </div>
                      {composerError === q.idx && (
                        <div className="composer-error">
                          Failed to open composer.{' '}
                          <a
                            onClick={() => setStatusFilter('asked')}
                          >
                            Open in Asked tab
                          </a>
                        </div>
                      )}
                      {q.status !== "toask" &&
                        q.contacts.map((name, idxAns) => {
                          const id = getContactId(q, name);
                          const status = (q.contactStatus || []).find((cs) => cs.contactId === id) || null;
                          const answersArr = Array.isArray(status?.answers) ? status.answers : [];
                          if (!answersArr.length) return null; // no answers: hide entirely (including name)
                          const last = answersArr[answersArr.length - 1];
                          const preview = (last.text || "").split(/(?<=\.)\s+/).slice(0, 1).join(" ").slice(0, 200);
                          return (
                            <div
                              key={name}
                              id={`answer-${q.idx}-${idxAns}`}
                              className="answer-block"
                            >
                              <div className="text-xs text-gray-300 mb-1">
                                <span className="inline-block px-2 py-0.5 mr-2 rounded bg-gray-700">
                                  {last.channel ? last.channel : "manual"}
                                </span>
                                {last.answeredBy && <span className="mr-2">by {last.answeredBy}</span>}
                                {last.answeredAt && (
                                  <span className="mr-2">{new Date(last.answeredAt).toLocaleString()}</span>
                                )}
                                {preview && <span className="block opacity-80">{preview}</span>}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  );
                })}
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-gray-400">Looks like you are all caught up!</p>
            )}
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
              const q = questions[menu.idx];
              const id = getContactId(q, menu.name);
              await markAsked(menu.idx, [id]);
              setMenu(null);
            }}
          >
            Ask
          </li>
          <li
            onClick={() => {
              const id = contacts.find((c) => c.name === menu.name)?.id || menu.name;
              setContactFilter(id);
              setMenu(null);
            }}
          >
            Filter
          </li>
            <li
              onClick={() => {
                const role =
                  contacts.find((c) => c.name === menu.name)?.jobTitle || "No Role";
                setGroupBy("role");
                setFocusRole(role);
                setMenu(null);
              }}
            >
              Group
            </li>
        </ul>
        )}
            {answerPanel &&
      createPortal(
        <AnswerSlideOver
          question={answerPanel.question}
          id={answerPanel.id}
          idx={answerPanel.idx}
          allContacts={contacts}
          currentUserName={currentUserName}
          updateAnswer={updateAnswer}
          analyzeAnswer={analyzeAnswer}
          createTasks={createTasksFromAnalysis}
          addContact={addContact}
          onClose={() => setAnswerPanel(null)}
          setToast={setToast}
          setAnalyzing={setAnalyzing}
        />,
        document.body
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
            <h3>{analysisModal.name}&apos;s Answer Analysis</h3>
            {analysisModal.loading ? (
              <>
                <p>{analysisModal.progress}</p>
                <div className="spinner small"></div>
              </>
            ) : (
              <>
                <p>Question has been moved to answered.</p>
                {analysisModal.analysis && (
                  <p>
                    {typeof analysisModal.analysis === "string"
                      ? analysisModal.analysis
                      : JSON.stringify(analysisModal.analysis)}
                  </p>
                )}
                {analysisModal.suggestions &&
                  analysisModal.suggestions.length > 0 && (
                    <>
                      <p>Suggested tasks:</p>
                      <label>
                        <input
                          type="checkbox"
                          checked={
                            analysisModal.selected.length ===
                              analysisModal.suggestions.length &&
                            analysisModal.suggestions.length > 0
                          }
                          onChange={(e) =>
                            setAnalysisModal((prev) => ({
                              ...prev,
                              selected: e.target.checked
                                ? prev.suggestions
                                : [],
                            }))
                          }
                        />
                        Select All
                      </label>
                      <ul>
                        {analysisModal.suggestions.map((s, i) => {
                          const whoDisplay = Array.isArray(s.assignees)
                            ? s.assignees.join(", ")
                            : s.who;
                          return (
                            <li key={i}>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={analysisModal.selected.some(
                                    (item) => item.text === s.text
                                  )}
                                  onChange={() => toggleSuggestion(s)}
                                />
                                {suggestionIcon(s.category)} {`[${s.category}] ${s.text}`}
                                {whoDisplay ? ` (${whoDisplay})` : ""}
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                <div className="modal-actions">
                  {analysisModal.messageId && (
                    <a
                      className="generator-button"
                      href={`/discovery?initiativeId=${initiativeId}${analysisModal.idx != null && questions[analysisModal.idx]?.id ? `&questionId=${questions[analysisModal.idx].id}` : ""}&messageId=${analysisModal.messageId}&qa=1`}
                      onClick={() => setAnalysisModal(null)}
                    >
                      View Analysis
                    </a>
                  )}
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
                        const resolved = await resolveSuggestionsForContacts(
                          analysisModal.selected
                        );
                        const added = await createTasksFromAnalysis(
                          analysisModal.idx,
                          analysisModal.name,
                          resolved
                        );
                        if (added > 0) {
                          setToast(`Added ${added} tasks.`);
                        }
                        setAnalysisModal(null);
                      }}
                    >
                      {`Add ${analysisModal.selected.length} tasks`}
                    </button>
                  )}
                  <button
                    className="generator-button"
                    onClick={() => setAnalysisModal(null)}
                  >
                    Close
                  </button>
                </div>
              </>
            )}
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
            emailProvider={emailProvider}
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
            emailProvider={emailProvider}
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
                      {`Send with ${providerLabel}`}
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
              Job Title:
              <input
                className="generator-input"
                value={editData.jobTitle}
                onChange={(e) =>
                  setEditData((d) => ({ ...d, jobTitle: e.target.value }))
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
      {showNewQuestion &&
        createPortal(
          <div className="slide-over-overlay" onClick={closeNewQuestion}>
            <div className="slide-over-panel" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center mb-2">
                <div className="font-semibold">Add Question</div>
                <div className="flex-1" />
                <button className="text-white" type="button" onClick={closeNewQuestion}>Close</button>
              </div>
              <textarea
                className="generator-input w-full"
                rows={4}
                placeholder="What do you need to ask?"
                value={newQuestionText}
                onChange={(e) => setNewQuestionText(e.target.value)}
                autoFocus
              />
              <div className="mt-2">
                <label className="block text-sm font-medium">Who to ask (optional)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="generator-input"
                    list="addq-contact-suggestions"
                    placeholder="Type a name and press Enter"
                    value={whoInput}
                    onChange={(e) => setWhoInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); addWho(); }
                    }}
                    style={{ flex: 1 }}
                  />
                  <button className="generator-button" type="button" onClick={addWho}>Add</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {newQuestionContacts.map((cid) => {
                    const n = contacts.find((c) => c.id === cid)?.name || cid;
                    return (
                      <span key={cid} className="glass-card" style={{ padding: '4px 8px', borderRadius: 9999 }}>
                        {n}
                        <button type="button" className="remove-file" onClick={() => removeWho(cid)} style={{ marginLeft: 6 }}>×</button>
                      </span>
                    );
                  })}
                </div>
                <datalist id="addq-contact-suggestions">
                  {contacts.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </div>
              {/* Hypotheses links are auto-detected after creation */}
              <div className="modal-actions mt-2">
                <button className="generator-button" onClick={createManualQuestion} disabled={!newQuestionText.trim()}>Add</button>
              </div>
            </div>
          </div>,
          document.body
        )}
      {showNewTask &&
        createPortal(
          <div className="slide-over-overlay" onClick={closeNewTask}>
            <div className="slide-over-panel" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center mb-2">
                <div className="font-semibold">Add Task</div>
                <div className="flex-1" />
                <button className="text-white" type="button" onClick={closeNewTask}>Close</button>
              </div>
              <textarea
                className="generator-input w-full"
                rows={4}
                placeholder="Describe the task to add"
                value={newTaskText}
                onChange={(e) => setNewTaskText(e.target.value)}
                autoFocus
              />
              <div className="mt-2 w-full">
                <label className="block text-sm font-medium mb-1">Type</label>
                <select className="generator-input w-full" value={newTaskType} onChange={(e) => setNewTaskType(e.target.value)}>
                    <option value="general">general</option>
                    <option value="meeting">meeting</option>
                    <option value="email">email</option>
                    <option value="research">research</option>
                    <option value="instructional-design">instructional-design</option>
                    <option value="other">other</option>
                  </select>
              </div>
              <div className="mt-2 w-full">
                <label className="block text-sm font-medium mb-1">Link to hypotheses (optional)</label>
                <select
                  multiple
                  className="generator-input w-full"
                  value={newTaskHypotheses}
                  onChange={(e) => setNewTaskHypotheses(Array.from(e.target.selectedOptions, (o) => o.value))}
                >
                  {hypotheses.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.statement || h.hypothesis || h.label || h.id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="modal-actions mt-2">
                <button className="generator-button" onClick={createManualTask} disabled={!newTaskText.trim()}>Add</button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default DiscoveryHub;
