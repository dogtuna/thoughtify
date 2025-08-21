// src/TaskQueue.jsx
import { useState, useMemo } from "react";
import ReactDOM from "react-dom";
import PropTypes from "prop-types";
import { generate } from "../ai";
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

  const projects = useMemo(() => {
    const set = new Set();
    tasks.forEach((t) => {
      set.add(t.project || "General");
    });
    return Array.from(set);
  }, [tasks]);

  const filteredTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (statusFilter === "all" || (t.status || "open") === statusFilter) &&
          (projectFilter === "all" || t.project === projectFilter) &&
          (tagFilter === "all" || t.tag === tagFilter)
      ),
    [tasks, statusFilter, projectFilter, tagFilter]
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
    await updateDoc(doc(db, "profiles", user.uid, "taskQueue", first.id), {
      message,
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
    tasks.forEach((t) => {
      const key = `${t.assignee || t.name || ""}-${
        t.subType || t.tag || "other"
      }`;
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return Object.values(map).filter((b) => b.length > 1);
  };

  const startSynergy = () => {
    const bundles = computeBundles();
    const proposals = bundles.map((b) => {
      const first = b[0];
      const assignee = first.assignee || first.name || "";
      const type = first.subType || first.tag || "";
      let header;
      switch (type) {
        case "email":
          header = `Send an email to ${assignee}`;
          break;
        case "meeting":
          header = `Set up a meeting with ${assignee}`;
          break;
        case "call":
          header = `Call ${assignee}`;
          break;
        default:
          header = `Work with ${assignee}`;
      }
      const bullets = b.map((t) => t.message);
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
      const { text } = await generate(
        `Order the following tasks by priority and return a JSON array of ids in order:\n${tasks
          .map((t) => `${t.id}: ${t.message}`)
          .join("\n")}`
      );
      const ids = JSON.parse(text.trim());
      const ordered = ids
        .map((id) => tasks.find((t) => t.id === id))
        .filter(Boolean);
      if (ordered.length) {
        setPrioritized(ordered);
        return;
      }
    } catch (err) {
      console.error("prioritize", err);
    }
    setPrioritized([...tasks]);
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
        {task.name} ({task.email})
      </strong>
      {task.tag && <span className={`tag-badge tag-${task.tag}`}>{task.tag}</span>}
      <p>{task.message}</p>
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
        ReactDOM.createPortal(
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
        ReactDOM.createPortal(
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
        ReactDOM.createPortal(
          <div className="modal-overlay">
            <div className="task-modal">
              <h3>Prioritized Tasks</h3>
              <ul className="task-list">
                {prioritized.map((task, idx) => (
                  <li key={task.id} className="task-item">
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
