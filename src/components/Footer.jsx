import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-links">
        <Link to="/privacy" className="footer-link">Privacy Policy</Link>
        <Link to="/terms" className="footer-link">Terms of Service</Link>
      </div>
      <div className="footer-social">
        <a
          href="https://twitter.com"
          target="_blank"
          rel="noopener noreferrer"
          className="footer-link"
        >
          Twitter
        </a>
        <a
          href="https://linkedin.com"
          target="_blank"
          rel="noopener noreferrer"
          className="footer-link"
        >
          LinkedIn
        </a>
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="footer-link"
        >
          GitHub
        </a>
      </div>
    </footer>
  );
};

export default Footer;

