import { useState } from "react";
import PropTypes from "prop-types";

const AnswerSlideOver = ({
  question,
  idx,
  allContacts,
  currentUserName,
  updateAnswer,
  analyzeAnswer,
  createTasks,
  addContact,
  onClose,
  setToast,
  setAnalyzing,
}) => {
  // Guard against questions that do not have any associated contacts.
  const [contact, setContact] = useState(
    (question.contacts && question.contacts[0]) || ""
  );
  const [text, setText] = useState("");
  const [stage, setStage] = useState("compose");
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState([]);
  const [assignments, setAssignments] = useState({});

  const handleSave = async () => {
    if (text.trim().length < 2) return;
    updateAnswer(idx, contact, text);
    setStage("loading");
    setAnalyzing(true);
    const result = await analyzeAnswer(question.question || "", text, contact);
    setAnalyzing(false);
    setSuggestions(result.suggestions || []);
    setStage("suggestions");
  };

  const toggleSelection = (i) => {
    setSelected((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
    );
  };

  const handleAssignmentChange = async (i, value) => {
    if (value === "__add__") {
      const name = addContact();
      if (name) {
        setAssignments((prev) => ({ ...prev, [i]: name }));
      }
      return;
    }
    setAssignments((prev) => ({ ...prev, [i]: value }));
  };

  const handleConfirm = async () => {
    const chosen = selected.map((i) => ({
      ...suggestions[i],
      assignees: [assignments[i] || currentUserName],
    }));
    if (chosen.length > 0) {
      const added = await createTasks(idx, contact, chosen);
      if (added > 0) {
        setToast(`Added ${added} tasks.`);
      }
    }
    onClose();
  };

  return (
    <div className="slide-over-overlay" onClick={onClose}>
      <div className="slide-over-panel" onClick={(e) => e.stopPropagation()}>
        <h3>Answer Question</h3>
        <p>{question.question}</p>
        {stage === "compose" && (
          <>
            <label className="block text-sm font-medium">
              Contact
              <select
                className="generator-input"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
              >
                {(question.contacts || []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <textarea
              className="generator-input"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="modal-actions">
              <button className="generator-button" onClick={handleSave}>
                Save
              </button>
              <button className="generator-button" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}
        {stage === "loading" && <p>Analyzing answer...</p>}
        {stage === "suggestions" && (
          <>
            {suggestions.length > 0 ? (
              <>
                <p>Would you like to add any of these tasks to your task list?</p>
                <ul className="suggestion-list">
                  {suggestions.map((s, i) => (
                    <li key={i}>
                      <label>
                        <input
                          type="checkbox"
                          checked={selected.includes(i)}
                          onChange={() => toggleSelection(i)}
                        />
                        {s.text}
                      </label>
                      {selected.includes(i) && (
                        <select
                          value={assignments[i] || ""}
                          onChange={(e) => handleAssignmentChange(i, e.target.value)}
                        >
                          <option value="">Assign to...</option>
                          <option value={currentUserName}>Me</option>
                          {allContacts.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                          <option value="__add__">Add New</option>
                        </select>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>No task suggestions.</p>
            )}
            <div className="modal-actions">
              <button className="generator-button" onClick={handleConfirm}>
                Confirm
              </button>
              <button className="generator-button" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

AnswerSlideOver.propTypes = {
  question: PropTypes.object.isRequired,
  idx: PropTypes.number.isRequired,
  allContacts: PropTypes.array.isRequired,
  currentUserName: PropTypes.string.isRequired,
  updateAnswer: PropTypes.func.isRequired,
  analyzeAnswer: PropTypes.func.isRequired,
  createTasks: PropTypes.func.isRequired,
  addContact: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  setToast: PropTypes.func.isRequired,
  setAnalyzing: PropTypes.func.isRequired,
};

export default AnswerSlideOver;
