import "./button.css";
import PropTypes from "prop-types";

export function Button({ children, className, ...props }) {
  return (
    <button className={`px-4 py-2 bg-blue-500 text-white rounded ${className}`} {...props}>
      {children}
    </button>
  );
}

Button.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};
