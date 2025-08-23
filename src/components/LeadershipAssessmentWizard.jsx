// src/LeadershipAssessmentWizard.jsx

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import OrganizationalVisionMission from "./OrganizationalVisionMission";
import StrategicBusinessDrivers from "./StrategicBusinessDrivers";
import TeamStrategicAlignment from "./TeamStrategicAlignment";
import CurrentStateVsDesiredState from "./CurrentStateVsDesiredState";
import TrainingAndDevelopment from "./TrainingAndDevelopment";
import { buildGeminiPrompt } from "./BuildPrompt"; // Function to build the prompt from progressData
import { db, functions } from "../firebase";
import "./LeadershipAssessmentWizard.css";


const LeadershipAssessmentWizard = () => {
  const [accessGranted, setAccessGranted] = useState(false);
  const [password, setPassword] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const [progressData, setProgressData] = useState({}); // Stores responses keyed by step index
  const [invitationId, setInvitationId] = useState(null);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [trainingPlan, setTrainingPlan] = useState("");

  // Use shared Firebase instances
  const functionsInstance = functions;

  // Save responses for a given step and persist to Firestore.
  const handleStepSave = async (stepIndex, data) => {
    setProgressData(prev => {
      const newData = { ...prev, [stepIndex]: data };
      saveAssessmentAnswers(newData);
      return newData;
    });
  };

  // Save the current progressData to Firestore under "assessmentAnswers" using invitationId.
  const saveAssessmentAnswers = async (dataToSave = progressData) => {
    if (!invitationId) return;
    const answersDocRef = doc(db, "assessmentAnswers", invitationId);
    try {
      await setDoc(answersDocRef, { progressData: dataToSave, lastUpdated: serverTimestamp() }, { merge: true });
      console.log("Assessment answers saved.", dataToSave);
    } catch (error) {
      console.error("Error saving assessment answers:", error);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    const invitationsRef = collection(db, "invitations");
    const q = query(invitationsRef, where("invitationCode", "==", password));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      alert("Incorrect access code. Please try again.");
      return;
    }
  
    // Assume one invitation is found.
    const invitationDoc = querySnapshot.docs[0];
    setInvitationId(invitationDoc.id);
    const currentData = invitationDoc.data();
    
    // If not started, mark as in-progress and update lastLogin.
    const newStatus = currentData.status === "not started" ? "in-progress" : currentData.status;
    await updateDoc(doc(db, "invitations", invitationDoc.id), {
      status: newStatus,
      lastLogin: serverTimestamp(),
    });
  
    // Load any saved answers for this invitation.
    const answersDocRef = doc(db, "assessmentAnswers", invitationDoc.id);
    const answersSnap = await getDoc(answersDocRef);
    if (answersSnap.exists()) {
      const savedData = answersSnap.data().progressData;
      setProgressData(savedData || {});
    }
  
    setAccessGranted(true);
  };

  const goToNextStep = () => {
    saveAssessmentAnswers();
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const goToPreviousStep = () => {
    saveAssessmentAnswers();
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // When the review step loads, build the training plan prompt.
  useEffect(() => {
    // Assuming the review step is the last step in our steps array.
    if (currentStep === steps.length - 1) {
      const prompt = buildGeminiPrompt(progressData);
      setGeneratedPrompt(prompt);
    }
  }, [currentStep, progressData]);

  // Function to call the generateTrainingPlan function.
  const handleGenerateTrainingPlan = async () => {
    try {
      const generateTrainingPlanCallable = httpsCallable(functionsInstance, "generateTrainingPlan");
      const result = await generateTrainingPlanCallable({ prompt: generatedPrompt });
      setTrainingPlan(result.data.trainingPlan);
    } catch (error) {
      console.error("Error generating training plan:", error);
      alert("There was an error generating your training plan. Please try again.");
    }
  };

  // Define steps with unique indices for each step.
  const steps = [
    {
      title: "Organizational Vision & Mission",
      content: (
        <OrganizationalVisionMission
          initialData={progressData[0] || {}}
          onSave={(data) => handleStepSave(0, data)}
          onNext={goToNextStep}
          onBack={goToPreviousStep}
        />
      ),
    },
    {
      title: "Strategic Business Drivers & Challenges",
      content: (
        <StrategicBusinessDrivers
          initialData={progressData[1] || {}}
          onSave={(data) => handleStepSave(1, data)}
          onNext={goToNextStep}
          onBack={goToPreviousStep}
        />
      ),
    },
    {
      title: "Team-Level Strategic Alignment",
      content: (
        <TeamStrategicAlignment
          initialData={progressData[2] || {}}
          onSave={(data) => handleStepSave(2, data)}
          onNext={goToNextStep}
          onBack={goToPreviousStep}
        />
      ),
    },
    {
      title: "Current State vs. Desired Future State",
      content: (
        <CurrentStateVsDesiredState
          initialData={progressData[3] || {}}
          onSave={(data) => handleStepSave(3, data)}
          onNext={goToNextStep}
          onBack={goToPreviousStep}
        />
      ),
    },
    {
      title: "Development Needs and Preferences",
      content: (
        <TrainingAndDevelopment
          initialData={progressData[4] || {}}
          onSave={(data) => handleStepSave(4, data)}
          onNext={goToNextStep}
          onBack={goToPreviousStep}
        />
      ),
    },
    {
      title: "Review & Finalize",
      content: (
        <div>
          <h2>Review Your Training Plan Prompt</h2>
          {generatedPrompt ? (
            <div style={{ marginBottom: "20px", padding: "10px", background: "#fff", color: "#000", borderRadius: "4px", textAlign: "left" }}>
              <h3>Your Generated Prompt:</h3>
              <pre style={{ fontSize: "14px", whiteSpace: "pre-wrap" }}>{generatedPrompt}</pre>
            </div>
          ) : (
            <p>Building your prompt...</p>
          )}
          <button onClick={handleGenerateTrainingPlan} className="wizard-button">
            Generate Training Plan
          </button>
          {trainingPlan && (
            <div style={{ marginTop: "20px", padding: "10px", background: "#fff", color: "#000", borderRadius: "4px", textAlign: "left" }}>
              <h3>Your Training Plan:</h3>
              <pre style={{ fontSize: "14px", whiteSpace: "pre-wrap" }}>{trainingPlan}</pre>
            </div>
          )}
        </div>
      ),
    },
  ];

  if (!accessGranted) {
    return (
      <div className="wizard-container">
        <div className="login-container">
          <h2>Enter Password to Access Leadership Assessment</h2>
          <form onSubmit={handlePasswordSubmit}>
            <input
              type="password"
              placeholder="Enter access code"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="wizard-input"
            />
            <button type="submit" className="wizard-button">
              Unlock
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="wizard-container">
      <aside className="wizard-sidebar">
        <h3>Assessment Steps</h3>
        <ul>
          {steps.map((step, index) => (
            <li key={index} className={index === currentStep ? "active" : ""}>
              <Link
                to="#"
                onClick={(e) => {
                  e.preventDefault();
                  setCurrentStep(index);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                {step.title}
              </Link>
            </li>
          ))}
        </ul>
      </aside>
      <main className="wizard-main">
        <div className="wizard-content">
          <h2>{steps[currentStep].title}</h2>
          {steps[currentStep].content}
        </div>
        <div className="wizard-navigation">
          <button
            onClick={() => {
              saveAssessmentAnswers();
              goToPreviousStep();
            }}
            disabled={currentStep === 0}
            className="wizard-button"
          >
            Back
          </button>
          <button onClick={() => saveAssessmentAnswers()} className="wizard-button">
            Save
          </button>
          {currentStep < steps.length - 1 && (
            <button
              onClick={() => {
                saveAssessmentAnswers();
                goToNextStep();
              }}
              className="wizard-button"
            >
              Save & Next
            </button>
          )}
        </div>
      </main>
    </div>
  );
};

export default LeadershipAssessmentWizard;
