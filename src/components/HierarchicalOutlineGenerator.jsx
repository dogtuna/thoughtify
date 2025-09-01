import { useState, useEffect } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useSearchParams } from "react-router-dom";
import { app, auth } from "../firebase.js";
import { saveInitiative } from "../utils/initiatives.js";
import { useProject } from "../context/ProjectContext.jsx";
import { omitEmptyStrings } from "../utils/omitEmptyStrings.js";
import PropTypes from "prop-types";
import "./AIToolsGenerators.css";

const HierarchicalOutlineGenerator = ({
  projectBrief,
  businessGoal,
  audienceProfile,
  projectConstraints,
  keyContacts,
  selectedModality,
  blendModalities = [],
  learningObjectives,
  sourceMaterials,
  onBack,
  onNext,
}) => {
  const { courseOutline, setCourseOutline } = useProject();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [lines, setLines] = useState([]);

  useEffect(() => {
    document.body.classList.toggle("pulsing", loading);
    return () => document.body.classList.remove("pulsing");
  }, [loading]);
  const [expandedSections, setExpandedSections] = useState({});
  const functions = getFunctions(app, "us-central1");
  const callGenerate = httpsCallable(functions, "generateHierarchicalOutline");
  const [searchParams] = useSearchParams();
  const initiativeId = searchParams.get("initiativeId") || "default";

  const parseOutline = (outline = "") =>
    outline
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((line) => {
        const match = line.match(/^(\d+(?:\.\d+)*)\s+(.*)$/);
        if (match) {
          return {
            level: match[1].split(".").length,
            text: match[2].trim(),
          };
        }
        return { level: 1, text: line.trim() };
      });

  const renumber = (items = []) => {
    const counters = [];
    return items.map((item) => {
      const lvl = item.level || 1;
      counters[lvl - 1] = (counters[lvl - 1] || 0) + 1;
      counters.length = lvl;
      return {
        ...item,
        number: counters.slice(0, lvl).join("."),
      };
    });
  };

  const ensureSubtopics = (items = []) => {
    const result = [];
    items.forEach((item, idx) => {
      result.push(item);
      if (item.level === 1) {
        const next = items[idx + 1];
        if (!next || next.level === 1) {
          result.push({ level: 2, text: "Overview" });
        }
      }
    });
    return result;
  };

  const groupLines = (items = []) => {
    const sections = [];
    items.forEach((line) => {
      if (line.level === 1) {
        sections.push({ header: line, children: [] });
      } else if (sections.length) {
        sections[sections.length - 1].children.push(line);
      }
    });
    return sections;
  };

  const formatOutline = (items = []) =>
    items.map((l) => `${l.number} ${l.text}`).join("\n");

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    setCourseOutline("");
    try {
      const { data } = await callGenerate(
        omitEmptyStrings({
          projectBrief,
          businessGoal,
          audienceProfile,
          projectConstraints,
          keyContacts,
          selectedModality,
          blendModalities,
          learningObjectives,
          sourceMaterial: sourceMaterials
            .map((f) => f.content)
            .join("\n"),
        })
      );
      const outlineItems = Array.isArray(data.outline) ? data.outline : [];
      if (!outlineItems.length) {
        throw new Error("No outline returned");
      }
      const mapped = outlineItems.map((l) => ({
        level: (l.number || "").split(".").length,
        text: l.text || "",
      }));
      const initialLines = renumber(ensureSubtopics(mapped));
      setLines(initialLines);
      setCourseOutline(formatOutline(initialLines));
    } catch (err) {
      console.error("Error generating hierarchical outline:", err);
      setError(err?.message || "Error generating hierarchical outline.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!courseOutline) {
      handleGenerate();
    } else {
      setLines(renumber(ensureSubtopics(parseOutline(courseOutline))));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseOutline]);

  useEffect(() => {
    setExpandedSections({});
  }, [lines]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (uid) {
      saveInitiative(uid, initiativeId, { courseOutline });
    }
  }, [courseOutline, initiativeId]);

  const handleManualSave = async (outline = courseOutline) => {
    const uid = auth.currentUser?.uid;
    if (uid) {
      await saveInitiative(uid, initiativeId, { courseOutline: outline });
    }
  };

  const handleLineChange = (idx, value) => {
    setLines((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], text: value };
      return updated;
    });
  };

  const handleDeleteLine = (idx) => {
    setLines((prev) => {
      const filtered = prev.filter((_, i) => i !== idx);
      return renumber(ensureSubtopics(filtered));
    });
  };

  const toggleSection = (idx) => {
    setExpandedSections((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleToggleEdit = async () => {
    if (isEditing) {
      const updated = formatOutline(renumber(lines));
      setCourseOutline(updated);
      await handleManualSave(updated);
    }
    setIsEditing((prev) => !prev);
  };

  const handleNext = async () => {
    let outlineToSave = courseOutline;
    if (isEditing) {
      outlineToSave = formatOutline(renumber(lines));
      setCourseOutline(outlineToSave);
    }
    await handleManualSave(outlineToSave);
    if (onNext) onNext();
  };

  return (
    <div
      className="initiative-card generator-result"
    >
      <h3>Hierarchical Course Outline</h3>
      {!courseOutline && (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="generator-button next-button"
        >
          {loading ? "Generating..." : "Generate Outline"}
        </button>
      )}
      {error && <p className="generator-error">{error}</p>}
      {courseOutline && (
        <>
          {!isEditing ? (
            <div className="outline-display">
              {groupLines(lines).map((section, idx) => (
                <div key={idx} className="outline-section">
                  <div
                    className="outline-header"
                    onClick={() => toggleSection(idx)}
                  >
                    <div>
                      <span className="outline-number">{section.header.number}</span>{" "}
                      {section.header.text}
                    </div>
                    <span className="outline-arrow">
                      {expandedSections[idx] ? "▼" : "▶"}
                    </span>
                  </div>
                  {expandedSections[idx] && (
                    <div className="outline-subitems">
                      {section.children.map((child, cidx) => (
                        <div
                          key={cidx}
                          className="outline-subline"
                          style={{ paddingLeft: (child.level - 2) * 20 }}
                        >
                          <span className="outline-number">{child.number}</span>{" "}
                          {child.text}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="outline-edit">
              {lines.map((line, idx) => (
                <div
                  key={idx}
                  className="outline-edit-row"
                  style={{ paddingLeft: (line.level - 1) * 20 }}
                >
                  <span className="outline-number">{line.number}</span>
                  <input
                    value={line.text}
                    onChange={(e) => handleLineChange(idx, e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => handleDeleteLine(idx)}
                    className="generator-button outline-delete"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
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
              onClick={handleToggleEdit}
              className={`generator-button ${isEditing ? "save-button" : "edit-button"}`}
            >
              {isEditing ? "Save" : "Edit"}
            </button>
            {onNext && (
              <button
                type="button"
                onClick={handleNext}
                className="generator-button next-button"
              >
                Next
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default HierarchicalOutlineGenerator;

HierarchicalOutlineGenerator.propTypes = {
  projectBrief: PropTypes.string.isRequired,
  businessGoal: PropTypes.string.isRequired,
  audienceProfile: PropTypes.string.isRequired,
  projectConstraints: PropTypes.string.isRequired,
  keyContacts: PropTypes.arrayOf(
    PropTypes.shape({ name: PropTypes.string, role: PropTypes.string })
  ).isRequired,
  selectedModality: PropTypes.string.isRequired,
  blendModalities: PropTypes.array,
  learningObjectives: PropTypes.object.isRequired,
  sourceMaterials: PropTypes.array.isRequired,
  onBack: PropTypes.func.isRequired,
  onNext: PropTypes.func,
};
