import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  orderBy,
  updateDoc,
  doc,
} from "firebase/firestore";
import {
  auth,
  db,
  functions,
  appCheck,
} from "../firebase";
import { httpsCallable } from "firebase/functions";
import { getToken as getAppCheckToken } from "firebase/app-check";
import ai from "../ai";
import PropTypes from "prop-types";

const ProjectStatus = ({
  questions = [],
  documents = [],
  contacts = [],
  setContacts = () => {},
  emailConnected = false,
  onHistoryChange = () => {},
  initiativeId = "",
  businessGoal = "",
}) => {
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [audience, setAudience] = useState("client");
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [editing, setEditing] = useState(false);
  const [recipientModal, setRecipientModal] = useState(null);
  const [newContact, setNewContact] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "profiles", user.uid, "taskQueue"),
      where("status", "!=", "done")
    );
    getDocs(q).then((snap) => {
      setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [user]);

  useEffect(() => {
    if (!user || !initiativeId) return;
    const loadHistory = async () => {
      try {
        const colRef = collection(
          db,
          "users",
          user.uid,
          "initiatives",
          initiativeId,
          "statusUpdates"
        );
        const qHist = query(colRef, orderBy("date", "desc"));
        const snap = await getDocs(qHist);
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (arr.length) {
          setHistory(arr);
          setSummary(arr[0].summary);
          onHistoryChange(arr);
        }
      } catch (err) {
        console.error("load project status", err);
      }
    };
    loadHistory();
  }, [user, initiativeId, onHistoryChange]);

  const generateSummary = async () => {
  if (!user || !initiativeId) return;
  setLoading(true);

  // Use the local 'history' state as the single source of truth.
  const lastUpdateFromState = history.length > 0 ? history[0] : null;

  // --- Data Aggregation ---
  const cutoff = lastUpdateFromState ? new Date(lastUpdateFromState.date) : null;

  // Helper functions for timestamps
  const getAnswerTimestamp = (answer) => {
    if (!answer || !answer.timestamp) return null;
    const ts = answer.timestamp;
    return ts.toDate ? ts.toDate() : new Date(ts);
  };

  const getDocumentTimestamp = (doc) => {
    const ts = doc.updatedAt || doc.addedAt || doc.createdAt || doc.uploadedAt;
    if (!ts) return null;
    return ts.toDate ? ts.toDate() : new Date(ts);
  };

  // This logic is now correct and time-aware.
  const newStakeholderAnswers = questions
    .map((q) => {
      const newAnswers = Object.entries(q.answers || {})
        .filter(([, answer]) => {
          if (!answer || !answer.text || !answer.text.trim()) return false;
          if (!cutoff) return true;
          const answerTimestamp = getAnswerTimestamp(answer);
          return answerTimestamp && answerTimestamp > cutoff;
        })
        .map(([name, answer]) => `${name}: ${answer.text}`)
        .join("; ");
      return newAnswers ? `- ${q.question} | ${newAnswers}` : null;
    })
    .filter(Boolean)
    .join("\n");

  const newDocuments = documents
    .filter((d) => {
      const t = getDocumentTimestamp(d);
      if (!t) {
        // Only include docs without timestamps on the very first run
        return !cutoff;
      }
      return !cutoff || t > cutoff;
    })
    .map(
      (d) =>
        `- ${d.name}: ${d.summary || (d.content ? d.content.slice(0, 200) : "")}`
    )
    .join("\n");

  const outstandingQuestionsArr = questions
    .filter((q) => !Object.values(q.answers || {}).some((a) => a && a.text && a.text.trim()))
    .map((q) => `- ${q.question}`);

  const taskListArr = tasks.map(
    (t) => `- ${t.message || ""} (${t.status || "open"})`
  );

  const allOutstanding = [...outstandingQuestionsArr, ...taskListArr].join("\n");

  const sponsor = contacts.find((c) => /sponsor/i.test(c.role || ""));
  const formatContacts = (arr) =>
    arr
      .map((c) => (c.role ? `${c.name} (${c.role})` : c.name))
      .join("; ");
  const projectBaseline = `Goal: ${
    businessGoal || "Unknown"
  }\nSponsor: ${
    sponsor ? `${sponsor.name}${sponsor.role ? ` (${sponsor.role})` : ""}` : "Unknown"
  }\nKey Contacts: ${formatContacts(contacts) || "None"}`;

  const today = new Date().toDateString();

  // **CRITICAL FIX #1: Extract ONLY the previous hypothesis**
  // This gives the AI the essential context without the noise of the full report.
  const getPreviousHypothesis = (summary) => {
    if (!summary) return "None";
    const match = summary.match(/\*\*Situation Analysis & Working Hypothesis\*\*\s*([\s\S]*?)\s*\*\*Key Findings & Evidence\*\*/);
    return match && match[1] ? match[1].trim() : summary; // Fallback to full summary if parsing fails
  };

  const previousHypothesis = lastUpdateFromState ? getPreviousHypothesis(lastUpdateFromState.summary) : "None";

  // --- Prompt ---
  const audiencePrompt =
    audience === "client"
      ? "Use a client-facing tone that is professional and strategically focused."
      : "Use an internal tone that candidly highlights risks, data conflicts, and detailed blockers.";

  const prompt = `Your role is an expert Performance Consultant delivering a strategic brief to a client. Your writing style must be analytical, evidence-based, and consultative. Your primary goal is to analyze the project's trajectory and provide a forward-looking strategic update, not a simple list of activities.

---
### Core Analytical Task: Delta Analysis

Your most important task is to analyze the project's evolution since the last update.

**IF \`Previous Hypothesis\` is "None":**
This is the **initial project brief**. Your task is to establish the baseline. Synthesize the \`Project Baseline\` data with any initial documents or answers to define the business problem, state the initial working hypothesis, and outline the clear next actions for the discovery phase.

**IF \`Previous Hypothesis\` exists:**
This is a **follow-up brief**. Your analysis must focus **exclusively** on the strategic impact of the \`New Stakeholder Answers\` and \`New Documents\` and how they relate to the \`Previous Hypothesis\`.
1.  In the \`Situation Analysis\`, you MUST explicitly state how this new information **confirms, challenges, or changes** the \`Previous Hypothesis\`. This is the most important part of your response.
2.  In the \`Key Findings\`, detail ONLY the specific new evidence and its implications. Do not repeat old findings.
3.  In the \`Strategic Recommendations\`, your actions must be a direct consequence of the new findings, showing a clear evolution of the project plan.

---
### Step-by-Step Instructions

**Step 1: Factual Grounding (Internal Thought Process)**
First, review all \`Project Data\`. Create a private, internal list of only the most critical facts from the **new** information provided.

**Step 2: Strategic Synthesis & Drafting (The Final Output)**
Now, using ONLY the facts you summarized in Step 1 and your \`Core Analytical Task\` above, draft the project brief. Frame your findings as a diagnosis and your recommendations as a clear, expert-guided path forward.

**CRITICAL RULE:** Do not invent any meetings, conversations, stakeholder names, or data points that are not explicitly present in the \`Project Data\`. Every conclusion must be a logical deduction from the provided evidence.

${audiencePrompt}

Begin the response with \`Date: ${today}\` and structure it under the following headings:
* Situation Analysis & Working Hypothesis
* Key Findings & Evidence
* Strategic Recommendations & Next Actions

---
### Project Data

**Previous Hypothesis:**
${previousHypothesis}

**Project Baseline:**
${projectBaseline}

**New Stakeholder Answers (since last update):**
${newStakeholderAnswers || "None"}

**New Documents (since last update):**
${newDocuments || "None"}

**All Outstanding Questions & Tasks:**
${allOutstanding || "None"}`;
  
  // --- API Call and State Update ---
  try {
    const { text } = await ai.generate(prompt);
    const clean = text.trim();
    setSummary(clean);
    const now = new Date().toISOString();
    const entry = { date: now, summary: clean, sent: false };
    const colRef = collection(
      db,
      "users",
      user.uid,
      "initiatives",
      initiativeId,
      "statusUpdates"
    );
    const docRef = await addDoc(colRef, entry);
    const entryWithId = { id: docRef.id, ...entry };
    const updated = [entryWithId, ...history];
    setHistory(updated);
    onHistoryChange(updated);
  } catch (err) {
    console.error("generateSummary error", err);
  }
  setLoading(false);
};

  const saveEdit = async () => {
    if (!user || !history.length) return;
    const first = history[0];
    try {
      const ref = doc(
        db,
        "users",
        user.uid,
        "initiatives",
        initiativeId,
        "statusUpdates",
        first.id
      );
      await updateDoc(ref, { summary });
      const updatedFirst = { ...first, summary };
      const updated = [updatedFirst, ...history.slice(1)];
      setHistory(updated);
      onHistoryChange(updated);
    } catch (err) {
      console.error("saveEdit error", err);
    }
    setEditing(false);
  };

  const markSent = async () => {
    if (!user || !history.length) return;
    const first = history[0];
    try {
      const ref = doc(
        db,
        "users",
        user.uid,
        "initiatives",
        initiativeId,
        "statusUpdates",
        first.id
      );
      await updateDoc(ref, { sent: true });
      const updatedFirst = { ...first, sent: true };
      const updated = [updatedFirst, ...history.slice(1)];
      setHistory(updated);
      onHistoryChange(updated);
    } catch (err) {
      console.error("markSent error", err);
    }
    setSummary("");
    setEditing(false);
  };

  const copySummary = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(summary);
    }
  };

  const openSendModal = () => {
    if (!emailConnected) {
      alert("Connect your Gmail account in settings.");
      return;
    }
    if (!auth.currentUser) {
      alert("Please log in to send emails.");
      return;
    }
    setRecipientModal({ selected: [] });
  };

  const sendEmail = async (names) => {
    const emails = names
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
        subject: `Project Status Update - ${new Date().toDateString()}`,
        message: summary,
        questionId: `status-${Date.now()}`,
      });
      alert("Email sent");
      markSent();
    } catch (err) {
      console.error("sendStatusEmail error", err);
      alert("Error sending email");
    }
  };

  const confirmRecipients = () => {
    sendEmail(recipientModal.selected);
    setRecipientModal(null);
  };

  const saveContact = () => {
    const updated = [...contacts, newContact];
    setContacts(updated);
    setNewContact(null);
    setRecipientModal((m) =>
      m ? { ...m, selected: [...m.selected, newContact.name] } : m
    );
  };

  return (
    <div className="project-status-section">
      <div className="status-controls">
        <label>
          Audience:
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
          >
            <option value="client">Client-Facing</option>
            <option value="internal">Internal</option>
          </select>
        </label>
        <button
          className="generator-button"
          onClick={generateSummary}
          disabled={loading}
        >
          {loading ? "Generating..." : "Generate Summary"}
        </button>
      </div>
      {summary ? (
        editing ? (
          <>
            <textarea
              rows={10}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              style={{ width: "100%" }}
            />
            <div className="status-actions">
              <button className="generator-button" onClick={saveEdit}>
                Save
              </button>
              <button
                className="generator-button"
                onClick={() => {
                  setSummary(history[0].summary);
                  setEditing(false);
                }}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="initiative-card">
              <pre style={{ whiteSpace: "pre-wrap" }}>{summary}</pre>
            </div>
            <div className="status-actions">
              <button
                className="generator-button"
                onClick={() => setEditing(true)}
              >
                Edit
              </button>
              <button
                className="generator-button"
                onClick={openSendModal}
              >
                Send with Gmail
              </button>
              <button
                className="generator-button"
                onClick={copySummary}
              >
                Copy to Clipboard
              </button>
              {!history[0]?.sent && (
                <button
                  className="generator-button"
                  onClick={markSent}
                >
                  Mark as Sent
                </button>
              )}
            </div>
          </>
        )
      ) : (
        <p>AI-generated summary will appear here</p>
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
              {contacts.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="modal-actions">
              <button
                className="generator-button"
                onClick={() => setNewContact({
                  name: "",
                  role: "",
                  email: "",
                })}
              >
                Add Contact
              </button>
              <button
                className="generator-button"
                onClick={confirmRecipients}
              >
                Send
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

      {newContact && (
        <div className="modal-overlay" onClick={() => setNewContact(null)}>
          <div
            className="initiative-card modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Add Contact</h3>
            <label>
              Name:
              <input
                className="generator-input"
                value={newContact.name}
                onChange={(e) =>
                  setNewContact((c) => ({ ...c, name: e.target.value }))
                }
              />
            </label>
            <label>
              Role:
              <input
                className="generator-input"
                value={newContact.role}
                onChange={(e) =>
                  setNewContact((c) => ({ ...c, role: e.target.value }))
                }
              />
            </label>
            <label>
              Email:
              <input
                className="generator-input"
                value={newContact.email}
                onChange={(e) =>
                  setNewContact((c) => ({ ...c, email: e.target.value }))
                }
              />
            </label>
            <div className="modal-actions">
              <button className="generator-button" onClick={saveContact}>
                Save
              </button>
              <button
                className="generator-button"
                onClick={() => setNewContact(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

ProjectStatus.propTypes = {
  questions: PropTypes.array,
  documents: PropTypes.array,
  contacts: PropTypes.array,
  setContacts: PropTypes.func,
  emailConnected: PropTypes.bool,
  onHistoryChange: PropTypes.func,
  initiativeId: PropTypes.string,
  businessGoal: PropTypes.string,
};

export default ProjectStatus;