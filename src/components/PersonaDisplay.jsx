import PropTypes from "prop-types";
import EditableField from "./EditableField.jsx";

const FIELD_LABELS = {
  role: "Role / Job Title",
  department: "Department / Team",
  careerStage: "Career Stage",
  tenure: "Tenure",
  region: "Region",
  workSetting: "Work Setting",
  shift: "Shift",
  languages: "Language(s)",
  educationLevel: "Education Level",
  techProficiency: "Tech Proficiency",
  devices: "Devices",
  bandwidth: "Bandwidth",
  baselineKnowledge: "Baseline Knowledge",
  assessmentComfort: "Assessment Comfort",
  supportLevel: "Support Level",
  accessibility: "Accessibility Needs",
  summary: "Summary",
  type: "Persona Nickname",
};

function PersonaDisplay({ persona, personaQualities, onUpdate, onRegenerate }) {
  return (
    <div className="persona-wrapper">
      <div className="persona-top">
        <div className="persona-identity-card info-card">
          {persona.avatar && (
            <img
              src={persona.avatar}
              alt={`${persona.type} avatar`}
              className="persona-avatar"
            />
          )}
          <EditableField
            label="Persona Nickname"
            value={persona.type}
            onSave={(v) => onUpdate("type", v)}
            onRegenerate={() => onRegenerate("type")}
            containerClass="editable-element persona-field"
            hideLabel
            valueClass="persona-nickname"
          />
          <EditableField
            label="Role / Job Title"
            value={persona.role}
            onSave={(v) => onUpdate("role", v)}
            onRegenerate={() => onRegenerate("role")}
            containerClass="editable-element persona-field"
            hideLabel
            valueClass="persona-role"
          />
          <EditableField
            label="Department / Team"
            value={persona.department}
            onSave={(v) => onUpdate("department", v)}
            onRegenerate={() => onRegenerate("department")}
            containerClass="editable-element persona-field"
            hideLabel
            valueClass="persona-department"
          />
          <EditableField
            label="Summary"
            value={persona.summary}
            onSave={(v) => onUpdate("summary", v)}
            onRegenerate={() => onRegenerate("summary")}
            containerClass="editable-element persona-field"
            hideLabel
            valueClass="persona-summary"
          />
        </div>
        <div className="persona-right-grid">
          {personaQualities.map((key) => (
            <EditableField
              key={key}
              label={FIELD_LABELS[key] || key}
              value={persona[key]}
              isArray={Array.isArray(persona[key])}
              onSave={(v) => onUpdate(key, v)}
              onRegenerate={() => onRegenerate(key)}
            />
          ))}
        </div>
      </div>
      <div className="persona-bottom-row">
        <EditableField
          label={`Learning Preferences${
            persona.learningPreferencesKeyword
              ? ` - ${persona.learningPreferencesKeyword}`
              : ""
          }`}
          value={persona.learningPreferences}
          onSave={(v) => onUpdate("learningPreferences", v)}
          onRegenerate={() => onRegenerate("learningPreferences")}
          containerClass="editable-element bottom-field"
          labelClass="bottom-label"
          valueClass="bottom-value"
          divider
        />
        <EditableField
          label={`Motivation${
            persona.motivation?.keyword ? ` - ${persona.motivation.keyword}` : ""
          }`}
          value={persona.motivation?.text || ""}
          onSave={(v) =>
            onUpdate("motivation", { ...persona.motivation, text: v })
          }
          onRegenerate={() => onRegenerate("motivation")}
          containerClass="editable-element bottom-field"
          labelClass="bottom-label"
          valueClass="bottom-value"
          divider
        />
        <EditableField
          label={`Challenge${
            persona.challenges?.keyword ? ` - ${persona.challenges.keyword}` : ""
          }`}
          value={persona.challenges?.text || ""}
          onSave={(v) =>
            onUpdate("challenges", { ...persona.challenges, text: v })
          }
          onRegenerate={() => onRegenerate("challenges")}
          containerClass="editable-element bottom-field"
          labelClass="bottom-label"
          valueClass="bottom-value"
          divider
        />
      </div>
    </div>
  );
}

PersonaDisplay.propTypes = {
  persona: PropTypes.object.isRequired,
  personaQualities: PropTypes.array.isRequired,
  onUpdate: PropTypes.func.isRequired,
  onRegenerate: PropTypes.func.isRequired,
};

export default PersonaDisplay;
