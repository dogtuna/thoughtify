import { Link } from "react-router-dom";
import "./DiscoverySidebar.css";

export default function DiscoverySidebar() {
  return (
    <aside className="discovery-sidebar">
      <h2 className="sidebar-title">Discovery Hub</h2>
      <nav>
        <ul>
          <li><Link to="/discovery">Overview</Link></li>
          <li><Link to="/tasks">Tasks</Link></li>
          <li><Link to="/inquiry-map">Inquiry Map</Link></li>
          <li><Link to="/ai-tools">AI Tools</Link></li>
          <li><Link to="/settings">Settings</Link></li>
        </ul>
      </nav>
    </aside>
  );
}
