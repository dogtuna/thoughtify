import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";

const sampleProjects = ["Project Alpha", "Project Beta"];

export default function NavBar() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [projectMenu, setProjectMenu] = useState(false);
  const [addMenu, setAddMenu] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setLoggedIn(!!user);
    });
    return () => unsubscribe();
  }, []);

  return (
    <header className="glass-header" data-header>
      <nav className="nav-container">
        <div className="left-nav">
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
          </div>
          {loggedIn && (
            <>
              <div className="project-switcher">
                <button type="button" onClick={() => setProjectMenu(!projectMenu)}>
                  Projects
                </button>
                {projectMenu && (
                  <ul className="dropdown">
                    <li>Add New Project</li>
                    {sampleProjects.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="search-bar">
                <input type="text" placeholder="Search projects" />
              </div>
              <div className="add-menu">
                <button type="button" onClick={() => setAddMenu(!addMenu)}>
                  ADD +
                </button>
                {addMenu && (
                  <ul className="dropdown">
                    <li>Question</li>
                    <li>Document</li>
                    <li>Hypothesis</li>
                    <li>Task</li>
                    <li>Update</li>
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
        <div className="user-actions">
          {loggedIn && (
            <>
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
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
