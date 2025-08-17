import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";

// src/components/NavBar.jsx
// Updated header component using glass effect and profile actions

const NavBar = () => {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setLoggedIn(!!user);
    });
    return () => unsubscribe();
  }, []);

  return (
    <header className="glass-header">
      <nav className="nav-container">
        <div className="logo-section">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="logo-icon"
          >
            <path d="m5 3 2.5 4L10 3" />
            <path d="M14 3s2.5 4 2.5 4L19 3" />
            <path d="M12 22v-8" />
            <path d="M8.5 11l-3-3" />
            <path d="M15.5 11l3-3" />
          </svg>
          <span className="logo-text">Thoughtify</span>
        </div>

        <div className="nav-links">
          <Link to={loggedIn ? "/dashboard" : "/"} className="nav-link active">
            Home
          </Link>
          <Link to="/ai-tools" className="nav-link">
            Tools
          </Link>
          <Link to="/tasks" className="nav-link">
            Tasks
          </Link>
          <Link to="#" className="nav-link">
            Projects
          </Link>
          <Link to="/settings" className="nav-link">
            Settings
          </Link>
        </div>

        <div className="user-actions">
          <button className="notification-btn" type="button">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            <span className="indicator" />
          </button>
          <img
            src="https://placehold.co/40x40/764ba2/FFFFFF?text=ID"
            alt="User Avatar"
            className="user-avatar"
          />
        </div>
      </nav>
    </header>
  );
};

export default NavBar;
