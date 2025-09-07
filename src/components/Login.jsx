// src/Login.jsx
import { useState } from "react";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { app } from "../firebase";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
    <div className="login-container">
      <h2>{isSignup ? "Sign Up" : "Login"}</h2>
      <form onSubmit={handleSubmit} className="login-form">
        <input 
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button
          type="button"
          className="link-button"
          onClick={handleResetPassword}
          disabled={resetLoading}
          style={{ alignSelf: "flex-start", marginTop: 4, marginBottom: 8 }}
        >
          {resetLoading ? "Sending…" : "Forgot password? Email me a reset link"}
        </button>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {isSignup && (
          <input
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        )}
        {error && <p className="error-message">{error}</p>}
        {resetMessage && <p className="success-message">{resetMessage}</p>}
        <button type="submit" className="login-button">
          {isSignup ? "Sign Up" : "Login"}
        </button>
      </form>
      <p className="toggle-message">
        {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
        <button
          type="button"
          className="toggle-button"
          onClick={() => {
            setError("");
            setIsSignup(!isSignup);
          }}
        >
          {isSignup ? "Login" : "Sign Up"}
        </button>
      </p>
    </div>
  );
};

export default Login;
