import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import { loadInitiative, saveInitiative } from "../utils/initiatives";
import "./AIToolsGenerators.css";
import "./DiscoveryHub.css";

const DiscoveryHub = () => {
  const [searchParams] = useSearchParams();
  const initiativeId = searchParams.get("initiativeId");
  const [questions, setQuestions] = useState([]);
  const [uid, setUid] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUid(user.uid);
        if (initiativeId) {
          const init = await loadInitiative(user.uid, initiativeId);
          const qs = (init?.clarifyingQuestions || []).map((q, idx) => ({
            ...q,
            answer: init?.clarifyingAnswers?.[idx] || "",
            status: init?.clarifyingAnswers?.[idx] ? "answered" : "toask",
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

  const markAsked = (idx) => {
    setQuestions((prev) => {
      const updated = [...prev];
      updated[idx].status = "asked";
      return updated;
    });
    if (navigator.clipboard) {
      navigator.clipboard.writeText(questions[idx].question);
    }
  };

  if (!loaded) {
    return (
      <div className="dashboard-container">
        <h2>Loading...</h2>
      </div>
    );
  }

  const toAsk = questions.filter((q) => q.status === "toask");
  const asked = questions.filter((q) => q.status === "asked" && !q.answer);
  const answered = questions.filter((q) => q.answer);

  return (
    <div className="dashboard-container discovery-hub">
      <h2>Discovery Hub</h2>
      <div className="columns">
        <div className="column">
          <h3>To Ask</h3>
          {toAsk.map((q, idx) => (
            <div key={idx} className="initiative-card question-card">
              <p>{q.question}</p>
              <button className="generator-button" onClick={() => markAsked(questions.indexOf(q))}>
                Ask
              </button>
            </div>
          ))}
        </div>
        <div className="column">
          <h3>Asked</h3>
          {asked.map((q, idx) => {
            const qIndex = questions.indexOf(q);
            return (
              <div key={idx} className="initiative-card question-card">
                <p>{q.question}</p>
                <textarea
                  className="generator-input"
                  placeholder="Paste Answer/Notes Here"
                  value={q.answer}
                  onChange={(e) => updateAnswer(qIndex, e.target.value)}
                  rows={3}
                />
              </div>
            );
          })}
        </div>
        <div className="column">
          <h3>Answered</h3>
          {answered.map((q, idx) => (
            <div key={idx} className="initiative-card question-card answered">
              <p>{q.question}</p>
              <p className="answer">{q.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DiscoveryHub;

