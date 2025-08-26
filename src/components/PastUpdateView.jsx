import PropTypes from "prop-types";
import useCanonical from "../utils/useCanonical";
import { canonicalUpdateUrl } from "../utils/canonical";

const PastUpdateView = ({ update }) => {
  useCanonical(update?.id ? canonicalUpdateUrl(update.id) : window.location.href);
  if (!update) return null;
  const copy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(update.summary);
    }
  };
  return (
    <div className="project-status-section">
      <h3>Update from {new Date(update.date).toDateString()}</h3>
      <div className="initiative-card">
        <pre style={{ whiteSpace: "pre-wrap" }}>{update.summary}</pre>
      </div>
      <div className="status-actions">
        <button className="generator-button" onClick={copy}>
          Copy to Clipboard
        </button>
      </div>
    </div>
  );
};

PastUpdateView.propTypes = {
  update: PropTypes.shape({
    id: PropTypes.string,
    date: PropTypes.string.isRequired,
    summary: PropTypes.string.isRequired,
  }),
};

export default PastUpdateView;
