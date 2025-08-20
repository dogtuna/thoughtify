import PropTypes from "prop-types";
import "../pages/admin.css";

const statuses = [
  { key: "all", label: "All Tasks" },
  { key: "open", label: "Open Tasks" },
  { key: "scheduled", label: "Scheduled Tasks" },
  { key: "completed", label: "Completed Tasks" },
];

export default function TaskSidebar({ statusFilter, onChange }) {
  return (
    <div className="tasks-sidebar">
      <ul>
        {statuses.map(({ key, label }) => (
          <li key={key}>
            <button
              type="button"
              className={statusFilter === key ? "active" : ""}
              onClick={() => onChange(key)}
            >
              {label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

TaskSidebar.propTypes = {
  statusFilter: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};
