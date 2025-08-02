// src/TaskQueue.jsx
import { useState } from "react";
import ReactDOM from "react-dom";
import PropTypes from "prop-types";
import "../pages/admin.css";

export default function TaskQueue({ tasks, inquiries, onComplete, onReplyTask, onDelete }) {
  const [selectedItem, setSelectedItem] = useState(null);
  const [replyText, setReplyText] = useState("");

  return (
    <div className="card glass-card">
      <h2>Task Queue</h2>

      {/* Render the Task Queue items */}
      <h3>Tasks</h3>
      <ul className="task-list">
        {tasks.length === 0 ? (
          <p>No pending tasks.</p>
        ) : (
          tasks.map((task) => (
            <li key={task.id} className="task-item">
              <strong>{task.name} ({task.email})</strong>
              <p>{task.message}</p>
              <div className="task-actions">
                <button className="complete-button" onClick={() => onComplete(task)}>
                  Complete
                </button>
                <button className="reply-button" onClick={() => { setSelectedItem(task); setReplyText(""); }}>
                  Reply
                </button>
                <button className="delete-button" onClick={() => onDelete(task.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))
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
              <strong>{inquiry.name} ({inquiry.email})</strong>
              <p>{inquiry.message}</p>
              <div className="task-actions">
                <button className="complete-button" onClick={() => onComplete(inquiry)}>
                  Complete
                </button>
                <button className="reply-button" onClick={() => { setSelectedItem(inquiry); setReplyText(""); }}>
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
