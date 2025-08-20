// src/TaskQueue.jsx
import { useState, useMemo } from "react";
import ReactDOM from "react-dom";
import PropTypes from "prop-types";
import "../pages/admin.css";

export default function TaskQueue({ tasks, inquiries, onComplete, onReplyTask, onDelete }) {
  const [selectedItem, setSelectedItem] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");

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
          (projectFilter === "all" || t.project === projectFilter) &&
          (tagFilter === "all" || t.tag === tagFilter)
      ),
    [tasks, projectFilter, tagFilter]
  );

  const groupedTasks = useMemo(() => {
    return filteredTasks.reduce((acc, task) => {
      const project = task.project || "General";
      if (!acc[project]) acc[project] = [];
      acc[project].push(task);
      return acc;
    }, {});
  }, [filteredTasks]);

  const renderTask = (task) => (
    <li key={task.id} className="task-item">
      <strong>
        {task.name} ({task.email})
      </strong>
      {task.tag && <span className={`tag-badge tag-${task.tag}`}>{task.tag}</span>}
      <p>{task.message}</p>
      <div className="task-actions">
        <button className="complete-button" onClick={() => onComplete(task)}>
          Complete
        </button>
        <button
          className="reply-button"
          onClick={() => {
            setSelectedItem(task);
            setReplyText("");
          }}
        >
          Reply
        </button>
        <button className="delete-button" onClick={() => onDelete(task.id)}>
          Delete
        </button>
      </div>
    </li>
  );

  return (
    <div className="card glass-card">
      <h2>Task Queue</h2>

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
                <button className="complete-button" onClick={() => onComplete(inquiry)}>
                  Complete
                </button>
                <button
                  className="reply-button"
                  onClick={() => {
                    setSelectedItem(inquiry);
                    setReplyText("");
                  }}
                >
                  Reply
                </button>
                <button className="delete-button" onClick={() => onDelete(inquiry.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))
        )}
      </ul>

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
                    onReplyTask(selectedItem, replyText);
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
    </div>
  );
}

TaskQueue.propTypes = {
  tasks: PropTypes.array.isRequired,
  inquiries: PropTypes.array.isRequired,
  onComplete: PropTypes.func.isRequired,
  onReplyTask: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};
