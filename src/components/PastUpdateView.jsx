import PropTypes from "prop-types";

const PastUpdateView = ({ update }) => {
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
    date: PropTypes.string.isRequired,
    summary: PropTypes.string.isRequired,
  }),
};

export default PastUpdateView;
