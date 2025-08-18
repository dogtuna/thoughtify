import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
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
  const historyKey = `projectStatusHistory:${initiativeId}`;
  const lastKey = `projectStatusLast:${initiativeId}`;

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
    try {
      const hist = JSON.parse(localStorage.getItem(historyKey) || "[]");
      if (hist.length) {
        setHistory(hist);
        setLastUpdate(hist[0]);
        setSummary(hist[0].summary);
        onHistoryChange(hist);
      } else {
        const stored = localStorage.getItem(lastKey);
        if (stored) {
          const last = JSON.parse(stored);
          const arr = [last];
          setHistory(arr);
          setLastUpdate(last);
          setSummary(last.summary);
          onHistoryChange(arr);
        }
      }
    } catch (err) {
      console.error("load project status", err);
    }
  }, [onHistoryChange, historyKey, lastKey]);

  const generateSummary = async () => {
    setLoading(true);
    const tasksList = tasks
      .map((t) => `- ${t.message || ""} (${t.status})`)
      .join("\n");
    const answered = questions
      .filter((q) => Object.values(q.answers || {}).some((a) => a && a.trim()))
      .map((q) => `- ${q.question}`)
      .join("\n");
    const outstanding = questions
      .filter((q) => !Object.values(q.answers || {}).some((a) => a && a.trim()))
      .map((q) => `- ${q.question}`)
      .join("\n");
    const sinceDate = new Date(since).toDateString();
    const today = new Date().toDateString();
    const audiencePrompt =
      audience === "client"
        ? "Write for a client-facing audience with a professional, progress-focused tone."
        : "Write for an internal audience, candidly highlighting risks and detailed blockers.";
    const previous = lastUpdate
      ? `Previous update on ${new Date(lastUpdate.date).toDateString()}:\n${lastUpdate.summary}\n\n`
      : "There is no previous update; this is the first project status.\n\n";
    const prompt = `Today is ${today}. ${previous}You are preparing a project status update for work done since ${sinceDate}.
Tasks (format: description (status)):\n${tasksList || "None"}\n\nAnswered Questions:\n${answered || "None"}\n\nOutstanding Questions:\n${outstanding || "None"}\n\nUse only the information provided above. Do not add or assume any details, names, dates, or outcomes that aren't explicitly given. If information is missing, state that it is unknown or pending. Each task's status indicates progress; do not imply completion unless the status is done. If there is no information for a section, respond with "None."\n\n${audiencePrompt}\nBegin the response with 'Date: ${today}' and structure it under the headings: What's New, Outstanding / Blockers, and Next Steps for Design.`;
    try {
      const { text } = await ai.generate(prompt);
      const clean = text.trim();
      setSummary(clean);
      const now = new Date().toISOString();
      const entry = { date: now, summary: clean, sent: false };
      setHistory((h) => {
        const updated = [entry, ...h];
        localStorage.setItem(historyKey, JSON.stringify(updated));
        localStorage.setItem(lastKey, JSON.stringify(entry));
        setLastUpdate(entry);
        onHistoryChange(updated);
        return updated;
      });
    } catch (err) {
      console.error("generateSummary error", err);
    }
    setLoading(false);
  };

  const saveEdit = () => {
    setHistory((h) => {
      if (!h.length) return h;
      const updatedFirst = { ...h[0], summary };
      const updated = [updatedFirst, ...h.slice(1)];
      localStorage.setItem(historyKey, JSON.stringify(updated));
      localStorage.setItem(lastKey, JSON.stringify(updatedFirst));
      setLastUpdate(updatedFirst);
      onHistoryChange(updated);
      return updated;
    });
    setEditing(false);
  };

  const markSent = () => {
    setHistory((h) => {
      if (!h.length) return h;
      const updatedFirst = { ...h[0], sent: true };
      const updated = [updatedFirst, ...h.slice(1)];
      localStorage.setItem(historyKey, JSON.stringify(updated));
      localStorage.setItem(lastKey, JSON.stringify(updatedFirst));
      setLastUpdate(updatedFirst);
      onHistoryChange(updated);
      return updated;
    });
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
  contacts: PropTypes.array,
  setContacts: PropTypes.func,
  emailConnected: PropTypes.bool,
  onHistoryChange: PropTypes.func,
  initiativeId: PropTypes.string,
};

export default ProjectStatus;

