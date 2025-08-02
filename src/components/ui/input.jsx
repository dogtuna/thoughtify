import "./input.css";
import { forwardRef } from "react";
import PropTypes from "prop-types";

export const Input = forwardRef(({ className, ...props }, ref) => {
  return <input ref={ref} className={`border rounded px-2 py-1 ${className}`} {...props} />;
});

Input.propTypes = {
  className: PropTypes.string,
  type: PropTypes.string,
  placeholder: PropTypes.string,
};

// Set a display name for better debugging
Input.displayName = "Input";
