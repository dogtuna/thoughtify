// src/CustomDashboard.jsx

import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
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
import { onAuthStateChanged, signOut } from "firebase/auth";
import { app, auth } from "../firebase";
import AccountCreation from "./AccountCreation";
import "./CustomDashboard.css";

const CustomDashboard = () => {
  const [searchParams] = useSearchParams();
  const invitationCode = searchParams.get("invite");
  const [displayName, setDisplayName] = useState("");
  const [dataLoaded, setDataLoaded] = useState(false);
  const [error, setError] = useState("");
  const [userLoggedIn, setUserLoggedIn] = useState(false);
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
        setDataLoaded(true);
      }
    });
    return () => unsubscribe();
  }, [invitationCode, db]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

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

  return (
    <div className="dashboard-container">
      <header className="dashboard-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Welcome, {displayName}</h1>
        <button onClick={handleLogout} className="logout-button">
          Logout
        </button>
      </header>
      <div className="todo-list">
        <h3>To-Do List</h3>
        <ul>
          <li onClick={() => navigate("/leadership-assessment")}>
            Complete Training Needs Assessment
          </li>
          {/* Additional to-do items can be added here */}
        </ul>
      </div>
    </div>
  );
};

export default CustomDashboard;
