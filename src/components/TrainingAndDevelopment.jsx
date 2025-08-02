// src/TrainingAndDevelopment.jsx

import { useState } from "react";
import PropTypes from "prop-types";

const TrainingAndDevelopment = ({ initialData = {}, onSave, onNext, onBack }) => {
  // State variables for training and development questions
  const [programEffectiveness, setProgramEffectiveness] = useState(initialData.programEffectiveness || "");
  const [programEffectivenessFollowUp, setProgramEffectivenessFollowUp] = useState(initialData.programEffectivenessFollowUp || "");

  const [ongoingImportance, setOngoingImportance] = useState(initialData.ongoingImportance || "");
  const [ongoingImportanceFollowUp, setOngoingImportanceFollowUp] = useState(initialData.ongoingImportanceFollowUp || "");

  const [deliverySatisfaction, setDeliverySatisfaction] = useState(initialData.deliverySatisfaction || "");

  // New state for current training methodologies
  const [currentMethodologies, setCurrentMethodologies] = useState(initialData.currentMethodologies || []);
  const [otherMethodology, setOtherMethodology] = useState(initialData.otherMethodology || "");

  const [needsIdentification, setNeedsIdentification] = useState(initialData.needsIdentification || "");
  const [needsIdentificationFollowUp, setNeedsIdentificationFollowUp] = useState(initialData.needsIdentificationFollowUp || "");

  const [experimentedMethods, setExperimentedMethods] = useState(initialData.experimentedMethods || "");
  const [experimentedMethodsFollowUp, setExperimentedMethodsFollowUp] = useState(initialData.experimentedMethodsFollowUp || "");

  // Helper to render a 1–5 rating radio group with scale explanation
  const renderRating = (name, value, onChange, explanation) => (
    <div className="rating-group" style={{ marginTop: "5px" }}>
      <span style={{ fontStyle: "italic", fontSize: "0.9em" }}>
        ({explanation})
      </span>
      <br />
      {[1, 2, 3, 4, 5].map((num) => (
        <label key={num} style={{ marginRight: "10px" }}>
          <input
            type="radio"
            name={name}
            value={num}
            checked={value === String(num)}
            onChange={(e) => onChange(e.target.value)}
          />
          {num}
        </label>
      ))}
    </div>
  );

  // Helper to render a yes/no radio group
  const renderYesNo = (name, value, onChange) => (
    <div className="yes-no-group" style={{ marginTop: "5px" }}>
      {["yes", "no"].map((opt) => (
        <label key={opt} style={{ marginRight: "10px" }}>
          <input
            type="radio"
            name={name}
            value={opt}
            checked={value === opt}
            onChange={(e) => onChange(e.target.value)}
          />
          {opt.charAt(0).toUpperCase() + opt.slice(1)}
        </label>
      ))}
    </div>
  );

  // Handler for checkboxes for current training methodologies
  const handleMethodologyChange = (method) => {
    if (currentMethodologies.includes(method)) {
      setCurrentMethodologies(currentMethodologies.filter((m) => m !== method));
    } else {
      setCurrentMethodologies([...currentMethodologies, method]);
    }
  };

  const handleSave = () => {
    const data = {
      programEffectiveness,
      programEffectivenessFollowUp,
      ongoingImportance,
      ongoingImportanceFollowUp,
      deliverySatisfaction,
      currentMethodologies,
      otherMethodology,
      needsIdentification,
      needsIdentificationFollowUp,
      experimentedMethods,
      experimentedMethodsFollowUp,
    };
    onSave(data);
    if (onNext) onNext();
  };

  return (
    <div className="question-set" style={{ marginBottom: "30px" }}>
      <p>
        This section helps us understand your current training initiatives, priorities, and challenges.
        Please rate each item on a scale of 1–5 (with 1 being the lowest and 5 the highest), or answer yes/no where indicated.
      </p>

      {/* Program Effectiveness */}
      <div className="question" style={{ marginTop: "20px", marginBottom: "20px" }}>
        <p>
          How effective are your current training and development programs in addressing your organizational needs? (1 = Not effective, 5 = Highly effective)
        </p>
        {renderRating("programEffectiveness", programEffectiveness, setProgramEffectiveness, "1 = Not effective, 5 = Highly effective")}
        {programEffectiveness && parseInt(programEffectiveness) <= 2 && (
          <div className="follow-up" style={{ marginTop: "10px" }}>
            <p>
              What have been the primary challenges or root causes that limited the effectiveness of your training programs? (e.g., content relevance, engagement, delivery method)
            </p>
            <input
              type="text"
              placeholder="Describe challenges encountered..."
              value={programEffectivenessFollowUp}
              onChange={(e) => setProgramEffectivenessFollowUp(e.target.value)}
              style={{ width: "80%", padding: "5px" }}
            />
          </div>
        )}
      </div>

      {/* Ongoing Training Importance */}
      <div className="question" style={{ marginTop: "20px", marginBottom: "20px" }}>
        <p>
          How important do you consider ongoing training and development for maintaining a competitive advantage? (1 = Not important, 5 = Critical)
        </p>
        {renderRating("ongoingImportance", ongoingImportance, setOngoingImportance, "1 = Not important, 5 = Critical")}
        {ongoingImportance && parseInt(ongoingImportance) >= 4 && (
          <div className="follow-up" style={{ marginTop: "10px" }}>
            <p>
              Which training areas do you believe are most crucial for your organization? (e.g., technical skills, leadership, customer service)
            </p>
            <input
              type="text"
              placeholder="List crucial training areas..."
              value={ongoingImportanceFollowUp}
              onChange={(e) => setOngoingImportanceFollowUp(e.target.value)}
              style={{ width: "80%", padding: "5px" }}
            />
          </div>
        )}
      </div>
      {/* Current Training Methodologies */}
      <div className="question" style={{ marginTop: "20px", marginBottom: "20px" }}>
        <p>Which training methodologies do you currently use? (Select all that apply)</p>
        {[
          "In-person training",
          "Online courses",
          "Blended learning",
          "Workshops",
          "Mentoring",
          "Webinars",
          "Self-paced modules",
          "Coaching",
          "Other",
        ].map((method) => (
          <label key={method} style={{ marginRight: "10px" }}>
            <input
              type="checkbox"
              value={method}
              checked={currentMethodologies.includes(method)}
              onChange={() => handleMethodologyChange(method)}
            />
            {method}
          </label>
        ))}
        {currentMethodologies.includes("Other") && (
          <div style={{ marginTop: "10px" }}>
            <input
              type="text"
              placeholder="Please specify other methodologies..."
              value={otherMethodology}
              onChange={(e) => setOtherMethodology(e.target.value)}
              style={{ width: "80%", padding: "5px" }}
            />
          </div>
        )}
      </div>
      {/* Delivery Methods Satisfaction */}
      <div className="question" style={{ marginTop: "20px", marginBottom: "20px" }}>
        <p>
          How satisfied are you with the variety of training delivery methods currently offered? (1 = Not satisfied, 5 = Very satisfied)
        </p>
        {renderRating("deliverySatisfaction", deliverySatisfaction, setDeliverySatisfaction, "1 = Not satisfied, 5 = Very satisfied")}
      </div>



      {/* Needs Identification */}
      <div className="question" style={{ marginTop: "20px", marginBottom: "20px" }}>
        <p>
          How well do you think your organization identifies and addresses individual and team-specific training needs? (1 = Not well, 5 = Very well)
        </p>
        {renderRating("needsIdentification", needsIdentification, setNeedsIdentification, "1 = Not well, 5 = Very well")}
        {needsIdentification && parseInt(needsIdentification) <= 2 && (
          <div className="follow-up" style={{ marginTop: "10px" }}>
            <p>
              What challenges have you encountered in assessing and addressing training needs?
            </p>
            <input
              type="text"
              placeholder="Describe challenges..."
              value={needsIdentificationFollowUp}
              onChange={(e) => setNeedsIdentificationFollowUp(e.target.value)}
              style={{ width: "80%", padding: "5px" }}
            />
          </div>
        )}
      </div>

      {/* Experimentation with Training Approaches */}
      <div className="question" style={{ marginTop: "20px", marginBottom: "20px" }}>
        <p>
          Have you experimented with different training approaches or methods in the past?
        </p>
        {renderYesNo("experimentedMethods", experimentedMethods, setExperimentedMethods)}
        {experimentedMethods === "yes" && (
          <div className="follow-up" style={{ marginTop: "10px" }}>
            <p>
              What have been the most and least effective approaches, and what do you think were the key factors influencing their success or failure?
            </p>
            <input
              type="text"
              placeholder="Describe your experiences with different approaches..."
              value={experimentedMethodsFollowUp}
              onChange={(e) => setExperimentedMethodsFollowUp(e.target.value)}
              style={{ width: "80%", padding: "5px" }}
            />
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="navigation" style={{ marginTop: "20px" }}>
        <button onClick={onBack} className="wizard-button">Back</button>
        <button onClick={handleSave} className="wizard-button">Save & Next</button>
      </div>
    </div>
  );
};

TrainingAndDevelopment.propTypes = {
  initialData: PropTypes.object,
  onSave: PropTypes.func.isRequired,
  onNext: PropTypes.func,
  onBack: PropTypes.func,
};

export default TrainingAndDevelopment;
