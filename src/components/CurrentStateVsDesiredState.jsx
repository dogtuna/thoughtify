/* eslint-disable react/no-unescaped-entities */
// src/CurrentStateVsDesiredState.jsx

import { useState } from "react";
import PropTypes from "prop-types";

const CurrentStateVsDesiredState = ({ initialData = {}, onSave, onNext, onBack }) => {
  // State variables for each question
  const [currentPerformance, setCurrentPerformance] = useState(initialData.currentPerformance || "");
  const [currentPerformanceFollowUp, setCurrentPerformanceFollowUp] = useState(initialData.currentPerformanceFollowUp || "");

  const [gapAnalysis, setGapAnalysis] = useState(initialData.gapAnalysis || "");
  const [gapAnalysisFollowUp, setGapAnalysisFollowUp] = useState(initialData.gapAnalysisFollowUp || "");

  const [opportunityAssessment, setOpportunityAssessment] = useState(initialData.opportunityAssessment || "");
  const [opportunityFollowUp, setOpportunityFollowUp] = useState(initialData.opportunityFollowUp || "");

  const [futureReadiness, setFutureReadiness] = useState(initialData.futureReadiness || "");
  const [futureReadinessFollowUp, setFutureReadinessFollowUp] = useState(initialData.futureReadinessFollowUp || "");

  // Helper: Render a 1–5 rating radio group with an explanation of the scale
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

  const handleSave = () => {
    const data = {
      currentPerformance,
      currentPerformanceFollowUp,
      gapAnalysis,
      gapAnalysisFollowUp,
      opportunityAssessment,
      opportunityFollowUp,
      futureReadiness,
      futureReadinessFollowUp,
    };
    onSave(data);
    if (onNext) onNext();
  };

  return (
    <div className="question-set" style={{ marginBottom: "30px" }}>
      <p>
        This section helps us understand your organization's current performance and its desired future state. Please rate each item on a scale of 1–5 as explained below.
      </p>

      {/* Current Performance Assessment */}
      <div className="question" style={{ marginTop: "20px", marginBottom: "20px" }}>
        <p>
          How would you rate your organization's current performance in terms of skills, processes, and outcomes? (1 = Poor, 5 = Excellent)
        </p>
        {renderRating("currentPerformance", currentPerformance, setCurrentPerformance, "1 = Poor, 5 = Excellent")}
        {currentPerformance && parseInt(currentPerformance) <= 2 && (
          <div className="follow-up" style={{ marginTop: "10px" }}>
            <p>Please specify which specific areas are underperforming:</p>
            <input
              type="text"
              placeholder="Describe underperforming areas..."
              value={currentPerformanceFollowUp}
              onChange={(e) => setCurrentPerformanceFollowUp(e.target.value)}
              style={{ width: "80%", padding: "5px" }}
            />
          </div>
        )}
      </div>

      {/* Gap Analysis */}
      <div className="question" style={{ marginTop: "20px", marginBottom: "20px" }}>
        <p>
          How significant are the gaps between your current state and your desired future state? (1 = Minor, 5 = Major)
        </p>
        {renderRating("gapAnalysis", gapAnalysis, setGapAnalysis, "1 = Minor gap, 5 = Major gap")}
        {gapAnalysis && parseInt(gapAnalysis) >= 4 && (
          <div className="follow-up" style={{ marginTop: "10px" }}>
            <p>Please indicate which areas (e.g., skills, technology, processes) need the most improvement:</p>
            <input
              type="text"
              placeholder="Describe key gaps..."
              value={gapAnalysisFollowUp}
              onChange={(e) => setGapAnalysisFollowUp(e.target.value)}
              style={{ width: "80%", padding: "5px" }}
            />
          </div>
        )}
      </div>

      {/* Opportunities for Improvement */}
      <div className="question" style={{ marginTop: "20px", marginBottom: "20px" }}>
        <p>
          How well positioned is your organization to capitalize on opportunities for improvement? (1 = Not well positioned, 5 = Very well positioned)
        </p>
        {renderRating("opportunityAssessment", opportunityAssessment, setOpportunityAssessment, "1 = Not well positioned, 5 = Very well positioned")}
        {opportunityAssessment && parseInt(opportunityAssessment) <= 2 && (
          <div className="follow-up" style={{ marginTop: "10px" }}>
            <p>
              What have been the primary obstacles or root causes that have hindered your ability to capitalize on opportunities? Please describe any initiatives you've tried that did not deliver the desired results.
            </p>
            <input
              type="text"
              placeholder="Describe obstacles and past initiatives..."
              value={opportunityFollowUp}
              onChange={(e) => setOpportunityFollowUp(e.target.value)}
              style={{ width: "80%", padding: "5px" }}
            />
          </div>
        )}
      </div>

      {/* Future Readiness */}
      <div className="question" style={{ marginTop: "20px", marginBottom: "20px" }}>
        <p>
          How prepared is your organization to adapt to unforeseen challenges in the future? (1 = Not prepared, 5 = Very prepared)
        </p>
        {renderRating("futureReadiness", futureReadiness, setFutureReadiness, "1 = Not prepared, 5 = Very prepared")}
        {futureReadiness && parseInt(futureReadiness) <= 2 && (
          <div className="follow-up" style={{ marginTop: "10px" }}>
            <p>
              What are the main factors or past initiatives that have limited your organization's readiness? Please describe any measures you've tried that fell short and why you think they were ineffective.
            </p>
            <input
              type="text"
              placeholder="Describe limitations and failed measures..."
              value={futureReadinessFollowUp}
              onChange={(e) => setFutureReadinessFollowUp(e.target.value)}
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

CurrentStateVsDesiredState.propTypes = {
  initialData: PropTypes.object,
  onSave: PropTypes.func.isRequired,
  onNext: PropTypes.func,
  onBack: PropTypes.func,
};

export default CurrentStateVsDesiredState;
