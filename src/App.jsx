// src/App.jsx

import { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import AIToolsLayout from "./components/AIToolsLayout";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import CourseOutlineGenerator from "./components/CourseOutlineGenerator";
import StudyMaterialGenerator from "./components/StudyMaterialGenerator";
import AssessmentGenerator from "./components/AssessmentGenerator";
import LessonContentGenerator from "./components/LessonContentGenerator";
import StoryboardGenerator from "./components/StoryboardGenerator";
import ContentAssetGenerator from "./components/ContentAssetGenerator";
import InitiativesNew from "./components/InitiativesNew";
import InitiativesList from "./components/InitiativesList";
import LeadershipAssessmentWizard from "./components/LeadershipAssessmentWizard";
import CustomDashboard from "./components/CustomDashboard";
import ComingSoonPage from "./pages/ComingSoonPage";
import Login from "./components/Login";
import NavBar from "./components/NavBar";
import Footer from "./components/Footer";
import "./App.css";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import CookieConsent from "./components/CookieConsent";
import Settings from "./components/Settings";

export default function App() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const tokenResult = await currentUser.getIdTokenResult();
          setIsAdmin(!!tokenResult.claims.admin);
        } catch (error) {
          console.error("Error fetching token claims:", error);
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
      }
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <Router>
      <NavBar />
      <Routes>
        <Route path="/login" element={<Login />} />
          <Route path="/" element={<ComingSoonPage />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route
          path="/admin-login"
          element={
            !user ? (
              <AdminLogin setUser={setUser} />
            ) : (
              <Navigate to={isAdmin ? "/admin-dashboard" : "/dashboard"} />
            )
          }
        />
        <Route
          path="/admin-dashboard"
          element={
            user && isAdmin ? (
              <AdminDashboard user={user} />
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route path="/dashboard" element={<CustomDashboard />} />
        <Route path="/settings" element={<Settings />} />
        <Route
          path="/leadership-assessment"
          element={user ? <LeadershipAssessmentWizard /> : <Navigate to="/login" />}
        />
        <Route
          path="/ai-tools"
          element={user ? <AIToolsLayout /> : <Navigate to="/login" />}
        >
          <Route index element={<InitiativesList />} />
          <Route path="initiatives" element={<InitiativesNew />} />
          <Route path="course-outline" element={<CourseOutlineGenerator />} />
          <Route path="study-material" element={<StudyMaterialGenerator />} />
          <Route path="assessment" element={<AssessmentGenerator />} />
          <Route path="lesson-content" element={<LessonContentGenerator />} />
          <Route path="storyboard" element={<StoryboardGenerator />} />
          <Route path="content-assets" element={<ContentAssetGenerator />} />
        </Route>
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      <Footer />
      <CookieConsent />
    </Router>
  );
}
