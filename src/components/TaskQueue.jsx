// src/TaskQueue.jsx
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import { useInquiryMap } from "../context/InquiryMapContext.jsx";
import { makeIdToDisplayIdMap } from "../utils/hypotheses.js";
import { generate } from "../ai";
import { dedupeByMessage, normalizeAssigneeName } from "../utils/taskUtils";
import { auth, db } from "../firebase";
import { updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import "../pages/admin.css";

export default function TaskQueue({
  tasks,
  inquiries,
  statusFilter = "all",
  onComplete,
  onReplyTask,
  onDelete,
  onSchedule,
  onSynergize,
}) {
  const [selectedItem, setSelectedItem] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [synergyQueue, setSynergyQueue] = useState([]);
  const [synergyIndex, setSynergyIndex] = useState(0);
  const [prioritized, setPrioritized] = useState(null);
  const navigate = useNavigate();
  const { hypotheses = [] } = useInquiryMap() || {};
  const idToLetter = useMemo(() => makeIdToDisplayIdMap(hypotheses || []), [hypotheses]);

  const currentUserName =
    auth.currentUser?.displayName || auth.currentUser?.email || "";

  const normalizedTasks = useMemo(
    () =>
      tasks.map((t) => {
        const assignees =
          t.assignees && t.assignees.length
            ? t.assignees.map((a) =>
                normalizeAssigneeName(a, currentUserName),
              )
            : [
                normalizeAssigneeName(
                  t.assignee || t.name || "",
                  currentUserName,
                ),
              ];
        return { ...t, assignees, assignee: assignees[0] };
      }),
    [tasks, currentUserName],
  );

  const projects = useMemo(() => {
    const set = new Set();
    normalizedTasks.forEach((t) => {
      set.add(t.project || "General");
    });
    return Array.from(set);
  }, [normalizedTasks]);

  const filteredTasks = useMemo(
    () =>
      normalizedTasks.filter(
        (t) =>
          (statusFilter === "all" || (t.status || "open") === statusFilter) &&
          (projectFilter === "all" || t.project === projectFilter) &&
          (tagFilter === "all" || t.tag === tagFilter)
      ),
    [normalizedTasks, statusFilter, projectFilter, tagFilter]
  );

  const groupedTasks = useMemo(() => {
    return filteredTasks.reduce((acc, task) => {
      const project = task.project || "General";
      if (!acc[project]) acc[project] = [];
      acc[project].push(task);
      return acc;
    }, {});
  }, [filteredTasks]);

  const updateStatus = async (task, status, extra = {}) => {
    const user = auth.currentUser;
    if (!user) return;
    await updateDoc(doc(db, "profiles", user.uid, "taskQueue", task.id), {
      status,
      statusChangedAt: serverTimestamp(),
      hypothesisId: task.hypothesisId ?? null,
      taskType: task.taskType ?? "explore",
      priority: task.priority ?? "low",
      ...extra,
    });
  };

  const handleComplete = async (task) => {
    await updateStatus(task, "completed");
    onComplete?.(task);
  };

  const handleSchedule = async (task) => {
    await updateStatus(task, "scheduled");
    onSchedule?.(task);
  };

  const handleReplyTask = async (task, reply) => {
    await updateStatus(task, "open", { reply });
    onReplyTask?.(task, reply);
  };

  const handleDelete = async (id) => {
    const user = auth.currentUser;
    if (!user) return;
    await deleteDoc(doc(db, "profiles", user.uid, "taskQueue", id));
    onDelete?.(id);
  };

  const handleSynergize = async (bundle, message) => {
    const user = auth.currentUser;
    if (!user || !bundle.length) return;
    const [first, ...rest] = bundle;
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
    await updateDoc(doc(db, "profiles", user.uid, "taskQueue", first.id), {
      message,
      provenance,
      hypothesisId: first.hypothesisId ?? null,
      taskType: first.taskType ?? "explore",
      priority: first.priority ?? "low",
    });
    for (const t of rest) {
      await deleteDoc(doc(db, "profiles", user.uid, "taskQueue", t.id));
    }
    onSynergize?.(bundle, message);
  };

  const handleCompleteInquiry = async (inquiry) => {
    const user = auth.currentUser;
    if (!user) return;
    await updateDoc(doc(db, "profiles", user.uid, "inquiries", inquiry.id), {
      status: "completed",
      statusChangedAt: serverTimestamp(),
    });
    onComplete?.(inquiry);
  };

  const handleReplyInquiry = async (inquiry, reply) => {
    const user = auth.currentUser;
    if (!user) return;
    await updateDoc(doc(db, "profiles", user.uid, "inquiries", inquiry.id), {
      reply,
      status: "open",
      statusChangedAt: serverTimestamp(),
    });
    onReplyTask?.(inquiry, reply);
  };

  const handleDeleteInquiry = async (id) => {
    const user = auth.currentUser;
    if (!user) return;
    await deleteDoc(doc(db, "profiles", user.uid, "inquiries", id));
    onDelete?.(id);
  };

  const computeBundles = () => {
    const map = {};
    normalizedTasks
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
      const assigneeLabel = Array.from(new Set(assignees)).join(", ");
      const type = first.subType || first.tag || "";
      let header;
      const current =
        auth.currentUser?.displayName || auth.currentUser?.email || "";
      switch (type) {
        case "email":
          header = `Send an email to ${assigneeLabel}`;
          break;
        case "meeting": {
          header =
            assignees.length === 1 && assignees[0] === current
              ? "Suggested meetings"
              : `Set up a meeting with ${assigneeLabel}`;
          break;
        }
        case "call":
          header = `Call ${assigneeLabel}`;
          break;
        default: {
          const prettyType = type ? `${type.replace(/-/g, " ")} ` : "";
          header =
            assignees.length === 1 && assignees[0] === current
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

  const startPrioritize = async () => {
    try {
      const openTasks = normalizedTasks.filter(
        (t) => (t.status || "open") === "open",
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
      if (ordered.length) {
        setPrioritized(ordered);
        return;
      }
    } catch (err) {
      console.error("prioritize", err);
    }
    const openTasks = normalizedTasks.filter(
      (t) => (t.status || "open") === "open",
    );
    setPrioritized([...openTasks]);
  };

  const movePriority = (index, delta) => {
    setPrioritized((prev) => {
      const arr = [...prev];
      const next = index + delta;
      if (next < 0 || next >= arr.length) return arr;
      [arr[index], arr[next]] = [arr[next], arr[index]];
      return arr;
    });
  };

  const renderTask = (task) => (
    <li key={task.id} className="task-item">
      <strong>
        {task.assignees && task.assignees.length
          ? task.assignees.join(", ")
          : `${task.name} (${task.email})`}
      </strong>
      {task.tag && <span className={`tag-badge tag-${task.tag}`}>{task.tag}</span>}
      {task.hypothesisId && (
        <span
          className="tag-badge tag-hypothesis"
          onClick={() =>
            navigate(
              `/inquiry-map?initiativeId=${task.project || "General"}&hypothesisId=${task.hypothesisId}`
            )
          }
        >
          {idToLetter[task.hypothesisId] ? `Hypothesis ${idToLetter[task.hypothesisId]}` : task.hypothesisId}
        </span>
      )}
      {task.taskType && (
        <span className={`tag-badge tag-${task.taskType}`}>{task.taskType}</span>
      )}
      <p>{task.message}</p>
      {Array.isArray(task.provenance) && task.provenance.length > 0 && (
        <div className="provenance-chips">
          {task.provenance.map((p, idx) => {
            const baseParams = new URLSearchParams();
            if (task.project) baseParams.set("initiativeId", task.project);
            baseParams.set("focus", p.question);
            baseParams.set("qa", "1");
            const questionLink = `/discovery?${baseParams.toString()}`;
            const answerParams = new URLSearchParams(baseParams);
            answerParams.set("answer", p.answer);
            const answerLink = `/discovery?${answerParams.toString()}`;
            return (
              <div key={idx} className="provenance-group">
                <span
                  className="prov-chip"
                  title={p.questionPreview || p.preview}
                  onClick={() => navigate(questionLink)}
                >
                  {`Q${p.question + 1}`}
                </span>
                <span
                  className="prov-chip"
                  title={p.answerPreview || p.preview}
                  onClick={() => navigate(answerLink)}
                >
                  {`A${p.answer + 1}`}
                </span>
                {p.ruleId && (
                  <span
                    className="prov-chip"
                    title={p.answerPreview || p.preview}
                    onClick={() => navigate(answerLink)}
                  >
                    {p.ruleId}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="task-actions">
        <button className="complete-button" onClick={() => handleComplete(task)}>
          Complete
        </button>
        <button className="task-button" onClick={() => handleSchedule(task)}>
          Schedule
        </button>
        <button
          className="reply-button"
          onClick={() => {
            setSelectedItem({ ...task, type: "task" });
            setReplyText("");
          }}
        >
          Reply
        </button>
        <button className="delete-button" onClick={() => handleDelete(task.id)}>
          Delete
        </button>
      </div>
    </li>
  );

  return (
    <>
      <div className="tasks-main card glass-card">
        <h2>Task Queue</h2>

        <div className="task-global-actions">
          <button className="reply-button" onClick={startSynergy}>
            Synergize Tasks
          </button>
          <button className="task-button" onClick={startPrioritize}>
            Prioritize Tasks
          </button>
        </div>

        <div className="filter-row">
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
            <option value="all">All Projects</option>
            {projects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
            <option value="all">All Tags</option>
          <option value="email">email</option>
          <option value="call">call</option>
          <option value="meeting">meeting</option>
          <option value="research">research</option>
          <option value="instructional-design">instructional-design</option>
        </select>
      </div>

        {/* Render the Task Queue items */}
        <h3>Tasks</h3>
        <ul className="task-list">
          {Object.keys(groupedTasks).length === 0 ? (
            <p>No pending tasks.</p>
          ) : (
            Object.entries(groupedTasks).map(([project, projectTasks]) => {
              const bundles = projectTasks.reduce((acc, t) => {
                const key = `${t.tag || "other"}-${t.name || ""}`;
                if (!acc[key]) acc[key] = [];
                acc[key].push(t);
                return acc;
              }, {});
              return (
                <li key={project}>
                  <h4>{project}</h4>
                  {Object.values(bundles).map((bundle, idx) =>
                    bundle.length > 1 ? (
                      <div className="bundle-group" key={idx}>
                        <strong>
                          {bundle[0].tag || ""} with {bundle[0].name} ({bundle.length} items)
                        </strong>
                        <ul>{bundle.map((t) => renderTask(t))}</ul>
                      </div>
                    ) : (
                      renderTask(bundle[0])
                    )
                  )}
                </li>
              );
            })
          )}
        </ul>

        {/* Render the Inquiries items */}
        <h3>Inquiries</h3>
        <ul className="inquiries-list">
          {inquiries.length === 0 ? (
            <p>No pending inquiries.</p>
          ) : (
            inquiries.map((inquiry) => (
              <li key={inquiry.id} className="task-item">
                <strong>
                  {inquiry.name} ({inquiry.email})
                </strong>
                <p>{inquiry.message}</p>
                <div className="task-actions">
                  <button className="complete-button" onClick={() => handleCompleteInquiry(inquiry)}>
                    Complete
                  </button>
                  <button
                    className="reply-button"
                    onClick={() => {
                      setSelectedItem({ ...inquiry, type: "inquiry" });
                      setReplyText("");
                    }}
                  >
                    Reply
                  </button>
                  <button className="delete-button" onClick={() => handleDeleteInquiry(inquiry.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>

      {selectedItem &&
      createPortal(
          <div className="modal-overlay">
            <div className="task-modal">
              <h3>Reply to {selectedItem.name}</h3>
              <textarea
                placeholder="Type your reply..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                style={{ width: "100%", height: "80px", marginBottom: "10px" }}
              />
              <div className="modal-buttons">
                <button
                  className="reply-button"
                  onClick={() => {
                    if (selectedItem.type === "inquiry") {
                      handleReplyInquiry(selectedItem, replyText);
                    } else {
                      handleReplyTask(selectedItem, replyText);
                    }
                    setSelectedItem(null);
                    setReplyText("");
                  }}
                >
                  Send Reply
                </button>
                <button className="close-button" onClick={() => setSelectedItem(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {synergyQueue.length > 0 &&
      createPortal(
          <div className="modal-overlay">
            <div className="task-modal">
              <h3>Synergize Tasks</h3>
              <h4>{synergyQueue[synergyIndex].header}</h4>
              <ul className="task-list">
                {synergyQueue[synergyIndex].bullets.map((m, idx) => (
                  <li key={idx}>{m}</li>
                ))}
              </ul>
              <div className="modal-buttons">
                <button
                  className="reply-button"
                  onClick={async () => {
                    await handleSynergize(
                      synergyQueue[synergyIndex].bundle,
                      synergyQueue[synergyIndex].text
                    );
                    nextSynergy();
                  }}
                >
                  Approve
                </button>
                <button className="complete-button" onClick={nextSynergy}>
                  Reject
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {prioritized &&
      createPortal(
          <div className="modal-overlay">
            <div className="task-modal">
              <h3>Prioritized Tasks</h3>
              <ul className="task-list">
                {prioritized.map((task, idx) => (
                  <li key={task.id} className="task-item">
                    <span className="priority-index">{idx + 1}.</span>
                    <strong>
                      {task.name} ({task.email})
                    </strong>
                    {task.tag && (
                      <span className={`tag-badge tag-${task.tag}`}>{task.tag}</span>
                    )}
                    <p>{task.message}</p>
                    <div className="task-actions">
                      <button
                        className="task-button"
                        disabled={idx === 0}
                        onClick={() => movePriority(idx, -1)}
                      >
                        Up
                      </button>
                      <button
                        className="task-button"
                        disabled={idx === prioritized.length - 1}
                        onClick={() => movePriority(idx, 1)}
                      >
                        Down
                      </button>
                      <button
                        className="task-button"
                        onClick={() => handleSchedule(task)}
                      >
                        Schedule
                      </button>
                      <button
                        className="complete-button"
                        onClick={() => handleComplete(task)}
                      >
                        Complete
                      </button>
                      <button
                        className="reply-button"
                        onClick={() => {
                          setSelectedItem({ ...task, type: "task" });
                          setReplyText("");
                        }}
                      >
                        Reply
                      </button>
                      <button
                        className="delete-button"
                        onClick={() => handleDelete(task.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="modal-buttons">
                <button className="close-button" onClick={() => setPrioritized(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

TaskQueue.propTypes = {
  tasks: PropTypes.array.isRequired,
  inquiries: PropTypes.array.isRequired,
  statusFilter: PropTypes.string,
  onComplete: PropTypes.func,
  onReplyTask: PropTypes.func,
  onDelete: PropTypes.func,
  onSchedule: PropTypes.func,
  onSynergize: PropTypes.func,
};
