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
    const audiencePrompt =
      audience === "client"
        ? "Write for a client-facing audience with a professional, progress-focused tone."
        : "Write for an internal audience, candidly highlighting risks and detailed blockers.";
    const prompt = `You are preparing a project status update for work done since ${sinceDate}.
Tasks:\n${tasksList || "None"}\n\nAnswered Questions:\n${answered || "None"}\n\nOutstanding Questions:\n${outstanding || "None"}\n\n${audiencePrompt}\nStructure the update under the headings: What's New, Outstanding / Blockers, and Next Steps for Design.`;
    try {
      const { text } = await ai.generate(prompt);
      setSummary(text.trim());
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

