import { useState, useEffect, useMemo } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useInquiryMap } from "../context/InquiryMapContext"; // Import the context
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
  contacts = [],
  setContacts = () => {},
  emailConnected = false,
  onHistoryChange = () => {},
  initiativeId = "",
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
  
  // Get the real-time data from our Inquiry Map!
  const { hypotheses, businessGoal, recommendations } = useInquiryMap();
  
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
        const colRef = collection(db, "users", user.uid, "initiatives", initiativeId, "statusUpdates");
        const qHist = query(colRef, orderBy("date", "desc"));
        const snap = await getDocs(qHist);
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (arr.length) {
          setHistory(arr);
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

    const lastUpdateForAudience = history.find(h => h.audience === audience);
    const previous = lastUpdateForAudience ? lastUpdateForAudience.summary : "None";
    const today = new Date().toDateString();

    const audiencePrompt = audience === "client" 
      ? "Use a client-facing tone..." 
      : "Use an internal tone...";

    // **CRITICAL FIX: The prompt now receives the synthesized analysis from the Inquiry Map.**
    const prompt = `Your role is an expert Performance Consultant. Draft a project status update based on the current state of the Inquiry Map.

Your primary task is to **synthesize the Inquiry Map's analysis** into a compelling narrative for the specified audience. Do not re-analyze the raw evidence; your job is to report on the *conclusions* that have already been reached.

**IF \`Previous Update\` is "None":**
This is the **initial project brief**. Summarize the initial hypotheses and explain the discovery plan.

**IF \`Previous Update\` exists:**
This is a **follow-up brief**. Analyze the **change in hypothesis confidence scores**.
1.  In the \`Situation Analysis\`, explain which hypothesis has gained the most confidence and why this represents a strategic pivot for the project.
2.  In the \`Key Findings\`, summarize the new, high-impact evidence that caused the confidence scores to change.
3.  In the \`Strategic Recommendations\`, propose next actions that logically follow from the updated analysis.

---
### Project Data

**Previous Update:**
${previous}

**Current Inquiry Map State (Hypotheses, Confidence Scores, and linked evidence summaries):**
${JSON.stringify(hypotheses)} 

**Project Baseline:**
Goal: ${businessGoal}
Sponsor: ${(contacts.find(c => /sponsor/i.test(c.role)) || {}).name || 'Unknown'}

**Current Recommendations & Outstanding Tasks:**
${JSON.stringify({recommendations, tasks})}
`;
    
    try {
      const { text } = await ai.generate(prompt);
      const clean = text.trim();
      
      const now = new Date().toISOString();
      const entry = { date: now, summary: clean, sent: false, audience: audience };
      
      const colRef = collection(db, "users", user.uid, "initiatives", initiativeId, "statusUpdates");
      const docRef = await addDoc(colRef, entry);
      const entryWithId = { id: docRef.id, ...entry };
      
      const updatedHistory = [entryWithId, ...history];
      setHistory(updatedHistory);
      setSelectedUpdate(entryWithId);
      setSummary(clean);
      onHistoryChange(updatedHistory);
    } catch (err) {
      console.error("generateSummary error", err);
    }
    setLoading(false);
  };
  
  const clientHistory = useMemo(() => history.filter(h => h.audience === 'client'), [history]);
  const internalHistory = useMemo(() => history.filter(h => h.audience === 'internal'), [history]);

  const handleSelectUpdate = (update) => {
    setSelectedUpdate(update);
    setSummary(update.summary);
    setEditing(false);  
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