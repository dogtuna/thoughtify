import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { auth } from "../firebase";
import { loadInitiatives } from "../utils/initiatives";
import UserSettingsSlideOver from "./UserSettingsSlideOver";

export default function NavBar() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [projectMenu, setProjectMenu] = useState(false);
  const [addMenu, setAddMenu] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projects, setProjects] = useState([]);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const initiativeId = searchParams.get("initiativeId");
  const activeProject = projects.find((p) => p.id === initiativeId);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        try {
          // Ensure the session is valid before rendering signed-in UI
          await u.getIdToken();
          setLoggedIn(true);
          setUser(u);
          const data = await loadInitiatives(u.uid);
          setProjects(data);
        } catch (e) {
          console.warn("Auth token check failed; treating as logged out.", e);
          setLoggedIn(false);
          setUser(null);
          setProjects([]);
        }
      } else {
        setLoggedIn(false);
        setUser(null);
        setProjects([]);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handler = () => setSettingsOpen(true);
    window.addEventListener("openUserSettings", handler);
    return () => window.removeEventListener("openUserSettings", handler);
  }, []);

  useEffect(() => {
    const handleProfileUpdated = async () => {
      try {
        // Reload current user to pick up latest photoURL/displayName
        if (auth.currentUser) {
          await auth.currentUser.reload();
          setUser({ ...auth.currentUser });
        }
      } catch {}
    };
    window.addEventListener("userProfileUpdated", handleProfileUpdated);
    return () => window.removeEventListener("userProfileUpdated", handleProfileUpdated);
  }, []);

  const initials = useMemo(() => {
    const name = user?.displayName || "";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0];
    const last = parts.length > 1 ? parts[parts.length - 1][0] : (user?.email?.[0] || "");
    const letters = ((first || "").toUpperCase() + (last || "").toUpperCase()).slice(0, 2) || "U";
    return letters;
  }, [user]);

  const avatarSrc = useMemo(() => {
    if (user?.photoURL) return user.photoURL;
    return `https://placehold.co/40x40/764ba2/FFFFFF?text=${encodeURIComponent(initials)}`;
  }, [user, initials]);

  const handleAddProject = () => {
    const newId = crypto.randomUUID();
    navigate(`/project-setup?initiativeId=${newId}`);
    setProjectMenu(false);
  };

  const handleSelectProject = (id) => {
    navigate(`/discovery?initiativeId=${id}`);
    setProjectMenu(false);
  };

  const goToDiscoverySection = (section) => {
    // If we have an initiative, go straight to the desired section in Discovery
    if (initiativeId) {
      const base = `/discovery?initiativeId=${initiativeId}`;
      const url = section ? `${base}&section=${section}` : base;
      navigate(url);
      setAddMenu(false);
      return;
    }
    // Otherwise, guide user to create/select a project first
    handleAddProject();
    setAddMenu(false);
  };

  const handleAddQuestion = () => {
    if (initiativeId) {
      navigate(`/discovery?initiativeId=${initiativeId}&section=questions&new=question`);
      setAddMenu(false);
    } else {
      handleAddProject();
      setAddMenu(false);
    }
  };
  const handleAddDocument = () => goToDiscoverySection("documents");
  const handleAddTask = () => {
    if (initiativeId) {
      navigate(`/discovery?initiativeId=${initiativeId}&section=tasks&new=task`);
      setAddMenu(false);
    } else {
      handleAddProject();
      setAddMenu(false);
    }
  };
  const handleAddHypothesis = () => {
    if (initiativeId) {
      navigate(`/inquiry-map?initiativeId=${initiativeId}&new=hypothesis`);
      setAddMenu(false);
    } else {
      handleAddProject();
      setAddMenu(false);
    }
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
            {!loggedIn && (
              <Link to="/" className="logo-text" aria-label="Thoughtify Home">
                THOUGHTIFY
              </Link>
            )}
            {loggedIn && (
              <Link to="/dashboard" className="logo-text" aria-label="Dashboard">
                THOUGHTIFY
              </Link>
            )}
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
                    <li>
                      <button type="button" onClick={handleAddQuestion}>Question</button>
                    </li>
                    <li>
                      <button type="button" onClick={handleAddDocument}>Document</button>
                    </li>
                    <li>
                      <button type="button" onClick={handleAddHypothesis}>Hypothesis</button>
                    </li>
                    <li>
                      <button type="button" onClick={handleAddTask}>Task</button>
                    </li>
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
        <div className="user-actions">
          {loggedIn && (
            <>
              <img
                src={avatarSrc}
                alt="User Avatar"
                className="user-avatar"
                onClick={() => setSettingsOpen(true)}
              />
            </>
          )}
        </div>
      </nav>
      {settingsOpen && (
        <UserSettingsSlideOver onClose={() => setSettingsOpen(false)} />
      )}
    </header>
  );
}
