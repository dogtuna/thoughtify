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

const DiscoveryHub = () => {
  const [searchParams] = useSearchParams();
  const initiativeId = searchParams.get("initiativeId");
  const [questions, setQuestions] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [filterRole, setFilterRole] = useState("");
  const [selected, setSelected] = useState([]);
  const [uid, setUid] = useState(null);
  const [loaded, setLoaded] = useState(false);

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
          const qs = (init?.clarifyingQuestions || []).map((q, idx) => ({
            ...q,
            contact: init?.clarifyingContacts?.[idx] || "",
            answer: init?.clarifyingAnswers?.[idx] || "",
            status: init?.clarifyingAnswers?.[idx] ? "answered" : "toask",
            id: idx,
          }));
          setQuestions(qs);
        }
        setLoaded(true);
      } else {
        setLoaded(true);
      }
    });
    return () => unsubscribe();
  }, [initiativeId]);

  const updateAnswer = (idx, value) => {
    setQuestions((prev) => {
      const updated = [...prev];
      updated[idx].answer = value;
      updated[idx].status = value ? "answered" : updated[idx].status;
      return updated;
    });
    if (uid) {
      const answers = questions.map((q, i) => (i === idx ? value : q.answer));
      saveInitiative(uid, initiativeId, { clarifyingAnswers: answers });
    }
  };

  const updateContact = (idx, value) => {
    setQuestions((prev) => {
      const updated = [...prev];
      updated[idx].contact = value;
      return updated;
    });
    if (uid) {
      const contactsArr = questions.map((q, i) => (i === idx ? value : q.contact));
      saveInitiative(uid, initiativeId, { clarifyingContacts: contactsArr });
    }
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

  const handleContactChange = (idx, value) => {
    if (value === "__add__") {
      const newRole = addContact();
      if (newRole) updateContact(idx, newRole);
    } else {
      updateContact(idx, value);
    }
  };

  const markAsked = (idxs) => {
    const indices = Array.isArray(idxs) ? idxs : [idxs];
    const texts = [];
    setQuestions((prev) => {
      const updated = [...prev];
      indices.forEach((i) => {
        updated[i].status = "asked";
        texts.push(updated[i].question);
      });
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
      updated[idx].status = "toask";
      updated[idx].answer = "";
      return updated;
    });
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

  const toAsk = questions
    .map((q, idx) => ({ ...q, idx }))
    .filter(
      (q) =>
        q.status === "toask" && (!filterRole || q.contact === filterRole)
    );
  const asked = questions
    .map((q, idx) => ({ ...q, idx }))
    .filter(
      (q) =>
        q.status === "asked" && !q.answer && (!filterRole || q.contact === filterRole)
    );
  const answered = questions
    .map((q, idx) => ({ ...q, idx }))
    .filter((q) => q.answer && (!filterRole || q.contact === filterRole));

  return (
    <div className="dashboard-container discovery-hub">
      <h2>Discovery Hub</h2>
      <div className="filter-bar">
        <label>
          Filter by role:
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
          >
            <option value="">All</option>
            {contacts.map((c) => (
              <option key={c.role} value={c.role}>
                {c.role}
              </option>
            ))}
          </select>
        </label>
        <button className="generator-button" onClick={addContact}>
          Add Contact
        </button>
      </div>
      <div className="columns">
        <div className="column">
          <h3>To Ask</h3>
          {selected.length > 0 && (
            <button className="generator-button ask-selected" onClick={askSelected}>
              Ask Selected
            </button>
          )}
          {toAsk.map((q) => (
            <div key={q.idx} className="initiative-card question-card">
              <div className="question-header">
                <input
                  type="checkbox"
                  checked={selected.includes(q.idx)}
                  onChange={() => toggleSelect(q.idx)}
                />
                <p>{q.question}</p>
              </div>
              <div className="contact-row">
                <span
                  className="contact-tag"
                  style={{ backgroundColor: getColor(q.contact) }}
                >
                  {q.contact || "Unassigned"}
                </span>
                <select
                  className="contact-select"
                  value={q.contact}
                  onChange={(e) => handleContactChange(q.idx, e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {contacts.map((c) => (
                    <option key={c.role} value={c.role}>
                      {c.role}
                    </option>
                  ))}
                  <option value="__add__">Add New Contact</option>
                </select>
              </div>
              <button
                className="generator-button"
                onClick={() => markAsked(q.idx)}
              >
                Ask
              </button>
            </div>
          ))}
        </div>
        <div className="column">
          <h3>Asked</h3>
          {asked.map((q) => (
            <div key={q.idx} className="initiative-card question-card">
              <p>{q.question}</p>
              <div className="contact-row">
                <span
                  className="contact-tag"
                  style={{ backgroundColor: getColor(q.contact) }}
                >
                  {q.contact || "Unassigned"}
                </span>
                <select
                  className="contact-select"
                  value={q.contact}
                  onChange={(e) => handleContactChange(q.idx, e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {contacts.map((c) => (
                    <option key={c.role} value={c.role}>
                      {c.role}
                    </option>
                  ))}
                  <option value="__add__">Add New Contact</option>
                </select>
              </div>
              <textarea
                className="generator-input"
                placeholder="Paste Answer/Notes Here"
                value={q.answer}
                onChange={(e) => updateAnswer(q.idx, e.target.value)}
                rows={3}
              />
              <button
                className="generator-button secondary"
                onClick={() => moveToToAsk(q.idx)}
              >
                Move to To Ask
              </button>
            </div>
          ))}
        </div>
        <div className="column">
          <h3>Answered</h3>
          {answered.map((q) => (
            <div key={q.idx} className="initiative-card question-card answered">
              <p>{q.question}</p>
              <div className="contact-row">
                <span
                  className="contact-tag"
                  style={{ backgroundColor: getColor(q.contact) }}
                >
                  {q.contact || "Unassigned"}
                </span>
                <select
                  className="contact-select"
                  value={q.contact}
                  onChange={(e) => handleContactChange(q.idx, e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {contacts.map((c) => (
                    <option key={c.role} value={c.role}>
                      {c.role}
                    </option>
                  ))}
                  <option value="__add__">Add New Contact</option>
                </select>
              </div>
              <p className="answer">{q.answer}</p>
              <button
                className="generator-button secondary"
                onClick={() => moveToToAsk(q.idx)}
              >
                Move to To Ask
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DiscoveryHub;

