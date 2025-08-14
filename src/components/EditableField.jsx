import { useState } from "react";
import PropTypes from "prop-types";

function EditableField({
  label,
  value,
  onSave,
  onRegenerate,
  isArray,
  containerClass,
  labelClass,
  valueClass,
  hideLabel,
  divider,
  autoSave,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(
    isArray ? (Array.isArray(value) ? value.join(", ") : value || "") : value || ""
  );

  const handleSave = () => {
    const newValue = isArray
      ? draft
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
      : draft;
    onSave(newValue);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(isArray ? (Array.isArray(value) ? value.join(", ") : "") : value || "");
    setEditing(false);
  };

  const handleBlur = () => {
    if (autoSave) {
      handleSave();
    }
  };

  const containerClasses = containerClass || "info-card editable-element";

  return (
    <div className={containerClasses}>
      {editing ? (
        <div>
          <p className={`info-label ${labelClass || ""}`}>{label}</p>
          <textarea
            className="generator-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleBlur}
            rows={isArray ? 2 : 3}
          />
          {!autoSave && (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                className="generator-button"
                type="button"
                onClick={handleSave}
              >
                Save
              </button>
              <button
                className="generator-button"
                type="button"
                onClick={handleCancel}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {!hideLabel && (
            <p className={`info-label ${labelClass || ""}`}>{label}</p>
          )}
          {!hideLabel && divider && <hr className="info-divider" />}
          <p className={`info-value ${valueClass || ""}`}>
            {isArray && Array.isArray(value) ? value.join(", ") : value || "-"}
          </p>
          <div className="edit-controls">
            <button
              className="control-btn"
              type="button"
              onClick={onRegenerate}
              title="Regenerate"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 2v6h6" />
                <path d="M21 12A9 9 0 0 0 6 5.3L3 8" />
                <path d="M21 22v-6h-6" />
                <path d="M3 12a9 9 0 0 0 15 6.7l3-2.7" />
              </svg>
            </button>
            <button
              className="control-btn"
              type="button"
              onClick={() => setEditing(true)}
              title="Edit"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

EditableField.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number,
    PropTypes.array,
    PropTypes.object,
  ]),
  onSave: PropTypes.func.isRequired,
  onRegenerate: PropTypes.func.isRequired,
  isArray: PropTypes.bool,
  containerClass: PropTypes.string,
  labelClass: PropTypes.string,
  valueClass: PropTypes.string,
  hideLabel: PropTypes.bool,
  divider: PropTypes.bool,
  autoSave: PropTypes.bool,
};

EditableField.defaultProps = {
  value: "",
  isArray: false,
  containerClass: "",
  labelClass: "",
  valueClass: "",
  hideLabel: false,
  divider: false,
  autoSave: false,
};

export default EditableField;
