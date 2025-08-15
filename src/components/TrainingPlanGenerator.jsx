import { useState, useEffect } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useSearchParams } from "react-router-dom";
import { app, auth } from "../firebase.js";
import { saveInitiative } from "../utils/initiatives.js";
import PropTypes from "prop-types";
import "./AIToolsGenerators.css";

const TrainingPlanGenerator = ({
  projectBrief,
  businessGoal,
  audienceProfile,
  projectConstraints,
  keyContacts,
  selectedModality,
  blendModalities = [],
  sourceMaterials,
  trainingPlan,
  setTrainingPlan,
  onBack,
  onNext,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const functions = getFunctions(app, "us-central1");
  const callGenerate = httpsCallable(functions, "generateTrainingPlan");
  const [searchParams] = useSearchParams();
  const initiativeId = searchParams.get("initiativeId") || "default";

  const formatContacts = (contacts = []) =>
    contacts
      .filter((c) => c.name || c.role)
      .map((c) => (c.role ? `${c.name} (${c.role})` : c.name))
      .join("; ");

  useEffect(() => {
    document.body.classList.toggle("pulsing", loading);
    return () => document.body.classList.remove("pulsing");
  }, [loading]);

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    try {
      const prompt = `You are a senior instructional designer. Using the information below, create a blended learning plan. For each selected modality, provide the rationale and recommended topics.\n\nProject Brief: ${projectBrief}\nBusiness Goal: ${businessGoal}\nAudience Profile: ${audienceProfile}\nProject Constraints: ${projectConstraints}\nKey Contacts: ${formatContacts(keyContacts)}\nSelected Approach: ${selectedModality}\nBlended Modalities: ${blendModalities.join(", ")}\nSource Material:\n${sourceMaterials
        .map((f) => f.content)
        .join("\n")}`;
      const { data } = await callGenerate({ prompt });
      setTrainingPlan(data.trainingPlan || "");
      const uid = auth.currentUser?.uid;
      if (uid) {
        await saveInitiative(uid, initiativeId, { trainingPlan: data.trainingPlan || "" });
      }
    } catch (err) {
      console.error("Error generating training plan:", err);
      setError(err?.message || "Error generating training plan.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await saveInitiative(uid, initiativeId, { trainingPlan });
    } catch (err) {
      console.error("Error saving training plan:", err);
      setError(err?.message || "Error saving training plan.");
    }
  };

  const handleNext = async () => {
    await handleSave();
    if (onNext) onNext();
  };

  return (
    <div className="initiative-card generator-result">
      <h3>Training Plan</h3>
      {!trainingPlan ? (
        <>
          <p>
            Generate a detailed training plan outlining topics for each modality.
          </p>
          <div className="button-row">
            <button
              type="button"
              onClick={onBack}
              className="generator-button back-button"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading}
              className="generator-button next-button"
            >
              {loading ? "Generating..." : "Generate Plan"}
            </button>
          </div>
          {error && <p className="generator-error">{error}</p>}
        </>
      ) : (
        <>
          <textarea
            className="generator-textarea"
            value={trainingPlan}
            onChange={(e) => setTrainingPlan(e.target.value)}
          />
          <div className="button-row">
            <button
              type="button"
              onClick={onBack}
              className="generator-button back-button"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="generator-button save-button"
            >
              Save
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="generator-button next-button"
            >
              Next
            </button>
          </div>
          {error && <p className="generator-error">{error}</p>}
        </>
      )}
    </div>
  );
};

TrainingPlanGenerator.propTypes = {
  projectBrief: PropTypes.string.isRequired,
  businessGoal: PropTypes.string.isRequired,
  audienceProfile: PropTypes.string.isRequired,
  projectConstraints: PropTypes.string.isRequired,
  keyContacts: PropTypes.arrayOf(
    PropTypes.shape({ name: PropTypes.string, role: PropTypes.string })
  ).isRequired,
  selectedModality: PropTypes.string.isRequired,
  blendModalities: PropTypes.array,
  sourceMaterials: PropTypes.array.isRequired,
  trainingPlan: PropTypes.string.isRequired,
  setTrainingPlan: PropTypes.func.isRequired,
  onBack: PropTypes.func.isRequired,
  onNext: PropTypes.func.isRequired,
};

export default TrainingPlanGenerator;
