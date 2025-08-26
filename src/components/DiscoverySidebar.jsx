import { Link, useLocation, useSearchParams } from "react-router-dom";
import "./DiscoverySidebar.css";

export default function DiscoverySidebar() {
  const location = useLocation();
  const { pathname } = location;
  const [searchParams] = useSearchParams();
  const initiativeId = searchParams.get("initiativeId") || "";
  const section = searchParams.get("section");

  const buildLink = (path, params = {}) => {
    const sp = new URLSearchParams();
    if (initiativeId) sp.set("initiativeId", initiativeId);
    Object.entries(params).forEach(([k, v]) => {
      if (v) sp.set(k, v);
    });
    const qs = sp.toString();
    return qs ? `${path}?${qs}` : path;
  };

  const tasksOpen =
    (pathname === "/discovery" && section === "tasks") ||
    pathname.startsWith("/action-dashboard");
  const questionsOpen = pathname === "/discovery" && section === "questions";
  const statusOpen = pathname.startsWith("/project-status");
  const historyOpen = pathname.startsWith("/project-status/history");

  return (
    <aside className="discovery-sidebar">
      <h2 className="sidebar-title">Discovery Hub</h2>
      <nav>
        <ul>
          <li>
            <Link to={buildLink("/discovery")}>Overview</Link>
          </li>
          <li>
            <Link to={buildLink("/discovery", { section: "tasks" })}>Tasks</Link>
            {tasksOpen && (
              <ul>
                <li>
                  <Link to={buildLink("/action-dashboard")}>Action Dashboard</Link>
                </li>
              </ul>
            )}
          </li>
          <li>
            <Link to={buildLink("/discovery", { section: "documents" })}>Documents</Link>
          </li>
          <li>
            <Link to={buildLink("/discovery", { section: "questions" })}>
              Questions
            </Link>
            {questionsOpen && (
              <ul>
                <li>
                  <Link
                    to={buildLink("/discovery", {
                      section: "questions",
                      status: "toask",
                    })}
                  >
                    Ask
                  </Link>
                </li>
                <li>
                  <Link
                    to={buildLink("/discovery", {
                      section: "questions",
                      status: "asked",
                    })}
                  >
                    Asked
                  </Link>
                </li>
                <li>
                  <Link
                    to={buildLink("/discovery", {
                      section: "questions",
                      status: "answered",
                    })}
                  >
                    Answered
                  </Link>
                </li>
              </ul>
            )}
          </li>
          <li>
            <Link to={buildLink("/project-status")}>Project Status</Link>
            {statusOpen && (
              <ul>
                <li>
                  <Link to={buildLink("/project-status/history")}>History</Link>
                  {historyOpen && (
                    <ul>
                      <li>
                        <Link
                          to={buildLink("/project-status/history", { type: "client" })}
                        >
                          Client-facing
                        </Link>
                      </li>
                      <li>
                        <Link
                          to={buildLink("/project-status/history", { type: "internal" })}
                        >
                          Internal
                        </Link>
                      </li>
                    </ul>
                  )}
                </li>
              </ul>
            )}
          </li>
          <li>
            <Link to={buildLink("/inquiry-map")}>Inquiry Map</Link>
          </li>
        </ul>
      </nav>
    </aside>
  );
}
