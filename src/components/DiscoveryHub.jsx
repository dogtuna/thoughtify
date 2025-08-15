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
            question: typeof q === "string" ? q : q.question,
            contacts: init?.clarifyingContacts?.[idx] || q.stakeholders || [],
            answers: init?.clarifyingAnswers?.[idx] || {},
            asked: init?.clarifyingAsked?.[idx] || false,
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

  const tasks = [];
  questions.forEach((q, idx) => {
    const roles = q.contacts.length ? q.contacts : ["Unassigned"];
    roles.forEach((role) => {
      const allAnswered =
        q.contacts.length && q.contacts.every((r) => (q.answers[r] || "").trim());
      const status = !q.asked
        ? "toask"
        : allAnswered
        ? "answered"
        : "asked";
      tasks.push({ ...q, idx, role, contactAnswer: q.answers[role] || "", status });
    });
  });

  const toAsk = tasks.filter(
    (t) => t.status === "toask" && (!filterRole || t.role === filterRole)
  );
  const asked = tasks.filter(
    (t) => t.status === "asked" && (!filterRole || t.role === filterRole)
  );
  const answered = tasks.filter(
    (t) => t.status === "answered" && (!filterRole || t.role === filterRole)
  );

  const groupByRole = (arr) => {
    const groups = {};
    arr.forEach((t) => {
      groups[t.role] = groups[t.role] || [];
      groups[t.role].push(t);
    });
    return groups;
  };

  const groupedToAsk = groupByRole(toAsk);
  const groupedAsked = groupByRole(asked);
  const groupedAnswered = groupByRole(answered);

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
          {Object.entries(groupedToAsk).map(([role, items]) => (
            <div key={role} className="role-group">
              <h4>{role}</h4>
              {items.map((q) => (
                <div
                  key={`${q.idx}-${role}`}
                  className="initiative-card question-card"
                >
                  <div className="question-header">
                    <input
                      type="checkbox"
                      checked={selected.includes(q.idx)}
                      onChange={() => toggleSelect(q.idx)}
                    />
                    <p>{q.question}</p>
                  </div>
                  <div className="contact-row">
                    {q.contacts.map((r) => (
                      <span
                        key={r}
                        className="contact-tag"
                        style={{ backgroundColor: getColor(r) }}
                      >
                        {r}
                        <button
                          onClick={() => removeContactFromQuestion(q.idx, r)}
                        >
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
                  <button
                    className="generator-button"
                    onClick={() => markAsked(q.idx)}
                  >
                    Ask
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="column">
          <h3>Asked</h3>
          {Object.entries(groupedAsked).map(([role, items]) => (
            <div key={role} className="role-group">
              <h4>{role}</h4>
              {items.map((q) => (
                <div
                  key={`${q.idx}-${role}`}
                  className="initiative-card question-card"
                >
                  <p>{q.question}</p>
                  <div className="contact-row">
                    <span
                      className="contact-tag"
                      style={{ backgroundColor: getColor(role) }}
                    >
                      {role}
                    </span>
                  </div>
                  <textarea
                    className="generator-input"
                    placeholder="Paste Answer/Notes Here"
                    value={q.contactAnswer}
                    onChange={(e) => updateAnswer(q.idx, role, e.target.value)}
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
          ))}
        </div>
        <div className="column">
          <h3>Answered</h3>
          {Object.entries(groupedAnswered).map(([role, items]) => (
            <div key={role} className="role-group">
              <h4>{role}</h4>
              {items.map((q) => (
                <div
                  key={`${q.idx}-${role}`}
                  className="initiative-card question-card answered"
                >
                  <p>{q.question}</p>
                  <div className="contact-row">
                    <span
                      className="contact-tag"
                      style={{ backgroundColor: getColor(role) }}
                    >
                      {role}
                    </span>
                  </div>
                  <p className="answer">{q.contactAnswer}</p>
                  <button
                    className="generator-button secondary"
                    onClick={() => moveToToAsk(q.idx)}
                  >
                    Move to To Ask
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DiscoveryHub;

