import { forwardRef } from "react";
import PropTypes from "prop-types";

export const Textarea = forwardRef(({ className, ...props }, ref) => {
  return <textarea ref={ref} className={`border rounded px-2 py-1 ${className}`} {...props} />;
});

Textarea.propTypes = {
  className: PropTypes.string,
  placeholder: PropTypes.string,
};

// Set a display name for better debugging
Textarea.displayName = "Textarea";
