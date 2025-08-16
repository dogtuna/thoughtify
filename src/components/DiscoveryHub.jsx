import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import { loadInitiative, saveInitiative } from "../utils/initiatives";
import "./AIToolsGenerators.css";
import "./DiscoveryHub.css";

const colorPalette = [
  "#f8d7da",
  "#d1ecf1",
  "#d4edda",
  "#fff3cd",
  "#cce5ff",
  "#e2ccff",
];

const normalizeContacts = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const DiscoveryHub = () => {
  const [searchParams] = useSearchParams();
  const initiativeId = searchParams.get("initiativeId");
  const [questions, setQuestions] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [contactFilter, setContactFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [groupBy, setGroupBy] = useState("");
  const [selected, setSelected] = useState([]);
  const [uid, setUid] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState("questions");
  const [summary, setSummary] = useState("");
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUid(user.uid);
        if (initiativeId) {
          const init = await loadInitiative(user.uid, initiativeId);
          const contactsInit = (init?.keyContacts || []).map((c, i) => ({
            ...c,
            color: colorPalette[i % colorPalette.length],
          }));
          setContacts(contactsInit);
          const qs = (init?.clarifyingQuestions || []).map((q, idx) => {
            const contactValue =
              init?.clarifyingContacts?.[idx] ?? q.stakeholders ?? [];
            return {
              question: typeof q === "string" ? q : q.question,
              contacts: normalizeContacts(contactValue),
              answers: init?.clarifyingAnswers?.[idx] || {},
              asked: init?.clarifyingAsked?.[idx] || false,
              id: idx,
            };
          });
          setQuestions(qs);
          setDocuments(init?.sourceMaterials || []);
        }
        setLoaded(true);
      } else {
        setLoaded(true);
      }
    });
    return () => unsubscribe();
  }, [initiativeId]);

  const updateAnswer = (idx, role, value) => {
    setQuestions((prev) => {
      const updated = [...prev];
      const q = updated[idx];
      q.answers = { ...q.answers, [role]: value };
      if (uid) {
        saveInitiative(uid, initiativeId, {
          clarifyingAnswers: updated.map((qq) => qq.answers),
        });
      }
      return updated;
    });
  };

  const addContact = () => {
    const role = prompt("Contact role?");
    if (!role) return null;
    const name = prompt("Contact name? (optional)") || "";
    const color = colorPalette[contacts.length % colorPalette.length];
    const newContact = { role, name, color };
    const updated = [...contacts, newContact];
    setContacts(updated);
    if (uid) {
      saveInitiative(uid, initiativeId, {
        keyContacts: updated.map(({ name, role }) => ({ name, role })),
      });
    }
    return role;
  };

  const addContactToQuestion = (idx, role) => {
    setQuestions((prev) => {
      const updated = [...prev];
      const q = updated[idx];
      if (!q.contacts.includes(role)) {
        q.contacts = [...q.contacts, role];
      }
      if (uid) {
        saveInitiative(uid, initiativeId, {
          clarifyingContacts: updated.map((qq) => qq.contacts),
        });
      }
      return updated;
    });
  };

  const removeContactFromQuestion = (idx, role) => {
    setQuestions((prev) => {
      const updated = [...prev];
      const q = updated[idx];
      q.contacts = q.contacts.filter((r) => r !== role);
      if (q.answers[role]) {
        delete q.answers[role];
      }
      if (uid) {
        saveInitiative(uid, initiativeId, {
          clarifyingContacts: updated.map((qq) => qq.contacts),
          clarifyingAnswers: updated.map((qq) => qq.answers),
        });
      }
      return updated;
    });
  };

  const handleContactSelect = (idx, value) => {
    if (value === "__add__") {
      const newRole = addContact();
      if (newRole) addContactToQuestion(idx, newRole);
    } else if (value) {
      addContactToQuestion(idx, value);
    }
  };

  const markAsked = (idxs) => {
    const indices = Array.isArray(idxs) ? idxs : [idxs];
    const texts = [];
    setQuestions((prev) => {
      const updated = [...prev];
      indices.forEach((i) => {
        updated[i].asked = true;
        texts.push(updated[i].question);
      });
      if (uid) {
        saveInitiative(uid, initiativeId, {
          clarifyingAsked: updated.map((qq) => qq.asked),
        });
      }
      return updated;
    });
    if (navigator.clipboard && texts.length) {
      navigator.clipboard.writeText(texts.join("\n\n"));
    }
    setSelected((prev) => prev.filter((i) => !indices.includes(i)));
  };

  const moveToToAsk = (idx) => {
    setQuestions((prev) => {
      const updated = [...prev];
      const q = updated[idx];
      q.asked = false;
      q.answers = {};
      if (uid) {
        saveInitiative(uid, initiativeId, {
          clarifyingAsked: updated.map((qq) => qq.asked),
          clarifyingAnswers: updated.map((qq) => qq.answers),
        });
      }
      return updated;
    });
  };

  const handleDocFiles = async (files) => {
    const newDocs = [];
    for (const file of Array.from(files)) {
      const content = await file.text();
      newDocs.push({ name: file.name, content });
    }
    setDocuments((prev) => {
      const updated = [...prev, ...newDocs];
      if (uid) {
        saveInitiative(uid, initiativeId, { sourceMaterials: updated });
      }
      return updated;
    });
  };

  const handleDocInput = (e) => {
    if (e.target.files) handleDocFiles(e.target.files);
  };

  const handleDocDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files) handleDocFiles(e.dataTransfer.files);
  };

  const handleDocDragOver = (e) => {
    e.preventDefault();
  };

  const removeDocument = (idx) => {
    setDocuments((prev) => {
      const updated = prev.filter((_, i) => i !== idx);
      if (uid) {
        saveInitiative(uid, initiativeId, { sourceMaterials: updated });
      }
      return updated;
    });
  };

  const summarizeText = (text) => {
    const words = text.trim().split(/\s+/);
    return words.slice(0, 50).join(" ") + (words.length > 50 ? "..." : "");
  };

  const handleSummarize = (text) => {
    setSummary(summarizeText(text));
    setShowSummary(true);
  };

  const handleSummarizeAll = () => {
    const combined = documents.map((d) => d.content).join(" ");
    handleSummarize(combined);
  };

  const toggleSelect = (idx) => {
    setSelected((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  const askSelected = () => {
    if (selected.length) {
      markAsked(selected);
    }
  };

  const getColor = (role) =>
    contacts.find((c) => c.role === role)?.color || "#e9ecef";

  if (!loaded) {
    return (
      <div className="dashboard-container">
        <h2>Loading...</h2>
      </div>
    );
  }
  const statusLabel = (s) =>
    s === "toask" ? "To Ask" : s === "asked" ? "Asked" : "Answered";

  const items = questions.map((q, idx) => {
    const allAnswered =
      q.contacts.length && q.contacts.every((r) => (q.answers[r] || "").trim());
    const status = !q.asked ? "toask" : allAnswered ? "answered" : "asked";
    return { ...q, idx, status };
    });

  let filtered = items.filter(
    (q) =>
      (!contactFilter || q.contacts.includes(contactFilter)) &&
      (!statusFilter || q.status === statusFilter)
  );

  let grouped = { All: filtered };
  if (groupBy === "contact") {
    grouped = {};
    filtered.forEach((q) => {
      const roles = q.contacts.length ? q.contacts : ["Unassigned"];
      roles.forEach((r) => {
        grouped[r] = grouped[r] || [];
        grouped[r].push(q);
      });
    });
  } else if (groupBy === "status") {
    grouped = {};
    filtered.forEach((q) => {
      const label = statusLabel(q.status);
      grouped[label] = grouped[label] || [];
      grouped[label].push(q);
    });
  }

  return (
    <div className="dashboard-container discovery-hub">
      <aside className="sidebar">
        <h2>Discovery Hub</h2>
        <ul>
          <li
            className={active === "documents" ? "active" : ""}
            onClick={() => setActive("documents")}
          >
            Documents
          </li>
          <li className={active === "questions" ? "active" : ""}>
            <span
              className="questions"
              onClick={() => {
                setActive("questions");
                setStatusFilter("");
              }}
            >
              Questions
            </span>
            {active === "questions" && (
              <ul className="sub-menu">
                <li
                  className={statusFilter === "toask" ? "active" : ""}
                  onClick={() => setStatusFilter("toask")}
                >
                  Ask
                </li>
                <li
                  className={statusFilter === "asked" ? "active" : ""}
                  onClick={() => setStatusFilter("asked")}
                >
                  Asked
                </li>
                <li
                  className={statusFilter === "answered" ? "active" : ""}
                  onClick={() => setStatusFilter("answered")}
                >
                  Answered
                </li>
              </ul>
            )}
          </li>
        </ul>
      </aside>
      <div className="main-content">
        {active === "documents" ? (
          <div className="document-section">
            {documents.length > 0 && (
              <button
                className="generator-button summarize-all"
                onClick={handleSummarizeAll}
              >
                Summarize All Files
              </button>
            )}
            <ul className="document-list">
              {documents.map((doc, idx) => (
                <li key={idx} className="document-item">
                  {doc.name}
                  <span className="doc-actions">
                    <button onClick={() => handleSummarize(doc.content)}>
                      Summarize
                    </button>
                    <button onClick={() => removeDocument(idx)}>Remove</button>
                  </span>
                </li>
              ))}
            </ul>
            <div
              className="drop-zone"
              onDrop={handleDocDrop}
              onDragOver={handleDocDragOver}
            >
              Drag & Drop Documents Here
              <input type="file" multiple onChange={handleDocInput} />
            </div>
          </div>
        ) : (
          <>
            <div className="filter-bar">
              <label>
                Contact:
                <select
                  value={contactFilter}
                  onChange={(e) => setContactFilter(e.target.value)}
                >
                  <option value="">All</option>
                  {contacts.map((c) => (
                    <option key={c.role} value={c.role}>
                      {c.role}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status:
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">All</option>
                  <option value="toask">To Ask</option>
                  <option value="asked">Asked</option>
                  <option value="answered">Answered</option>
                </select>
              </label>
              <label>
                Group by:
                <select
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value)}
                >
                  <option value="">None</option>
                  <option value="contact">Contact</option>
                  <option value="status">Status</option>
                </select>
              </label>
              <button className="generator-button" onClick={addContact}>
                Add Contact
              </button>
              {selected.length > 0 && (
                <button
                  className="generator-button ask-selected"
                  onClick={askSelected}
                >
                  Ask Selected
                </button>
              )}
            </div>
            {Object.entries(grouped).map(([grp, items]) => (
              <div key={grp} className="group-section">
                {groupBy && <h3>{grp}</h3>}
                {items.map((q) => (
                  <div
                    key={q.idx}
                    className={`initiative-card question-card ${q.status}`}
                  >
                    <div className="question-header">
                      <input
                        type="checkbox"
                        checked={selected.includes(q.idx)}
                        onChange={() => toggleSelect(q.idx)}
                      />
                      <p>{q.question}</p>
                      <span className="status-tag">{statusLabel(q.status)}</span>
                    </div>
                    <div className="contact-row">
                      {q.contacts.map((r) => (
                        <span
                          key={r}
                          className="contact-tag"
                          style={{ backgroundColor: getColor(r) }}
                        >
                          {r}
                          <button onClick={() => removeContactFromQuestion(q.idx, r)}>
                            ×
                          </button>
                        </span>
                      ))}
                      <select
                        className="contact-select"
                        value=""
                        onChange={(e) => handleContactSelect(q.idx, e.target.value)}
                      >
                        <option value="">Add Contact</option>
                        {contacts
                          .filter((c) => !q.contacts.includes(c.role))
                          .map((c) => (
                            <option key={c.role} value={c.role}>
                              {c.role}
                            </option>
                          ))}
                        <option value="__add__">Add New Contact</option>
                      </select>
                    </div>
                    {q.status !== "toask" &&
                      q.contacts.map((r) => (
                        <div key={r} className="answer-block">
                          <strong>{r}:</strong>
                          <textarea
                            className="generator-input"
                            placeholder="Paste Answer/Notes Here"
                            value={q.answers[r] || ""}
                            onChange={(e) => updateAnswer(q.idx, r, e.target.value)}
                            rows={3}
                          />
                        </div>
                      ))}
                    {q.status === "toask" ? (
                      <button
                        className="generator-button"
                        onClick={() => markAsked(q.idx)}
                      >
                        Ask
                      </button>
                    ) : (
                      <button
                        className="generator-button secondary"
                        onClick={() => moveToToAsk(q.idx)}
                      >
                        Move to To Ask
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
      </div>
      {showSummary && (
        <div className="modal-overlay" onClick={() => setShowSummary(false)}>
          <div className="initiative-card modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Summary</h3>
            <p>{summary}</p>
            <button className="generator-button" onClick={() => setShowSummary(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DiscoveryHub;

