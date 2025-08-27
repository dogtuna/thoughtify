import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useNavigate, useSearchParams } from "react-router-dom";
import { auth } from "../firebase";
import { loadInitiatives } from "../utils/initiatives";

export default function NavBar() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [projectMenu, setProjectMenu] = useState(false);
  const [addMenu, setAddMenu] = useState(false);
  const [projects, setProjects] = useState([]);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const initiativeId = searchParams.get("initiativeId");
  const activeProject = projects.find((p) => p.id === initiativeId);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoggedIn(!!user);
      if (user) {
        const data = await loadInitiatives(user.uid);
        setProjects(data);
      } else {
        setProjects([]);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleAddProject = () => {
    const newId = crypto.randomUUID();
    navigate(`/project-setup?initiativeId=${newId}`);
    setProjectMenu(false);
  };

  const handleSelectProject = (id) => {
    navigate(`/discovery?initiativeId=${id}`);
    setProjectMenu(false);
  };

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
                <span>Project:</span>
                <button type="button" onClick={() => setProjectMenu(!projectMenu)}>
                  {activeProject
                    ? activeProject.projectName ||
                      activeProject.businessGoal ||
                      activeProject.id
                    : "Select or Add"}
                </button>
                {projectMenu && (
                  <ul className="dropdown">
                    <li>
                      <button type="button" onClick={handleAddProject}>
                        Add New Project
                      </button>
                    </li>
                    {projects.map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => handleSelectProject(p.id)}>
                          {p.projectName || p.businessGoal || p.id}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="search-bar">
                <input type="text" placeholder="Search projects" />
                <button type="button">Search</button>
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
