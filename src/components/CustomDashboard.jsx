// src/CustomDashboard.jsx

import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { app, auth } from "../firebase";
import AccountCreation from "./AccountCreation";
import {
  loadInitiatives,
  deleteInitiative,
} from "../utils/initiatives";
import "./AIToolsGenerators.css";
import "./CustomDashboard.css";

const CustomDashboard = () => {
  const [searchParams] = useSearchParams();
  const invitationCode = searchParams.get("invite");
  const [, setDisplayName] = useState("");
  const [dataLoaded, setDataLoaded] = useState(false);
  const [error, setError] = useState("");
  const [userLoggedIn, setUserLoggedIn] = useState(false);
  const [initiatives, setInitiatives] = useState([]);
  const [uid, setUid] = useState(null);
  const navigate = useNavigate();
  const db = getFirestore(app);

  // Helper function: retry fetching the profile document.
  const fetchProfileWithRetry = async (uid, attempts = 0) => {
    const maxAttempts = 5;
    const delay = 1000; // 1 second delay
    const profileRef = doc(db, "profiles", uid);
    const profileSnap = await getDoc(profileRef);
    if (profileSnap.exists()) {
      return profileSnap.data();
    } else if (attempts < maxAttempts) {
      // Wait for a bit and try again.
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchProfileWithRetry(uid, attempts + 1);
    } else {
      throw new Error("Profile document not found after multiple attempts");
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setUserLoggedIn(false);
        setDataLoaded(true);
      } else {
        setUserLoggedIn(true);
        setUid(user.uid);
        try {
          if (invitationCode) {
            // Try to fetch the invitation document by invitationCode.
            const invRef = collection(db, "invitations");
            const q = query(invRef, where("invitationCode", "==", invitationCode));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
              const docData = querySnapshot.docs[0].data();
              console.log("Fetched invitation data:", docData);
              // If the invitation is unused or not started, use its businessName.
              if (docData.status === "unused" || docData.status === "not started") {
                setDisplayName(docData.businessName || "Your Business");
                setDataLoaded(true);
                return;
              }
            }
          }
          // Fallback: fetch the profile document using the user's UID with a retry mechanism.
          console.log("No valid invitation data; fetching profile for user:", user.uid);
          try {
            const profileData = await fetchProfileWithRetry(user.uid);
            console.log("Fetched profile data:", profileData);
            setDisplayName(profileData.businessName || profileData.name || "Your Business");
          } catch (err) {
            console.error("Error fetching profile:", err);
            // If no profile exists, create a default one so the user can proceed.
            try {
              await setDoc(
                doc(db, "profiles", user.uid),
                {
                  name: user.displayName || "",
                  businessName: "",
                  businessEmail: user.email || "",
                  uid: user.uid,
                },
                { merge: true }
              );
              setDisplayName(user.displayName || "Your Business");
            } catch (creationErr) {
              console.error("Error creating default profile:", creationErr);
              setError("No profile data found.");
            }
          }
        } catch (err) {
          console.error("Error fetching invitation or profile data:", err);
          setError("Error fetching invitation or profile data.");
        }
        const userId = user.uid;
        try {
          const data = await loadInitiatives(userId);
          setInitiatives(data);
        } catch (loadErr) {
          console.error("Error loading initiatives:", loadErr);
        }
        setDataLoaded(true);
      }
    });
    return () => unsubscribe();
  }, [invitationCode, db]);

  if (!dataLoaded) {
    return (
      <div className="dashboard-container">
        <h2>Loading dashboard...</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-container">
        <h2>{error}</h2>
      </div>
    );
  }

  // If user is not logged in, show the AccountCreation component.
  if (!userLoggedIn) {
    return <AccountCreation />;
  }

  const handleNewProject = () => {
    const newId = crypto.randomUUID();
    navigate(`/project-setup?initiativeId=${newId}`);
  };

  const handleEdit = (id) => {
    navigate(`/project-setup?initiativeId=${id}`);
  };

  const handleDelete = async (id) => {
    if (!uid) return;
    if (!window.confirm("Delete this project?")) return;
    try {
      await deleteInitiative(uid, id);
      setInitiatives((prev) => prev.filter((p) => p.id !== id));
      localStorage.removeItem(`projectStatusHistory:${id}`);
      localStorage.removeItem(`projectStatusLast:${id}`);
    } catch (err) {
      console.error("Failed to delete initiative", err);
    }
  };

  return (
    <div className="dashboard-container">
      <div className="initiative-card projects-card">
        <h2>Projects</h2>
        {initiatives.length > 0 ? (
          <ul className="project-list">
            {initiatives.map((init) => (
              <li key={init.id} className="project-item">
                <Link to={`/discovery?initiativeId=${init.id}`}>
                  {init.projectName || init.businessGoal || init.id}
                </Link>
                <span className="project-actions">
                  <button onClick={() => handleEdit(init.id)}>Edit</button>
                  <button onClick={() => handleDelete(init.id)}>Delete</button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="no-projects">No projects yet.</p>
        )}
        <button onClick={handleNewProject} className="new-project-button">
          Start New Project
        </button>
      </div>
    </div>
  );
};

export default CustomDashboard;
