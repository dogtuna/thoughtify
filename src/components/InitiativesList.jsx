import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../firebase.js";
import { loadInitiatives } from "../utils/initiatives.js";
import "./AIToolsGenerators.css";

const InitiativesList = () => {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    loadInitiatives(uid)
      .then((data) => setItems(data))
      .catch((err) => console.error("Error loading initiatives:", err));
  }, []);

  const navigate = useNavigate();
  const handleNew = () => {
    const newId = crypto.randomUUID();
    navigate(`/ai-tools/initiatives?initiativeId=${newId}`);
  };

  return (
    <div className="generator-container">
      <h2>Your Initiatives</h2>
      <button onClick={handleNew} className="generator-button">New Initiative</button>
      <ul>
        {items.map((init) => (
          <li key={init.id}>
            <Link to={`/ai-tools/initiatives?initiativeId=${init.id}`}>
              {init.businessGoal || init.id}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default InitiativesList;
