import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
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
}) => {
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [audience, setAudience] = useState("client");
  const defaultSince = () => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  };
  const [since, setSince] = useState(defaultSince);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
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
    const sinceDate = new Date(since);
    const q = query(
      collection(db, "profiles", user.uid, "taskQueue"),
      where("createdAt", ">=", Timestamp.fromDate(sinceDate))
    );
    getDocs(q).then((snap) => {
      setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [user, since]);

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
          setLastUpdate(arr[0]);
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
    const answered = questions
      .filter((q) => Object.values(q.answers || {}).some((a) => a && a.trim()))
      .map((q) => {
        const ans = Object.entries(q.answers || {})
          .filter(([, a]) => a && a.trim())
          .map(([name, a]) => `${name}: ${a}`)
          .join("; ");
        return `- ${q.question} | ${ans}`;
      })
      .join("\n");
    const outstandingQuestions = questions
      .filter((q) => !Object.values(q.answers || {}).some((a) => a && a.trim()))
      .map((q) => `- ${q.question}`)
      .join("\n");
    const outstandingTaskList = tasks
      .filter((t) => t.status !== "done")
      .map((t) => `- ${t.message || ""} (${t.status})`)
      .join("\n");
    const docSummaries = documents
      .map((d) => `- ${d.name}: ${d.content ? d.content.slice(0, 200) : ""}`)
      .join("\n");
    const sinceDate = new Date(since).toDateString();
    const today = new Date().toDateString();
    const audiencePrompt =
      audience === "client"
        ? "Use a client-facing tone that is professional and progress-focused."
        : "Use an internal tone that candidly highlights risks and detailed blockers.";
    const previous = lastUpdate
      ? `Previous update on ${new Date(lastUpdate.date).toDateString()}:\n${lastUpdate.summary}\n\n`
      : "There is no previous update; this is the first project status.\n\n";
    const outstandingCombined = [outstandingQuestions, outstandingTaskList]
      .filter(Boolean)
      .join("\n");
    const prompt = `${previous}You are an expert Performance Consultant, preparing a strategic brief for a client. Your persona is that of Dana Scully from The X-Files: your voice should be intelligent, analytical, and evidence-based. You are skeptical of initial assumptions and relentlessly focused on uncovering the objective, data-supported truth to solve the stated business goal.

Step 1: Factual Grounding (Internal Thought Process)
First, review all the provided information below (Project Data). Before writing the update, create a private, internal summary of the key facts. Do not interpret or add any information yet. Simply list the concrete data points. For example:

"The Project Sponsor stated the budget is firm at $50k."

"The Q2 Sales Report shows a 15% drop in lead conversion."

"User survey feedback repeatedly mentions a 'confusing user interface'."

"The provided 'Onboarding Manual' was last updated in 2018."

"An outstanding task is to interview the Head of IT about system capabilities."

Step 2: Strategic Synthesis & Drafting (The Final Output)
Now, using ONLY the factual points you summarized in Step 1, draft the project brief in the Scully persona. Your primary objective is to analyze the evidence to distinguish between performance gaps that can be addressed by a training intervention and systemic issues that require strategic decisions from leadership.
CRITICAL RULE: Do not invent any meetings, conversations, stakeholder names, or data points that are not explicitly present in the Project Data below. Every statement in your analysis must be directly supported by the provided information. If a piece of information is unknown, frame it as a "key question" or an "outstanding task" rather than inventing an answer.

${audiencePrompt}
Begin the response with Date: ${today} and structure it under the following headings:

Executive Summary & Key Insights

Recent Activity & Findings

Blockers & Next Actions

Project Data
Audience: ${audience === "client" ? "Client-Facing" : "Internal"}
Date Range: ${sinceDate} to ${today}
Stakeholder Answers: ${answered || "None"}
Document Summaries: ${docSummaries || "None"}
Outstanding Questions & Tasks: ${outstandingCombined || "None"}`;
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
      setLastUpdate(entryWithId);
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
      setLastUpdate(updatedFirst);
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
      setLastUpdate(updatedFirst);
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
        <label>
          Since:
          <input
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
          />
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
};

export default ProjectStatus;

