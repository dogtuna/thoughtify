import { Link, useLocation } from "react-router-dom";
import "./DiscoverySidebar.css";

export default function DiscoverySidebar() {
  const location = useLocation();
  const { pathname, search } = location;

  const tasksOpen = pathname.startsWith("/tasks") || pathname.startsWith("/action-dashboard");
  const questionsOpen = pathname === "/discovery" && search.includes("section=questions");
  const statusOpen = pathname.startsWith("/project-status");
  const historyOpen = pathname.startsWith("/project-status/history");

  return (
    <aside className="discovery-sidebar">
      <h2 className="sidebar-title">Discovery Hub</h2>
      <nav>
        <ul>
          <li>
            <Link to="/discovery">Overview</Link>
          </li>
          <li>
            <Link to="/tasks">Tasks</Link>
            {tasksOpen && (
              <ul>
                <li>
                  <Link to="/action-dashboard">Action Dashboard</Link>
                </li>
              </ul>
            )}
          </li>
          <li>
            <Link to="/discovery?section=documents">Documents</Link>
          </li>
          <li>
            <Link to="/discovery?section=questions">Questions</Link>
            {questionsOpen && (
              <ul>
                <li>
                  <Link to="/discovery?section=questions&status=toask">Ask</Link>
                </li>
                <li>
                  <Link to="/discovery?section=questions&status=asked">Asked</Link>
                </li>
                <li>
                  <Link to="/discovery?section=questions&status=answered">Answered</Link>
                </li>
              </ul>
            )}
          </li>
          <li>
            <Link to="/project-status">Project Status</Link>
            {statusOpen && (
              <ul>
                <li>
                  <Link to="/project-status/history">History</Link>
                  {historyOpen && (
                    <ul>
                      <li>
                        <Link to="/project-status/history?type=client">Client-facing</Link>
                      </li>
                      <li>
                        <Link to="/project-status/history?type=internal">Internal</Link>
                      </li>
                    </ul>
                  )}
                </li>
              </ul>
            )}
          </li>
          <li>
            <Link to="/inquiry-map">Inquiry Map</Link>
          </li>
        </ul>
      </nav>
    </aside>
  );
}
