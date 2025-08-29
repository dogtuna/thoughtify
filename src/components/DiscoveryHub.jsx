import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSearchParams, useNavigate } from "react-router-dom";
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
import { getToken as getAppCheckToken } from "firebase/app-check";
import { loadInitiative, saveInitiative } from "../utils/initiatives";
import ai, { generate } from "../ai";
import { useInquiryMap } from "../context/InquiryMapContext.jsx";
import {
  classifyTask,
  dedupeByMessage,
  normalizeAssigneeName,
} from "../utils/taskUtils";
import { getPriority } from "../utils/priorityMatrix";
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

const normalizeContacts = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : parseContactNames(value);
};

const DiscoveryHub = () => {
  const [searchParams] = useSearchParams();
  const initiativeId = searchParams.get("initiativeId");
  const [questions, setQuestions] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [projectTasks, setProjectTasks] = useState([]);
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
  const { triageEvidence, loadHypotheses, hypotheses } = useInquiryMap();
  const [businessGoal, setBusinessGoal] = useState("");
  const [audienceProfile, setAudienceProfile] = useState("");
  const [projectConstraints, setProjectConstraints] = useState("");
  const [viewingStatus] = useState("");
  const setStatusHistory = () => {};
  const [qaModal, setQaModal] = useState(null);
  const navigate = useNavigate();
  const emailConnected = !!emailProvider;
  const providerLabel =
    emailProvider === "smtp"
      ? "SMTP"
      : emailProvider
      ? emailProvider.charAt(0).toUpperCase() + emailProvider.slice(1)
      : "Email";

  const handleAnswerClick = (e, q) => {
    // Prevent the card's click handlers from firing and grab the
    // authoritative question object before opening the slide-over.
    e.preventDefault();
    e.stopPropagation();
    const original = questions[q.idx] || q;
    setAnswerPanel({ idx: q.idx, question: original });
  };

  useEffect(() => {
    const section = searchParams.get("section");
    if (section) {
      setActive(section);
    } else if (searchParams.has("actionDashboard")) {
      setActive("actionDashboard");
    }
    const status = searchParams.get("status");
    if (status) {
      setStatusFilter(status);
    }
  }, [searchParams]);

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
        setAnswerDrafts((prev) => ({
          ...prev,
          [key]: localStorage.getItem(`answerDraft_${key}`) || "",
        }));
        markAsked(idx, [name]);
        setActiveComposer({ idx, name, contacts: questions[idx].contacts });
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
      if (q.contacts.length === 0) {
        open++;
      } else {
        q.contacts.forEach((name) => {
          const ans = q.answers?.[name];
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

  const generateTaskEmail = (recipients, task) => {
    const userName =
      auth.currentUser?.displayName || auth.currentUser?.email || "";
    const toNames = recipients.join(", ");
    const subject = `Regarding: ${task.message}`;
    const body = `Hi ${toNames},\n\n${task.message}\n\nBest regards,\n${userName}`;
    return { subject, body, recipients, taskIds: [task.id] };
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
    const handleSelection = (chosen) => {
      if (!chosen.length) return;
      const drafts = chosen.map((name) =>
        generateTaskEmail([name], task)
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
        provider: emailProvider,
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

  const analyzeAnswer = async (question, text, respondent) => {
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

      const existingTasks = projectTasks.map((t) => t.message).join("\n");
      if (existingTasks) contextPieces.push(`Existing Tasks:\n${existingTasks}`);
      const existingQuestions = questions.map((q) => q.question).join("\n");
      if (existingQuestions)
        contextPieces.push(`Existing Questions:\n${existingQuestions}`);

      const projectContext = contextPieces.join("\n\n");
      const taskSet = new Set(projectTasks.map((t) => t.message.toLowerCase()));
      const questionSet = new Set(questions.map((q) => q.question.toLowerCase()));

      const hypothesisList = hypotheses
        .map((h) => `${h.id}: ${h.statement || h.text || h.label || h.id}`)
        .join("\n");

      const prompt = `You are an expert Instructional Designer and Performance Consultant. You are analyzing ${respondent}'s answer to a specific discovery question. Your goal is to understand what this answer means for the training project and to determine follow-up actions.

Project Context:
${projectContext}

Existing Hypotheses:
${hypothesisList}

Discovery Question:
${question}

Answer from ${respondent}:
${text}

Avoid suggesting tasks or questions that already exist in the provided lists.

Please provide a JSON object with two fields:
- "analysis": a concise summary of what this answer reveals about the question in the context of the project.
- "suggestions": An array of objects for follow-up actions. Each object must have these fields:
    1. "text": The follow-up action. Do not include any names in this text.
    2. "category": One of "question", "meeting", "email", "research", or "instructional-design". Use "instructional-design" for tasks involving designing or creating instructional materials.
    3. "who": The person or group to work with. This must be either a project contact, someone explicitly mentioned in the provided materials, or the current user.
    4. "hypothesisId": The ID of the related hypothesis, or null if exploring a new idea.
    5. "taskType": One of "validate", "refute", or "explore".

Respond ONLY in this JSON format:
{"analysis": "...", "suggestions": [{"text": "...", "category": "...", "who": "...", "hypothesisId": "A", "taskType": "validate"}, ...]}`;

      const { text: res } = await ai.generate(prompt);

      const parseResponse = (str) => {
        const parsed = JSON.parse(str);
        const analysis =
          typeof parsed.analysis === "string"
            ? parsed.analysis
            : JSON.stringify(parsed.analysis);

        const allowedCategories = [
          "question",
          "meeting",
          "email",
          "research",
          "instructional-design",
        ];
        const allowedTaskTypes = ["validate", "refute", "explore"];
        const suggestions = Array.isArray(parsed.suggestions)
          ? parsed.suggestions
              .filter(
                (s) =>
                  s &&
                  typeof s.text === "string" &&
                  typeof s.category === "string" &&
                  typeof s.who === "string" &&
                  allowedCategories.includes(s.category.toLowerCase()) &&
                  !taskSet.has(s.text.toLowerCase()) &&
                  !questionSet.has(s.text.toLowerCase())
              )
              .map((s) => ({
                text: s.text,
                category: s.category.toLowerCase(),
                who: s.who,
                hypothesisId:
                  typeof s.hypothesisId === "string" && s.hypothesisId.trim()
                    ? s.hypothesisId.trim()
                    : null,
                taskType: allowedTaskTypes.includes(
                  (s.taskType || "").toLowerCase(),
                )
                  ? s.taskType.toLowerCase()
                  : "explore",
              }))
          : [];

        return { analysis, suggestions };
      };

      let result;
      if (typeof res === "string") {
        try {
          result = parseResponse(res);
        } catch {
          const match = res.match(/\{[\s\S]*\}/);
          if (match) {
            try {
              result = parseResponse(match[0]);
            } catch {
              // fall through
            }
          }
          if (!result) {
            result = { analysis: res.trim(), suggestions: [] };
          }
        }
      } else {
        result = { analysis: "Unexpected response format.", suggestions: [] };
      }

      let triageRes = null;
      if (uid && initiativeId) {
        try {
          triageRes = await triageEvidence(
            `Question: ${question}\nAnswer: ${text}`
          );
        } catch (err) {
          console.error("triageEvidence error", err);
        }
      }

      if (triageRes?.hypothesisLinks?.length) {
        const firstSupport = triageRes.hypothesisLinks.find(
          (l) => l.relationship?.toLowerCase() === "supports",
        );
        const firstRefute = triageRes.hypothesisLinks.find(
          (l) => l.relationship?.toLowerCase() === "refutes",
        );
        const firstRelevant = triageRes.hypothesisLinks.find(
          (l) => l.relationship?.toLowerCase() !== "unrelated",
        );
        result.suggestions = result.suggestions.map((s) => {
          if (s.hypothesisId) return s;
          if (s.taskType === "validate" && firstSupport) {
            return { ...s, hypothesisId: firstSupport.hypothesisId };
          }
          if (s.taskType === "refute" && firstRefute) {
            return { ...s, hypothesisId: firstRefute.hypothesisId };
          }
          if (s.taskType === "explore" && firstRelevant) {
            return { ...s, hypothesisId: firstRelevant.hypothesisId };
          }
          return s;
        });
      }

      return result;
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
    try {
      updateAnswer(idx, name, text);
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
        const outlookSnap = await getDoc(
          doc(db, "users", user.uid, "emailTokens", "outlook"),
        );
        const smtpSnap = await getDoc(
          doc(db, "users", user.uid, "emailTokens", "smtp"),
        );
        const provider = gmailSnap.exists()
          ? "gmail"
          : outlookSnap.exists()
          ? "outlook"
          : smtpSnap.exists()
          ? "smtp"
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
            (t) => t.hypothesisId === h.id,
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

  const updateAnswer = (idx, name, value) => {
    const now = new Date().toISOString();
    setQuestions((prev) => {
      const updated = [...prev];
      const q = updated[idx];
      q.answers = {
        ...q.answers,
        [name]: {
          ...(q.answers?.[name] || {}),
          text: value,
          answeredAt: now,
          answeredBy: currentUserName,
        },
      };
      if (value && !q.asked[name]) {
        q.asked[name] = true;
        q.answers[name].askedAt = now;
        q.answers[name].askedBy = currentUserName;
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
          const color = colorPalette[updatedContacts.length % colorPalette.length];
          const newContact = { role: "", name, email: "", color };
          updatedContacts = [...updatedContacts, newContact];
          setContacts(updatedContacts);
          if (uid) {
            saveInitiative(uid, initiativeId, {
              keyContacts: updatedContacts.map(({ name, role, email }) => ({
                name,
                role,
                email,
              })),
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

  async function markAsked(idx, names = []) {
    const text = questions[idx]?.question || "";
    let updatedQuestions = questions;
    const now = new Date().toISOString();
    setQuestions((prev) => {
      const updated = [...prev];
      const q = updated[idx];
      if (q) {
        const targets = names.length ? names : q.contacts;
        q.answers = q.answers || {};
        targets.forEach((n) => {
          q.asked[n] = true;
          q.answers[n] = {
            ...(q.answers[n] || {}),
            askedAt: now,
            askedBy: currentUserName,
          };
        });
      }
      updatedQuestions = updated;
      return updated;
    });
    if (uid) {
      const askedArray = updatedQuestions.map((qq) => qq?.asked || {});
      const answersArray = updatedQuestions.map((qq) => qq?.answers || {});
      await saveInitiative(uid, initiativeId, {
        clarifyingAsked: askedArray,
        clarifyingAnswers: answersArray,
      });
    }
    return text;
  }

  async function unmarkAsked(idx, name) {
    let updatedQuestions = questions;
    setQuestions((prev) => {
      const updated = [...prev];
      const q = updated[idx];
      if (q) {
        if (q.asked[name] !== undefined) {
          delete q.asked[name];
        }
        if (q.answers && q.answers[name]) {
          delete q.answers[name];
        }
      }
      updatedQuestions = updated;
      return updated;
    });
    if (uid) {
      await saveInitiative(uid, initiativeId, {
        clarifyingAsked: updatedQuestions.map((qq) => qq.asked),
        clarifyingAnswers: updatedQuestions.map((qq) => qq.answers),
      });
    }
  }

  const openComposer = (idx, contactsList) => {
    try {
      const name = contactsList[0];
      markAsked(idx, [name]);
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
    unmarkAsked(idx, prev);
    markAsked(idx, [newName]);
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
    unmarkAsked(idx, name);
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

  const handleDocFiles = async (files) => {
    const newDocs = [];
    for (const file of Array.from(files)) {
      const content = await file.text();
      newDocs.push({ name: file.name, content, addedAt: new Date().toISOString() });
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
    const text = window.prompt("Paste your text:");
    if (text && text.trim()) {
      const defaultName = `pasted-${documents.length + 1}.txt`;
      const name =
        window.prompt("Enter a filename", defaultName) || defaultName;
      const doc = {
        name,
        content: text,
        addedAt: new Date().toISOString(),
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
    const askedNames = q.contacts.filter((n) => {
      const ans = q.answers?.[n];
      const text = typeof ans === "string" ? ans : ans?.text;
      return q.asked[n] && !(typeof text === "string" && text.trim());
    });
    if (askedNames.length) {
      items.push({ ...q, idx, contacts: askedNames, status: "asked" });
    }
    const answeredNames = q.contacts.filter((n) => {
      const ans = q.answers?.[n];
      const text = typeof ans === "string" ? ans : ans?.text;
      return typeof text === "string" && text.trim();
    });
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
                    {h.statement || h.text || h.label || h.id}
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
            <p className="mb-4 text-sm text-gray-500">
              Click the <strong>Ask</strong> button, choose the responder, and enter
              answer text to receive analysis and suggested tasks.
            </p>
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
                      <div className="question-actions">
                        {q.status === "toask" && (
                          <button
                            className="generator-button"
                            onClick={() => openComposer(q.idx, q.contacts)}
                          >
                            Ask
                          </button>
                        )}
                        <button
                          type="button"
                          className="generator-button"
                          onClick={(e) => handleAnswerClick(e, q)}
                        >
                          Answer
                        </button>
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
                          const key = `${q.idx}-${name}`;
                          const draft = answerDrafts[key];
                          const isActive =
                            activeComposer &&
                            activeComposer.idx === q.idx &&
                            activeComposer.name === name;
                          return (
                            <div
                              key={name}
                              id={`answer-${q.idx}-${idxAns}`}
                              className="answer-block"
                            >
                              <strong>{name}:</strong>
                              {activeComposer &&
                                activeComposer.idx === q.idx &&
                                activeComposer.contacts.length > 1 && (
                                  <select
                                    value={activeComposer.name}
                                    onChange={(e) =>
                                      handleComposerContactChange(e.target.value)
                                    }
                                  >
                                    {activeComposer.contacts.map((c) => (
                                      <option key={c} value={c}>
                                        {c}
                                      </option>
                                    ))}
                                  </select>
                                )}
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
                                ref={(el) => {
                                  if (el && isActive) {
                                    el.focus();
                                  }
                                }}
                                onKeyDown={(e) =>
                                  handleComposerKeyDown(e, q.idx, name)
                                }
                              />
                              {restoredDraftKey === key && (
                                <div className="draft-restored">Draft restored</div>
                              )}
                              <div className="composer-actions">
                                <button
                                  className="generator-button"
                                  disabled={
                                    (answerDrafts[key] || "").trim().length < 2
                                  }
                                  onClick={() => handleAnswerSubmit(q.idx, name)}
                                >
                                  Save
                                </button>
                                <button
                                  className="generator-button"
                                  onClick={() => cancelComposer(q.idx, name)}
                                >
                                  Cancel
                                </button>
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
            {answerPanel &&
      createPortal(
        <AnswerSlideOver
          question={answerPanel.question}
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