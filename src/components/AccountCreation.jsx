// src/AccountCreation.jsx
import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  setDoc,
} from "firebase/firestore";
import {
  getAuth,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
} from "firebase/auth";

import { app } from "../firebase";

const AccountCreation = () => {
  const [searchParams] = useSearchParams();
  const invitationCode = searchParams.get("invite");
  const [invitationData, setInvitationData] = useState(null);
  const [invitationLoading, setInvitationLoading] = useState(true);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const db = getFirestore(app);
  const firebaseAuth = getAuth(app);

  // Fetch invitation data using the "invitationCode" field
  useEffect(() => {
    const fetchInvitation = async () => {
      if (invitationCode) {
        try {
          const invRef = collection(db, "invitations");
          const q = query(invRef, where("invitationCode", "==", invitationCode));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            const docData = querySnapshot.docs[0].data();
            // Accept invitation if status is "unused" or "not started"
            if (docData.status === "unused" || docData.status === "not started") {
              setInvitationData(docData);
            } else {
              navigate("/login");
            }
          } else {
            setInvitationData(null);
          }
        } catch (err) {
          console.error("Error fetching invitation:", err);
          setInvitationData(null);
        }
      }
      setInvitationLoading(false);
    };
    fetchInvitation();
  }, [invitationCode, db, navigate]);

  // If user is already logged in, redirect them to the dashboard.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      if (user) {
        navigate("/dashboard");
      }
    });
    return () => unsubscribe();
  }, [firebaseAuth, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    try {
      // Use the business email from the invitation document.
      const businessEmail = invitationData.businessEmail;
      const userCredential = await createUserWithEmailAndPassword(
        firebaseAuth,
        businessEmail,
        password
      );
      console.log("User created:", userCredential.user);

      // Mark the invitation as "used"
      const invRef = collection(db, "invitations");
      const q = query(invRef, where("invitationCode", "==", invitationCode));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const docRef = doc(db, "invitations", querySnapshot.docs[0].id);
        await updateDoc(docRef, { status: "used" });
      }

      // Create a profile in the "profiles" collection
      await setDoc(doc(db, "profiles", userCredential.user.uid), {
        name: name,
        businessName: invitationData.businessName || "",
        businessEmail: businessEmail,
        uid: userCredential.user.uid,
      });

      navigate("/dashboard");
    } catch (err) {
      console.error("Error creating account:", err);
      setError(err.message || "Error creating account.");
    }
  };

  if (invitationLoading) {
    return (
      <div className="account-container">
        <h2>Loading invitation...</h2>
      </div>
    );
  }
  if (!invitationCode || invitationData === null) {
    return (
      <div className="account-container">
        <h2>Invalid or Expired Invitation</h2>
        <p>Please contact support for access.</p>
      </div>
    );
  }

  return (
    <div className="account-container">
      <h2>Create Your Account</h2>
      <p>
        Your business email: <strong>{invitationData.businessEmail}</strong>
      </p>
      <form onSubmit={handleSubmit} className="account-form">
        <div className="form-group">
          <label htmlFor="name">Your Name:</label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Create a Password:</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="confirmPassword">Confirm Password:</label>
          <input
            type="password"
            id="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm password"
            required
          />
        </div>
        {error && <p className="error-message">{error}</p>}
        <button type="submit" className="account-button">
          Create Account
        </button>
      </form>
    </div>
  );
};

export default AccountCreation;
