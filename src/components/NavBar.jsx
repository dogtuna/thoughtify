import { Link } from "react-router-dom";

const NavBar = () => {
  return (
    <nav className="navbar">
      <ul className="nav-list">
        <li className="nav-item">
          <a href="#home" className="nav-link">Home</a>
        </li>
        <li className="nav-item">
          <Link to="/ai-tools" className="nav-link">
            Tools
          </Link>
        </li>
        <li className="nav-item">
          <a href="#pricing" className="nav-link">Pricing</a>
        </li>
        <li className="nav-item">
          <a href="#contact" className="nav-link">Contact</a>
        </li>
      </ul>
    </nav>
  );
};

export default NavBar;

