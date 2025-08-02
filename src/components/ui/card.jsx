// src/components/ui/card.jsx
import PropTypes from "prop-types";

export function Card({ children, className }) {
  return <div className={`p-4 rounded-lg shadow ${className}`}>{children}</div>;
}

export function CardContent({ children, className }) {
  return <div className={`p-2 ${className}`}>{children}</div>;
}

Card.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};

CardContent.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};
