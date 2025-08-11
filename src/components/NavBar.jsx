import { Link } from "react-router-dom";
import PropTypes from "prop-types";

// src/components/NavBar.jsx
// Smart navigation bar with conditional rendering for logged in users

const NavBar = ({ user }) => {
  return (
    <nav className="navbar">
      <ul className="nav-list">
        {user ? (
          <>
            <li className="nav-item">
              <Link to="/dashboard" className="nav-link">
                Home
              </Link>
            </li>
            <li className="nav-item dropdown">
              <span className="nav-link">Tools</span>
              <ul className="dropdown-menu">
                <li>
                  <Link to="/ai-tools" className="dropdown-link">
                    Initiatives
                  </Link>
                </li>
                <li>
                  <Link to="/ai-tools/course-outline" className="dropdown-link">
                    Outlines
                  </Link>
                </li>
                <li>
                  <Link to="/ai-tools/study-material" className="dropdown-link">
                    Study Materials
                  </Link>
                </li>
                <li>
                  <Link to="/ai-tools/assessment" className="dropdown-link">
                    Assessments
                  </Link>
                </li>
                <li>
                  <Link to="/ai-tools/lesson-content" className="dropdown-link">
                    Lesson Content
                  </Link>
                </li>
                <li>
                  <Link to="/ai-tools/storyboard" className="dropdown-link">
                    Storyboards
                  </Link>
                </li>
                <li>
                  <Link to="/ai-tools/content-assets" className="dropdown-link">
                    Content & Assets
                  </Link>
                </li>
              </ul>
            </li>
            <li className="nav-item">
              <Link to="/settings" className="nav-link">
                Settings
              </Link>
            </li>
          </>
        ) : (
          <>
            <li className="nav-item">
              <a href="#home" className="nav-link">
                Home
              </a>
            </li>
            <li className="nav-item">
              <a href="#pricing" className="nav-link">
                Pricing
              </a>
            </li>
            <li className="nav-item">
              <a href="#contact" className="nav-link">
                Contact
              </a>
            </li>
          </>
        )}
      </ul>
    </nav>
  );
};

NavBar.propTypes = {
  user: PropTypes.object,
};

export default NavBar;

