import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import ai from "../ai";
import PropTypes from "prop-types";

const ProjectStatus = ({ questions = [] }) => {
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
      const stored = localStorage.getItem("projectStatusLast");
      if (stored) setLastUpdate(JSON.parse(stored));
    } catch (err) {
      console.error("load last project status", err);
    }
  }, []);

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
      localStorage.setItem(
        "projectStatusLast",
        JSON.stringify({ date: now, summary: clean })
      );
      setLastUpdate({ date: now, summary: clean });
    } catch (err) {
      console.error("generateSummary error", err);
    }
    setLoading(false);
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
      <textarea
        rows={10}
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="AI-generated summary will appear here"
        style={{ width: "100%" }}
      />
    </div>
  );
};

ProjectStatus.propTypes = {
  questions: PropTypes.array,
};

export default ProjectStatus;

