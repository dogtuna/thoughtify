import { useState, useEffect, useMemo } from "react";
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
import { auth, db, functions, appCheck } from "../firebase";
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

  // --- NEW STATE FOR HISTORY UI ---
  const [viewingAudience, setViewingAudience] = useState("client");
  const [selectedUpdate, setSelectedUpdate] = useState(null);

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
          db, "users", user.uid, "initiatives", initiativeId, "statusUpdates"
        );
        const qHist = query(colRef, orderBy("date", "desc"));
        const snap = await getDocs(qHist);
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (arr.length) {
          setHistory(arr);
          // Set the initially viewed summary to be the latest one
          setSelectedUpdate(arr[0]);
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

    // **CRITICAL FIX:** Find the last update that matches the *current generation audience*.
    const lastUpdateForAudience = history.find(h => h.audience === audience);
    const cutoff = lastUpdateForAudience ? new Date(lastUpdateForAudience.date) : null;

    // --- Data Aggregation ---
    const getAnswerTimestamp = (answer) => {
      const ts = answer.timestamp || answer.answeredAt;
      if (!ts) return null;
      return ts.toDate ? ts.toDate() : new Date(ts);
    };

    const newStakeholderAnswers = questions
      .map((q) => {
        const newAnswers = Object.entries(q.answers || {})
          .filter(([, answer]) => {
            if (!answer || typeof answer.text !== 'string' || !answer.text.trim()) return false;
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
        if (!cutoff) return true;
        const added = d.addedAt || d.createdAt || d.uploadedAt;
        if (!added) return true;
        const t = typeof added === "string" ? new Date(added) : (added.toDate ? added.toDate() : new Date(added));
        return t > cutoff;
      })
      .map((d) => `- ${d.name}: ${d.summary || (d.content ? d.content.slice(0, 200) : "")}`)
      .join("\n");

    const outstandingQuestionsArr = questions
      .filter((q) => !Object.values(q.answers || {}).some((a) => a && a.text && a.text.trim()))
      .map((q) => `- ${q.question}`);

    const taskListArr = tasks.map((t) => `- ${t.message || ""} (${t.status || "open"})`);
    const allOutstanding = [...outstandingQuestionsArr, ...taskListArr].join("\n");

    const sponsor = contacts.find((c) => /sponsor/i.test(c.role || ""));
    const formatContacts = (arr) => arr.map((c) => (c.role ? `${c.name} (${c.role})` : c.name)).join("; ");
    const projectBaseline = `Goal: ${businessGoal || "Unknown"}\nSponsor: ${sponsor ? `${sponsor.name}${sponsor.role ? ` (${sponsor.role})` : ""}` : "Unknown"}\nKey Contacts: ${formatContacts(contacts) || "None"}`;

    const previous = lastUpdateForAudience ? lastUpdateForAudience.summary : "None";
    const today = new Date().toDateString();

    const audiencePrompt = audience === "client" 
      ? "Use a client-facing tone that is professional and strategically focused." 
      : "Use an internal tone that candidly highlights risks, data conflicts, and detailed blockers.";

    const prompt = `Your role is an expert Performance Consultant...
---
### Project Data

**Previous Update:**
${previous}

**Project Baseline:**
${projectBaseline}

**New Stakeholder Answers (since last update):**
${newStakeholderAnswers || "None"}

**New Documents (since last update):**
${newDocuments || "None"}

**All Outstanding Questions & Tasks:**
${allOutstanding || "None"}`;
    
    try {
      const { text } = await ai.generate(prompt);
      const clean = text.trim();
      
      const now = new Date().toISOString();
      // **NEW:** Save the audience with the summary
      const entry = { date: now, summary: clean, sent: false, audience: audience };
      
      const colRef = collection(db, "users", user.uid, "initiatives", initiativeId, "statusUpdates");
      const docRef = await addDoc(colRef, entry);
      const entryWithId = { id: docRef.id, ...entry };
      
      const updatedHistory = [entryWithId, ...history];
      setHistory(updatedHistory);
      setSelectedUpdate(entryWithId); // Select the newly created update
      setSummary(clean);
      onHistoryChange(updatedHistory);
    } catch (err) {
      console.error("generateSummary error", err);
    }
    setLoading(false);
  };
  
  // --- NEW UI LOGIC ---
  const clientHistory = useMemo(() => history.filter(h => h.audience === 'client'), [history]);
  const internalHistory = useMemo(() => history.filter(h => h.audience === 'internal'), [history]);

  const handleSelectUpdate = (update) => {
    setSelectedUpdate(update);
    setSummary(update.summary);
    setEditing(false);
  };
  
  // Omitted saveEdit, markSent, email functions for brevity as they remain the same

  return (
    <div className="project-status-container">
      <div className="status-sidebar">
        <h3>History</h3>
        <div className="audience-toggle">
          <button onClick={() => setViewingAudience('client')} className={viewingAudience === 'client' ? 'active' : ''}>Client-Facing</button>
          <button onClick={() => setViewingAudience('internal')} className={viewingAudience === 'internal' ? 'active' : ''}>Internal</button>
        </div>
        <div className="history-list">
          {(viewingAudience === 'client' ? clientHistory : internalHistory).map(update => (
            <div 
              key={update.id} 
              className={`history-item ${selectedUpdate?.id === update.id ? 'selected' : ''}`}
              onClick={() => handleSelectUpdate(update)}
            >
              {new Date(update.date).toLocaleString()}
            </div>
          ))}
        </div>
      </div>
      
      <div className="status-main-content">
        <div className="status-controls">
          <label>
            Generate New:
            <select value={audience} onChange={(e) => setAudience(e.target.value)}>
              <option value="client">Client-Facing</option>
              <option value="internal">Internal</option>
            </select>
          </label>
          <button className="generator-button" onClick={generateSummary} disabled={loading}>
            {loading ? "Generating..." : "Generate New Update"}
          </button>
        </div>

        {selectedUpdate && (
          editing ? (
            <>
              <textarea rows={15} value={summary} onChange={(e) => setSummary(e.target.value)} style={{ width: "100%" }} />
              <div className="status-actions">
                 {/* saveEdit and cancel buttons */}
              </div>
            </>
          ) : (
            <>
              <div className="initiative-card">
                <pre style={{ whiteSpace: "pre-wrap" }}>{summary}</pre>
              </div>
              <div className="status-actions">
                <button className="generator-button" onClick={() => setEditing(true)}>Edit</button>
                 {/* other action buttons */}
              </div>
            </>
          )
        )}
      </div>
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