// src/OrganizationalVisionMission.jsx

import { useState } from "react";
import PropTypes from "prop-types";

const OrganizationalVisionMission = ({ initialData = {}, onSave, onNext, onBack }) => {
  // Q1: Mission Statement presence and entry
  const [hasMission, setHasMission] = useState(initialData.hasMission || "");
  const [missionStatement, setMissionStatement] = useState(initialData.missionStatement || "");
  const [missionClarity, setMissionClarity] = useState(initialData.missionClarity || "");
  const [missionFollowUp, setMissionFollowUp] = useState(initialData.missionFollowUp || []);

  // Q2: Core Values Alignment
  const [hasCoreValues, setHasCoreValues] = useState(initialData.hasCoreValues || "");
  const [coreValuesList, setCoreValuesList] = useState(initialData.coreValuesList || "");
  const [coreValuesAlignment, setCoreValuesAlignment] = useState(initialData.coreValuesAlignment || "");
  const [coreValuesFollowUp, setCoreValuesFollowUp] = useState(initialData.coreValuesFollowUp || []);
  const [coreValuesOther, setCoreValuesOther] = useState(initialData.coreValuesOther || "");

  // Q3: Vision for the Future (including "Unknown" option)
  const [visionConfidence, setVisionConfidence] = useState(initialData.visionConfidence || "");
  const [visionFollowUp, setVisionFollowUp] = useState(initialData.visionFollowUp || []);

  // Q4: Strategic Objectives (unchanged)
  const [strategicObjectives, setStrategicObjectives] = useState(initialData.strategicObjectives || "");
  const [objectivesFollowUp, setObjectivesFollowUp] = useState(initialData.objectivesFollowUp || "");

  // Q5: Success Metrics (first ask for KPI list)
  const [kpiList, setKpiList] = useState(initialData.kpiList || "");
  const [successMetrics, setSuccessMetrics] = useState(initialData.successMetrics || "");
  const [metricsFollowUp, setMetricsFollowUp] = useState(initialData.metricsFollowUp || "");

  // Q6: Communication & Engagement
  const [communication, setCommunication] = useState(initialData.communication || "");
  const [communicationFollowUp, setCommunicationFollowUp] = useState(initialData.communicationFollowUp || []);
  const [communicationOther, setCommunicationOther] = useState(initialData.communicationOther || "");

  // Helper to render a radio group for a 1-5 rating (and optionally an "Unknown" option)
  const renderRating = (name, value, onChange, includeUnknown = false) => (
    <div className="rating-group" style={{ marginTop: "5px" }}>
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
      {includeUnknown && (
        <label style={{ marginRight: "10px" }}>
          <input
            type="radio"
            name={name}
            value="unknown"
            checked={value === "unknown"}
            onChange={(e) => onChange(e.target.value)}
          />
          Unknown
        </label>
      )}
    </div>
  );

  const handleSave = () => {
    const data = {
      hasMission,
      missionStatement,
      missionClarity,
      missionFollowUp,
      hasCoreValues,
      coreValuesList,
      coreValuesAlignment,
      coreValuesFollowUp,
      coreValuesOther,
      visionConfidence,
      visionFollowUp,
      strategicObjectives,
      objectivesFollowUp,
      kpiList,
      successMetrics,
      metricsFollowUp,
      communication,
      communicationFollowUp,
      communicationOther,
    };
    onSave(data);
    if (onNext) onNext();
  };

  return (
    <div className="question-set" style={{ marginBottom: "30px" }}>

      {/* Question 1: Mission Statement */}
      <div className="question" style={{ marginBottom: "20px" }}>
        <p>Do you have a mission statement?</p>
        <div className="rating-group">
          {["yes", "no"].map((opt) => (
            <label key={opt} style={{ marginRight: "10px" }}>
              <input
                type="radio"
                name="hasMission"
                value={opt}
                checked={hasMission === opt}
                onChange={(e) => setHasMission(e.target.value)}
              />
              {opt.charAt(0).toUpperCase() + opt.slice(1)}
            </label>
          ))}
        </div>
        {hasMission === "yes" && (
          <>
            <p>Please enter your mission statement:</p>
            <input
              type="text"
              placeholder="Enter your mission statement"
              value={missionStatement}
              onChange={(e) => setMissionStatement(e.target.value)}
              style={{ width: "80%", padding: "5px", marginBottom: "10px" }}
            />
            <p>
              On a scale from 1 (Not Clear) to 5 (Very Clear), how clear is your mission statement?
            </p>
            {renderRating("missionClarity", missionClarity, setMissionClarity)}
            {missionClarity && parseInt(missionClarity) <= 3 && (
              <div className="follow-up" style={{ marginTop: "10px" }}>
                <p>Which aspects of your mission are unclear? (Select all that apply):</p>
                {["Purpose", "Goals", "Impact", "Target Audience", "Core Values"].map((item) => (
                  <label key={item} style={{ marginRight: "10px" }}>
                    <input
                      type="checkbox"
                      value={item}
                      checked={missionFollowUp.includes(item)}
                      onChange={(e) => {
                        const updated = e.target.checked
                          ? [...missionFollowUp, item]
                          : missionFollowUp.filter((i) => i !== item);
                        setMissionFollowUp(updated);
                      }}
                    />
                    {item}
                  </label>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Question 2: Core Values */}
      <div className="question" style={{ marginBottom: "20px" }}>
        <p>Do you have core values?</p>
        <div className="rating-group">
          {["yes", "no"].map((opt) => (
            <label key={opt} style={{ marginRight: "10px" }}>
              <input
                type="radio"
                name="hasCoreValues"
                value={opt}
                checked={hasCoreValues === opt}
                onChange={(e) => setHasCoreValues(e.target.value)}
              />
              {opt.charAt(0).toUpperCase() + opt.slice(1)}
            </label>
          ))}
        </div>
        {hasCoreValues === "yes" && (
          <>
            <p>Please list your core values (comma-separated):</p>
            <input
              type="text"
              placeholder="E.g., Integrity, Innovation, Excellence"
              value={coreValuesList}
              onChange={(e) => setCoreValuesList(e.target.value)}
              style={{ width: "80%", padding: "5px", marginBottom: "10px" }}
            />
            <p>
              To what extent do you agree: &quot;Our core values effectively drive our strategic decisions.&quot;
            </p>
            {renderRating("coreValuesAlignment", coreValuesAlignment, setCoreValuesAlignment)}
            {coreValuesAlignment && parseInt(coreValuesAlignment) <= 3 && (
              <div className="follow-up" style={{ marginTop: "10px" }}>
                <p>What obstacles do you face in aligning your core values with your strategies? (Select all that apply):</p>
                {["Communication", "Leadership", "Organizational Culture", "Lack of Training", "Other"].map((item) => (
                  <label key={item} style={{ marginRight: "10px" }}>
                    <input
                      type="checkbox"
                      value={item}
                      checked={coreValuesFollowUp.includes(item)}
                      onChange={(e) => {
                        let updated;
                        if (e.target.checked) {
                          updated = [...coreValuesFollowUp, item];
                        } else {
                          updated = coreValuesFollowUp.filter((i) => i !== item);
                        }
                        setCoreValuesFollowUp(updated);
                      }}
                    />
                    {item}
                  </label>
                ))}
                {coreValuesFollowUp.includes("Other") && (
                  <div style={{ marginTop: "10px" }}>
                    <input
                      type="text"
                      placeholder="Please specify other obstacles..."
                      value={coreValuesOther}
                      onChange={(e) => setCoreValuesOther(e.target.value)}
                      style={{ width: "80%", padding: "5px" }}
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Question 3: Vision for the Future */}
      <div className="question" style={{ marginBottom: "20px" }}>
        <p>
          How confident are you that your organization’s vision for the next 3–5 years is well defined?
        </p>
        {renderRating("visionConfidence", visionConfidence, setVisionConfidence, false)}
        {visionConfidence && visionConfidence !== "unknown" && parseInt(visionConfidence) <= 2 && (
          <div className="follow-up" style={{ marginTop: "10px" }}>
            <p>What additional information would help clarify your vision? (Select all that apply):</p>
            {["Market Research", "Stakeholder Input", "Expert Consultation", "Environmental Scanning", "Unknown"].map((item) => (
              <label key={item} style={{ marginRight: "10px" }}>
                <input
                  type="checkbox"
                  value={item}
                  checked={visionFollowUp.includes(item)}
                  onChange={(e) => {
                    const updated = e.target.checked
                      ? [...visionFollowUp, item]
                      : visionFollowUp.filter((i) => i !== item);
                    setVisionFollowUp(updated);
                  }}
                />
                {item}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Question 4: Strategic Objectives */}
      <div className="question" style={{ marginBottom: "20px" }}>
        <p>
          Rate the alignment between your strategic objectives (e.g., market expansion, innovation, customer focus) and your organizational vision.
        </p>
        {renderRating("strategicObjectives", strategicObjectives, setStrategicObjectives)}
        {strategicObjectives && parseInt(strategicObjectives) <= 2 && (
          <div className="follow-up" style={{ marginTop: "10px" }}>
            <p>Please specify key areas of misalignment:</p>
            <input
              type="text"
              placeholder="Describe the misalignment..."
              value={objectivesFollowUp}
              onChange={(e) => setObjectivesFollowUp(e.target.value)}
              style={{ width: "80%", padding: "5px" }}
            />
          </div>
        )}
      </div>

      {/* Question 5: Success Metrics */}
      <div className="question" style={{ marginBottom: "20px" }}>
        <p>What KPIs are most important to you? (Comma-separated)</p>
        <input
          type="text"
          placeholder="E.g., Revenue Growth, Customer Satisfaction"
          value={kpiList}
          onChange={(e) => setKpiList(e.target.value)}
          style={{ width: "80%", padding: "5px", marginBottom: "10px" }}
        />
        <p>
          How effective are your current success metrics (KPIs, financial metrics, customer feedback)?
        </p>
        {renderRating("successMetrics", successMetrics, setSuccessMetrics)}
        {successMetrics && parseInt(successMetrics) <= 2 && (
          <div className="follow-up" style={{ marginTop: "10px" }}>
            <p>
              What areas do you most need to improve your ability to gauge success?
            </p>
            <input
              type="text"
              placeholder="E.g., clarity on customer feedback, real-time data, etc."
              value={metricsFollowUp}
              onChange={(e) => setMetricsFollowUp(e.target.value)}
              style={{ width: "80%", padding: "5px" }}
            />
          </div>
        )}
      </div>

      {/* Question 6: Communication & Engagement */}
      <div className="question" style={{ marginBottom: "20px" }}>
        <p>
          How effectively are your vision, mission, and strategic objectives communicated?
        </p>
        {renderRating("communication", communication, setCommunication)}
        {communication && parseInt(communication) <= 2 && (
          <div className="follow-up" style={{ marginTop: "10px" }}>
            <p>
              Which channels or strategies could improve communication? (Select all that apply):
            </p>
            {["Town Halls", "Digital Dashboards", "Internal Newsletters", "Other"].map((item) => (
              <label key={item} style={{ marginRight: "10px" }}>
                <input
                  type="checkbox"
                  value={item}
                  checked={communicationFollowUp.includes(item)}
                  onChange={(e) => {
                    const updated = e.target.checked
                      ? [...communicationFollowUp, item]
                      : communicationFollowUp.filter((i) => i !== item);
                    setCommunicationFollowUp(updated);
                  }}
                />
                {item}
              </label>
            ))}
            {communicationFollowUp.includes("Other") && (
              <div style={{ marginTop: "10px" }}>
                <input
                  type="text"
                  placeholder="Please specify other..."
                  value={communicationOther}
                  onChange={(e) => setCommunicationOther(e.target.value)}
                  style={{ width: "80%", padding: "5px" }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="navigation" style={{ marginTop: "20px" }}>
        <button onClick={onBack} className="wizard-button">Back</button>
        <button onClick={handleSave} className="wizard-button">Save & Next</button>
      </div>
    </div>
  );
};

OrganizationalVisionMission.propTypes = {
  initialData: PropTypes.object,
  onSave: PropTypes.func.isRequired,
  onNext: PropTypes.func,
  onBack: PropTypes.func,
};

export default OrganizationalVisionMission;
