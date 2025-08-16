import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, functions } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
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
  const [selectMode, setSelectMode] = useState(false);
  const [uid, setUid] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState("questions");
  const [summary, setSummary] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [menu, setMenu] = useState(null);
  const [focusRole, setFocusRole] = useState("");
  const [editData, setEditData] = useState(null);
  const [emailConnected, setEmailConnected] = useState(false);
  const navigate = useNavigate();

  const draftEmail = async (q) => {
    if (!emailConnected) {
      if (window.confirm("Connect your Gmail account in settings?")) {
        navigate("/settings");
      }
      return;
    }
    if (!auth.currentUser) {
      alert("Please log in to draft emails.");
      return;
    }
    try {
      const idToken = await auth.currentUser.getIdToken(true);
      const callable = httpsCallable(functions, "sendQuestionEmail");
      await callable({
        provider: "gmail",
        recipientEmail: auth.currentUser.email || "",
        subject: q.question,
        message: q.question,
        questionId: q.id ?? q.idx,
        draft: true,
        idToken,
      });
      alert("Draft created in Gmail");
    } catch (err) {
      console.error("draftEmail error", err);
      alert("Error drafting email");
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUid(user.uid);
        const tokenSnap = await getDoc(
          doc(db, "users", user.uid, "emailTokens", "gmail")
        );
        setEmailConnected(tokenSnap.exists());
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
            const names = normalizeContacts(contactValue).map((c) => {
              const match = contactsInit.find(
                (k) => k.role === c || k.name === c
              );
              return match?.name || c;
            });
            const askedData = init?.clarifyingAsked?.[idx] || {};
            const asked = {};
            names.forEach((n) => {
              if (typeof askedData === "object") {
                asked[n] = !!askedData[n];
              } else {
                asked[n] = !!askedData;
              }
            });
            return {
              question: typeof q === "string" ? q : q.question,
              contacts: names,
              answers: init?.clarifyingAnswers?.[idx] || {},
              asked,
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

  const updateAnswer = (idx, name, value) => {
    setQuestions((prev) => {
      const updated = [...prev];
      const q = updated[idx];
      q.answers = { ...q.answers, [name]: value };
      if (value && !q.asked[name]) {
        q.asked[name] = true;
      }
      if (uid) {
        saveInitiative(uid, initiativeId, {
          clarifyingAnswers: updated.map((qq) => qq.answers),
          clarifyingAsked: updated.map((qq) => qq.asked),
        });
      }
      return updated;
    });
  };

  const addContact = () => {
    const name = prompt("Contact name?");
    if (!name) return null;
    const role = prompt("Contact role? (optional)") || "";
    const color = colorPalette[contacts.length % colorPalette.length];
    const newContact = { role, name, color };
    const updated = [...contacts, newContact];
    setContacts(updated);
    if (uid) {
      saveInitiative(uid, initiativeId, {
        keyContacts: updated.map(({ name, role }) => ({ name, role })),
      });
    }
    return name;
  };

  const addContactToQuestion = (idx, name) => {
    setQuestions((prev) => {
      const updated = [...prev];
      const q = updated[idx];
      if (!q.contacts.includes(name)) {
        q.contacts = [...q.contacts, name];
        q.asked = { ...q.asked, [name]: false };
      }
      if (uid) {
        saveInitiative(uid, initiativeId, {
          clarifyingContacts: Object.fromEntries(
            updated.map((qq, i) => [i, qq.contacts])
          ),
          clarifyingAsked: updated.map((qq) => qq.asked),
        });
      }
      return updated;
    });
  };

  const removeContactFromQuestion = (idx, name) => {
    setQuestions((prev) => {
      const updated = [...prev];
      const q = updated[idx];
      q.contacts = q.contacts.filter((r) => r !== name);
      if (q.answers[name]) {
        delete q.answers[name];
      }
      if (q.asked[name] !== undefined) {
        delete q.asked[name];
      }
      if (uid) {
        saveInitiative(uid, initiativeId, {
          clarifyingContacts: Object.fromEntries(
            updated.map((qq, i) => [i, qq.contacts])
          ),
          clarifyingAnswers: updated.map((qq) => qq.answers),
          clarifyingAsked: updated.map((qq) => qq.asked),
        });
      }
      return updated;
    });
  };

  const handleContactSelect = (idx, value) => {
    if (value === "__add__") {
      const newName = addContact();
      if (newName) addContactToQuestion(idx, newName);
    } else if (value) {
      addContactToQuestion(idx, value);
    }
  };

  const markAsked = (idx, names = []) => {
    const text = questions[idx]?.question || "";
    setQuestions((prev) => {
      const updated = [...prev];
      const q = updated[idx];
      const targets = names.length ? names : q.contacts;
      targets.forEach((n) => {
        q.asked[n] = true;
      });
      if (uid) {
        saveInitiative(uid, initiativeId, {
          clarifyingAsked: updated.map((qq) => qq.asked),
        });
      }
      return updated;
    });
    return text;
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

  const toggleSelect = (key) => {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((i) => i !== key) : [...prev, key]
    );
  };

  const askSelected = () => {
    if (!selected.length) return;
    const selections = selected.map((k) => {
      const parts = k.split("|");
      return {
        idx: parseInt(parts[0], 10),
        names: parts[2] ? parts[2].split(",") : [],
      };
    });
    const texts = selections.map((s) => markAsked(s.idx, s.names));
    if (navigator.clipboard && texts.length) {
      navigator.clipboard.writeText(texts.join("\n\n"));
    }
    setSelected([]);
  };

  const sortUnassignedFirst = (arr) =>
    arr.sort((a, b) => {
      const aUn = a.contacts.length === 0;
      const bUn = b.contacts.length === 0;
      if (aUn && !bUn) return -1;
      if (!aUn && bUn) return 1;
      return a.idx - b.idx;
    });

  const getColor = (name) =>
    contacts.find((c) => c.name === name)?.color || "#e9ecef";

  const openContextMenu = (e, name, idx) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, name, idx });
  };

  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const startEditContact = (name) => {
    const contact = contacts.find((c) => c.name === name);
    if (!contact) return;
    setEditData({ original: name, name: contact.name, role: contact.role });
  };

  const saveEditContact = () => {
    if (!editData) return;
    const { original, name, role } = editData;
    const idx = contacts.findIndex((c) => c.name === original);
    if (idx === -1) return;
    const updatedContacts = contacts.map((c, i) =>
      i === idx ? { ...c, name, role } : c
    );
    const updatedQuestions = questions.map((q) => {
      const newContacts = q.contacts.map((n) => (n === original ? name : n));
      const newAnswers = {};
      Object.entries(q.answers).forEach(([n, v]) => {
        newAnswers[n === original ? name : n] = v;
      });
      const newAsked = {};
      Object.entries(q.asked).forEach(([n, v]) => {
        newAsked[n === original ? name : n] = v;
      });
      return { ...q, contacts: newContacts, answers: newAnswers, asked: newAsked };
    });
    setContacts(updatedContacts);
    setQuestions(updatedQuestions);
    if (uid) {
      saveInitiative(uid, initiativeId, {
        keyContacts: updatedContacts.map(({ name, role }) => ({ name, role })),
        clarifyingContacts: Object.fromEntries(
          updatedQuestions.map((qq, i) => [i, qq.contacts])
        ),
        clarifyingAnswers: updatedQuestions.map((qq) => qq.answers),
        clarifyingAsked: updatedQuestions.map((qq) => qq.asked),
      });
    }
    setEditData(null);
  };

  if (!loaded) {
    return (
      <div className="dashboard-container">
        <h2>Loading...</h2>
      </div>
    );
  }
  const statusLabel = (s) =>
    s === "toask" ? "To Ask" : s === "asked" ? "Asked" : "Answered";

  const items = [];
  questions.forEach((q, idx) => {
    const toAskNames = q.contacts.filter((n) => !q.asked[n]);
    if (toAskNames.length || q.contacts.length === 0) {
      items.push({ ...q, idx, contacts: toAskNames, status: "toask" });
    }
    const askedNames = q.contacts.filter(
      (n) => q.asked[n] && !(q.answers[n] || "").trim()
    );
    if (askedNames.length) {
      items.push({ ...q, idx, contacts: askedNames, status: "asked" });
    }
    const answeredNames = q.contacts.filter((n) => (q.answers[n] || "").trim());
    if (answeredNames.length) {
      items.push({ ...q, idx, contacts: answeredNames, status: "answered" });
    }
  });

  let filtered = items.filter(
    (q) =>
      (!contactFilter || q.contacts.includes(contactFilter)) &&
      (!statusFilter || q.status === statusFilter)
  );
  sortUnassignedFirst(filtered);

  let grouped = { All: filtered };
  if (groupBy === "contact") {
    grouped = {};
    filtered.forEach((q) => {
      const names = q.contacts.length ? q.contacts : ["Unassigned"];
      names.forEach((n) => {
        const qCopy = { ...q, contacts: [n] };
        grouped[n] = grouped[n] || [];
        grouped[n].push(qCopy);
      });
    });
    const ordered = {};
    if (grouped["Unassigned"]) {
      ordered["Unassigned"] = sortUnassignedFirst(grouped["Unassigned"]);
      delete grouped["Unassigned"];
    }
    Object.keys(grouped)
      .sort()
      .forEach((k) => {
        ordered[k] = sortUnassignedFirst(grouped[k]);
      });
    grouped = ordered;
  } else if (groupBy === "role") {
    grouped = {};
    filtered.forEach((q) => {
      const roles = q.contacts.length
        ? q.contacts.map(
            (n) => contacts.find((c) => c.name === n)?.role || "No Role"
          )
        : ["Unassigned"];
      const uniqueRoles = Array.from(new Set(roles));
      uniqueRoles.forEach((r) => {
        const label = r && r !== "" ? r : "No Role";
        const namesForRole = q.contacts.filter(
          (n) => (contacts.find((c) => c.name === n)?.role || "No Role") === r
        );
        const qCopy = { ...q, contacts: namesForRole };
        grouped[label] = grouped[label] || [];
        grouped[label].push(qCopy);
      });
    });
    const ordered = {};
    if (grouped["Unassigned"]) {
      ordered["Unassigned"] = sortUnassignedFirst(grouped["Unassigned"]);
      delete grouped["Unassigned"];
    }
    if (focusRole && grouped[focusRole]) {
      ordered[focusRole] = sortUnassignedFirst(grouped[focusRole]);
      delete grouped[focusRole];
    }
    Object.keys(grouped)
      .sort()
      .forEach((k) => {
        ordered[k] = sortUnassignedFirst(grouped[k]);
      });
    grouped = ordered;
  } else if (groupBy === "status") {
    grouped = {};
    filtered.forEach((q) => {
      const label = statusLabel(q.status);
      grouped[label] = grouped[label] || [];
      grouped[label].push(q);
    });
    Object.keys(grouped).forEach((k) => sortUnassignedFirst(grouped[k]));
  } else {
    grouped["All"] = sortUnassignedFirst(grouped["All"]);
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
                    <option key={c.name} value={c.name}>
                      {c.name}
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
                  <option value="role">Role</option>
                  <option value="status">Status</option>
                </select>
              </label>
              <button
                className="generator-button"
                onClick={() => {
                  setSelectMode((s) => !s);
                  if (selectMode) setSelected([]);
                }}
              >
                {selectMode ? "Cancel" : "Select"}
              </button>
              <button className="generator-button" onClick={addContact}>
                Add Contact
              </button>
              {selectMode && selected.length > 0 && (
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
                {items.map((q) => {
                  const selKey = `${q.idx}|${q.status}|${q.contacts.join(',')}`;
                  return (
                  <div
                    key={selKey}
                    className={`initiative-card question-card ${q.status}`}
                  >
                    <div className="contact-row">
                      {q.contacts.map((name) => (
                        <span
                          key={name}
                          className="contact-tag"
                          style={{ backgroundColor: getColor(name) }}
                          onClick={(e) => openContextMenu(e, name, q.idx)}
                        >
                          {name}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeContactFromQuestion(q.idx, name);
                            }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      <button
                        className="add-contact-btn"
                        onClick={() =>
                          setOpenDropdown((d) => (d === q.idx ? null : q.idx))
                        }
                      >
                        +
                      </button>
                      {openDropdown === q.idx && (
                        <select
                          className="contact-select"
                          value=""
                          onChange={(e) => {
                            handleContactSelect(q.idx, e.target.value);
                            setOpenDropdown(null);
                          }}
                        >
                          <option value="">Select Contact</option>
                          {contacts
                            .filter((c) => !q.contacts.includes(c.name))
                            .map((c) => (
                              <option key={c.name} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                          <option value="__add__">Add New Contact</option>
                        </select>
                      )}
                    </div>
                    <div className="question-header">
                      {selectMode && (
                        <input
                          type="checkbox"
                          checked={selected.includes(selKey)}
                          onChange={() => toggleSelect(selKey)}
                        />
                      )}
                      <p>{q.question}</p>
                      <span className="status-tag">{statusLabel(q.status)}</span>
                      <button
                        className="draft-email-btn"
                        onClick={() => draftEmail(q)}
                      >
                        Draft Email
                      </button>
                    </div>
                    {q.status !== "toask" &&
                      q.contacts.map((name) => (
                        <div key={name} className="answer-block">
                          <strong>{name}:</strong>
                          <textarea
                            className="generator-input"
                            placeholder="Paste Answer/Notes Here"
                            value={q.answers[name] || ""}
                            onChange={(e) => updateAnswer(q.idx, name, e.target.value)}
                            rows={3}
                          />
                        </div>
                      ))}
                  </div>
                );
                })}
              </div>
            ))}
          </>
        )}
      </div>
      {menu && (
        <ul
          className="contact-menu"
          style={{ top: menu.y, left: menu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <li
            onClick={() => {
              startEditContact(menu.name);
              setMenu(null);
            }}
          >
            Edit
          </li>
          <li
            onClick={() => {
              const text = markAsked(menu.idx, [menu.name]);
              if (navigator.clipboard && text) {
                navigator.clipboard.writeText(text);
              }
              setMenu(null);
            }}
          >
            Ask
          </li>
          <li
            onClick={() => {
              setContactFilter(menu.name);
              setMenu(null);
            }}
          >
            Filter
          </li>
            <li
              onClick={() => {
                const role =
                  contacts.find((c) => c.name === menu.name)?.role || "No Role";
                setGroupBy("role");
                setFocusRole(role);
                setMenu(null);
              }}
            >
              Group
            </li>
        </ul>
      )}
      {editData && (
        <div className="modal-overlay" onClick={() => setEditData(null)}>
          <div
            className="initiative-card modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Edit Contact</h3>
            <label>
              Name:
              <input
                className="generator-input"
                value={editData.name}
                onChange={(e) =>
                  setEditData((d) => ({ ...d, name: e.target.value }))
                }
              />
            </label>
            <label>
              Role:
              <input
                className="generator-input"
                value={editData.role}
                onChange={(e) =>
                  setEditData((d) => ({ ...d, role: e.target.value }))
                }
              />
            </label>
            <div className="modal-actions">
              <button className="generator-button" onClick={saveEditContact}>
                Save
              </button>
              <button
                className="generator-button"
                onClick={() => setEditData(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
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

