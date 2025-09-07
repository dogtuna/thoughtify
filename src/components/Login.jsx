// src/Login.jsx
import { useState } from "react";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { app, db } from "../firebase";
import "./AIToolsGenerators.css";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { updateProfile } from "firebase/auth";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [error, setError] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [isSignup, setIsSignup] = useState(false);
  const navigate = useNavigate();
  const firebaseAuth = getAuth(app);
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setResetMessage("");
    try {
      if (isSignup) {
        if (password !== confirmPassword) {
          setError("Passwords do not match.");
          return;
        }
        const userCredential = await createUserWithEmailAndPassword(
          firebaseAuth,
          email,
          password
        );
        const user = userCredential.user;
        console.log("Signed up:", user);
        // Update display name and create/update profile document
        try {
          const displayName = `${firstName} ${lastName}`.trim();
          if (displayName) {
            await updateProfile(user, { displayName });
          }
          await setDoc(
            doc(db, "profiles", user.uid),
            {
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              company: company.trim() || "",
              name: displayName,
              email: email.trim(),
              createdAt: serverTimestamp(),
            },
            { merge: true }
          );
        } catch (profileErr) {
          console.warn("Profile setup error:", profileErr);
        }
        navigate("/dashboard");
      } else {
        const userCredential = await signInWithEmailAndPassword(
          firebaseAuth,
          email,
          password
        );
        const user = userCredential.user;
        console.log("Logged in:", user);

        // Get the token result to log custom claims
        const tokenResult = await user.getIdTokenResult();
        console.log("Token claims:", tokenResult.claims);

        // Redirect based on claims (for example)
        if (tokenResult.claims.admin) {
          navigate("/admin-dashboard");
        } else {
          navigate("/dashboard");
        }
      }
    } catch (err) {
      console.error("Auth error:", err);
      setError(err.message || "Authentication failed.");
    }
  };

  const handleResetPassword = async () => {
    setError("");
    setResetMessage("");
    if (!email) {
      setError("Enter your email above to receive a reset link.");
      return;
    }
    try {
      setResetLoading(true);
      await sendPasswordResetEmail(firebaseAuth, email);
      setResetMessage("Password reset email sent. Check your inbox.");
    } catch (err) {
      console.error("Reset error:", err);
      setError(err.message || "Could not send reset email.");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="initiative-card" style={{ maxWidth: 520, marginTop: 100 }}>
      <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: "1.75rem", fontWeight: 700 }}>
        {isSignup ? "Sign Up" : "Login"}
      </h2>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {isSignup && (
          <>
            <label style={{ display: "block" }}>
              <div style={{ marginBottom: 4, fontWeight: 600 }}>First Name</div>
              <input
                type="text"
                placeholder="First Name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                className="generator-input"
              />
            </label>
            <label style={{ display: "block" }}>
              <div style={{ marginBottom: 4, fontWeight: 600 }}>Last Name</div>
              <input
                type="text"
                placeholder="Last Name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                className="generator-input"
              />
            </label>
            <label style={{ display: "block" }}>
              <div style={{ marginBottom: 4, fontWeight: 600 }}>Company (optional)</div>
              <input
                type="text"
                placeholder="Company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="generator-input"
              />
            </label>
          </>
        )}
        <label style={{ display: "block" }}>
          <div style={{ marginBottom: 4, fontWeight: 600 }}>Email</div>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="generator-input"
          />
        </label>
        <label style={{ display: "block" }}>
          <div style={{ marginBottom: 4, fontWeight: 600 }}>Password</div>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="generator-input"
          />
        </label>
        {isSignup && (
          <label style={{ display: "block" }}>
            <div style={{ marginBottom: 4, fontWeight: 600 }}>Confirm Password</div>
            <input
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="generator-input"
            />
          </label>
        )}
        {error && <p className="generator-error" style={{ margin: 0 }}>{error}</p>}
        {resetMessage && <p style={{ margin: 0 }}>{resetMessage}</p>}
        <div style={{ marginTop: 6 }}>
          <button type="submit" className="generator-button">
            {isSignup ? "Sign Up" : "Login"}
          </button>
        </div>
      </form>
      <div style={{ display: "flex", justifyContent: isSignup ? "flex-end" : "space-between", marginTop: 10 }}>
        {!isSignup && (
          <button
            type="button"
            onClick={handleResetPassword}
            disabled={resetLoading}
            style={{ background: "none", border: "none", color: "#fff", textDecoration: "underline", cursor: "pointer", padding: 0 }}
          >
            {resetLoading ? "Sending…" : "Forgot password?"}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setError("");
            setResetMessage("");
            setIsSignup(!isSignup);
          }}
          style={{ background: "none", border: "none", color: "#fff", textDecoration: "underline", cursor: "pointer", padding: 0 }}
        >
          {isSignup ? "Already have an account?" : "Don't have an account?"}
        </button>
      </div>
    </div>
  );
};

export default Login;
