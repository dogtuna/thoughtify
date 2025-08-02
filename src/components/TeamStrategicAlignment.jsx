// src/TeamStrategicAlignment.jsx

import { useState } from "react";
import PropTypes from "prop-types";

const TeamStrategicAlignment = ({ initialData = {}, onSave, onNext, onBack }) => {
  // Array to hold multiple teams
  const [teams, setTeams] = useState(initialData.teams || []);
  
  // Current team data structure with all questions
  const [currentTeam, setCurrentTeam] = useState({
    teamName: "",
    // Existing questions
    objectiveClarity: "",
    objectivesFollowUp: "",
    roleClarity: "",
    roleFollowUp: "",
    collaboration: "",
    collaborationFollowUp: "",
    // New questions
    empowerment: "",
    empowermentFollowUp: "",
    alignment: "",
    alignmentFollowUp: "",
    resourceAdequacy: "",
    resourceFollowUp: "",
    communication: "",
    communicationFollowUp: "",
    // Revised training needs question (yes/no) and follow-ups
    trainingNeeds: "", // yes/no answer
    trainingSkills: "", // if yes, which skills?
    hasTrainingProgram: "", // yes/no if they have an existing program
    trainingProgramFeedback: "", // if yes, what improvements are needed?
  });

  // Helper to render a 1-5 rating radio group with scale explanation
  const renderRating = (name, value, onChange) => (
    <div className="rating-group" style={{ marginTop: "5px" }}>
      <span style={{ fontStyle: "italic", fontSize: "0.9em" }}>
        (1 = Lowest, 5 = Highest)
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

  // Update a field in the current team object
  const updateCurrentTeam = (field, value) => {
    setCurrentTeam((prev) => ({ ...prev, [field]: value }));
  };

  // Add the current team to the teams array and reset the form
  const addTeam = () => {
    if (!currentTeam.teamName.trim()) {
      alert("Please enter the team name before adding.");
      return;
    }
    setTeams((prevTeams) => [...prevTeams, currentTeam]);
    setCurrentTeam({
      teamName: "",
      objectiveClarity: "",
      objectivesFollowUp: "",
      roleClarity: "",
      roleFollowUp: "",
      collaboration: "",
      collaborationFollowUp: "",
      empowerment: "",
      empowermentFollowUp: "",
      alignment: "",
      alignmentFollowUp: "",
      resourceAdequacy: "",
      resourceFollowUp: "",
      communication: "",
      communicationFollowUp: "",
      trainingNeeds: "",
      trainingSkills: "",
      hasTrainingProgram: "",
      trainingProgramFeedback: "",
    });
  };

  // Save all team data and proceed to next step
  const handleSave = () => {
    // If there's unsaved team data, prompt the user to add it
    if (currentTeam.teamName.trim()) {
      if (
        window.confirm(
          "You have unsaved team data. Would you like to add this team before proceeding?"
        )
      ) {
        addTeam();
      }
    }
    onSave({ teams });
    if (onNext) onNext();
  };

  return (
    <div className="question-set" style={{ marginBottom: "30px" }}>
      <p>Please provide details for one team at a time.</p>

      {/* Team Details Form */}
      <div className="team-form" style={{ marginBottom: "20px", border: "1px solid #ccc", padding: "15px" }}>
        <p>
          <strong>Team Name:</strong>
        </p>
        <input
          type="text"
          placeholder="Enter team name"
          value={currentTeam.teamName}
          onChange={(e) => updateCurrentTeam("teamName", e.target.value)}
          style={{ width: "80%", padding: "5px", marginBottom: "10px" }}
        />

        {/* Strategic Objectives Clarity */}
        <p>
          How clear are the strategic objectives for this team? (Rate on a scale of 1–5, where 1 = Not clear at all, 5 = Very clear)
        </p>
        {renderRating("objectiveClarity", currentTeam.objectiveClarity, (value) =>
          updateCurrentTeam("objectiveClarity", value)
        )}
        {currentTeam.objectiveClarity && parseInt(currentTeam.objectiveClarity) <= 2 && (
          <div className="follow-up" style={{ marginTop: "10px" }}>
            <p>Please specify which aspects of the objectives are unclear:</p>
            <input
              type="text"
              placeholder="Describe areas needing clarity..."
              value={currentTeam.objectivesFollowUp}
              onChange={(e) => updateCurrentTeam("objectivesFollowUp", e.target.value)}
              style={{ width: "80%", padding: "5px" }}
            />
          </div>
        )}

        {/* Role Clarity */}
        <p style={{ marginTop: "20px" }}>
          How clear are the roles and responsibilities within this team? (Rate on a scale of 1–5, where 1 = Very unclear, 5 = Very clear)
        </p>
        {renderRating("roleClarity", currentTeam.roleClarity, (value) =>
          updateCurrentTeam("roleClarity", value)
        )}
        {currentTeam.roleClarity && parseInt(currentTeam.roleClarity) <= 2 && (
          <div className="follow-up" style={{ marginTop: "10px" }}>
            <p>Which roles or responsibilities are most ambiguous?</p>
            <input
              type="text"
              placeholder="Describe ambiguity in roles..."
              value={currentTeam.roleFollowUp}
              onChange={(e) => updateCurrentTeam("roleFollowUp", e.target.value)}
              style={{ width: "80%", padding: "5px" }}
            />
          </div>
        )}

        {/* Collaboration */}
        <p style={{ marginTop: "20px" }}>
          How effective is collaboration within this team and with other teams? (Rate on a scale of 1–5, where 1 = Not effective, 5 = Very effective)
        </p>
        {renderRating("collaboration", currentTeam.collaboration, (value) =>
          updateCurrentTeam("collaboration", value)
        )}
        {currentTeam.collaboration && parseInt(currentTeam.collaboration) <= 2 && (
          <div className="follow-up" style={{ marginTop: "10px" }}>
            <p>Please describe the collaboration challenges:</p>
            <input
              type="text"
              placeholder="Describe collaboration issues..."
              value={currentTeam.collaborationFollowUp}
              onChange={(e) => updateCurrentTeam("collaborationFollowUp", e.target.value)}
              style={{ width: "80%", padding: "5px" }}
            />
          </div>
        )}

        {/* Team Empowerment & Decision-Making */}
        <p style={{ marginTop: "20px" }}>
          How empowered is your team to make decisions related to its strategic objectives? (Rate on a scale of 1–5, where 1 = Not empowered, 5 = Fully empowered)
        </p>
        {renderRating("empowerment", currentTeam.empowerment, (value) =>
          updateCurrentTeam("empowerment", value)
        )}
        {currentTeam.empowerment && parseInt(currentTeam.empowerment) <= 2 && (
          <div className="follow-up" style={{ marginTop: "10px" }}>
            <p>What barriers prevent your team from taking more autonomous decisions?</p>
            <input
              type="text"
              placeholder="Describe decision-making barriers..."
              value={currentTeam.empowermentFollowUp}
              onChange={(e) => updateCurrentTeam("empowermentFollowUp", e.target.value)}
              style={{ width: "80%", padding: "5px" }}
            />
          </div>
        )}

        {/* Alignment with Organizational Goals */}
        <p style={{ marginTop: "20px" }}>
          How well do this team’s objectives align with the organization’s overall strategic vision? (Rate on a scale of 1–5, where 1 = Not aligned, 5 = Fully aligned)
        </p>
        {renderRating("alignment", currentTeam.alignment, (value) =>
          updateCurrentTeam("alignment", value)
        )}
        {currentTeam.alignment && parseInt(currentTeam.alignment) <= 2 && (
          <div className="follow-up" style={{ marginTop: "10px" }}>
            <p>What specific factors contribute to the misalignment?</p>
            <input
              type="text"
              placeholder="Describe factors affecting alignment..."
              value={currentTeam.alignmentFollowUp}
              onChange={(e) => updateCurrentTeam("alignmentFollowUp", e.target.value)}
              style={{ width: "80%", padding: "5px" }}
            />
          </div>
        )}

        {/* Resource Adequacy */}
        <p style={{ marginTop: "20px" }}>
          Do you feel your team has sufficient resources (time, budget, personnel) to achieve its strategic objectives? (Rate on a scale of 1–5, where 1 = Not sufficient, 5 = Very sufficient)
        </p>
        {renderRating("resourceAdequacy", currentTeam.resourceAdequacy, (value) =>
          updateCurrentTeam("resourceAdequacy", value)
        )}
        {currentTeam.resourceAdequacy && parseInt(currentTeam.resourceAdequacy) <= 2 && (
          <div className="follow-up" style={{ marginTop: "10px" }}>
            <p>Which specific resources or support would enable your team to perform better?</p>
            <input
              type="text"
              placeholder="Describe resource needs..."
              value={currentTeam.resourceFollowUp}
              onChange={(e) => updateCurrentTeam("resourceFollowUp", e.target.value)}
              style={{ width: "80%", padding: "5px" }}
            />
          </div>
        )}

        {/* Internal Communication & Feedback */}
        <p style={{ marginTop: "20px" }}>
          How effective is communication within the team regarding strategic goals and performance feedback? (Rate on a scale of 1–5, where 1 = Not effective, 5 = Very effective)
        </p>
        {renderRating("communication", currentTeam.communication, (value) =>
          updateCurrentTeam("communication", value)
        )}
        {currentTeam.communication && parseInt(currentTeam.communication) <= 2 && (
          <div className="follow-up" style={{ marginTop: "10px" }}>
            <p>
              What improvements in communication channels or processes would help your team operate more effectively?
            </p>
            <input
              type="text"
              placeholder="Describe communication improvements..."
              value={currentTeam.communicationFollowUp}
              onChange={(e) => updateCurrentTeam("communicationFollowUp", e.target.value)}
              style={{ width: "80%", padding: "5px" }}
            />
          </div>
        )}

        {/* Team-Specific Training Needs (Yes/No and Follow-ups) */}
        <p style={{ marginTop: "20px" }}>
          Are there any specific skills or competencies that your team needs to enhance to better meet its strategic goals?
        </p>
        {renderYesNo("trainingNeeds", currentTeam.trainingNeeds, (value) =>
          updateCurrentTeam("trainingNeeds", value)
        )}
        {currentTeam.trainingNeeds === "yes" && (
          <div className="follow-up" style={{ marginTop: "10px" }}>
            <p>Please list the specific skills or competencies:</p>
            <input
              type="text"
              placeholder="List skills or competencies..."
              value={currentTeam.trainingSkills}
              onChange={(e) => updateCurrentTeam("trainingSkills", e.target.value)}
              style={{ width: "80%", padding: "5px", marginBottom: "10px" }}
            />
            <p>Do you currently have any training programs in place to develop these skills?</p>
            {renderYesNo("hasTrainingProgram", currentTeam.hasTrainingProgram, (value) =>
              updateCurrentTeam("hasTrainingProgram", value)
            )}
            {currentTeam.hasTrainingProgram === "yes" && (
              <div className="follow-up" style={{ marginTop: "10px" }}>
                <p>
                  What improvements would you make to these training programs, or what factors have limited their success?
                </p>
                <input
                  type="text"
                  placeholder="Describe needed changes or limitations..."
                  value={currentTeam.trainingProgramFeedback}
                  onChange={(e) => updateCurrentTeam("trainingProgramFeedback", e.target.value)}
                  style={{ width: "80%", padding: "5px" }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Display added teams */}
      {teams.length > 0 && (
        <div className="teams-list" style={{ marginBottom: "20px" }}>
          <h4>Teams Added:</h4>
          <ul>
            {teams.map((team, index) => (
              <li key={index}>
                <strong>{team.teamName}</strong> - Objectives Clarity: {team.objectiveClarity}, Role Clarity: {team.roleClarity}, Collaboration: {team.collaboration}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="navigation" style={{ marginTop: "20px" }}>
        <button onClick={onBack} className="wizard-button">Back</button>
        <button onClick={addTeam} className="wizard-button" style={{ marginRight: "10px" }}>Add Another Team</button>
        <button onClick={handleSave} className="wizard-button">Save & Next</button>
      </div>
    </div>
  );
};

TeamStrategicAlignment.propTypes = {
  initialData: PropTypes.object,
  onSave: PropTypes.func.isRequired,
  onNext: PropTypes.func,
  onBack: PropTypes.func,
};

export default TeamStrategicAlignment;
