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
    <div className="persona-card">
      <div className="persona-top">
        <div className="persona-left">
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
            containerClass="editable-element"
            hideLabel
            valueClass="persona-nickname"
          />
          <EditableField
            label="Role / Job Title"
            value={persona.role}
            onSave={(v) => onUpdate("role", v)}
            onRegenerate={() => onRegenerate("role")}
            containerClass="editable-element"
            hideLabel
            valueClass="persona-role"
          />
          <EditableField
            label="Department / Team"
            value={persona.department}
            onSave={(v) => onUpdate("department", v)}
            onRegenerate={() => onRegenerate("department")}
            containerClass="editable-element"
            hideLabel
            valueClass="persona-department"
          />
          <EditableField
            label="Summary"
            value={persona.summary}
            onSave={(v) => onUpdate("summary", v)}
            onRegenerate={() => onRegenerate("summary")}
            containerClass="editable-element"
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
          label="Learning Preferences"
          value={persona.learningPreferences}
          onSave={(v) => onUpdate("learningPreferences", v)}
          onRegenerate={() => onRegenerate("learningPreferences")}
          containerClass="editable-element bottom-field"
          labelClass="bottom-label"
          valueClass="bottom-value"
          divider
        />
        <EditableField
          label="Motivation"
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
          label="Challenges"
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
