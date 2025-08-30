import { Link, useLocation } from "react-router-dom";
import "./DiscoverySidebar.css";

export default function DiscoverySidebar() {
  const location = useLocation();
  const { pathname, search } = location;
  const params = new URLSearchParams(search);
  const initiativeId = params.get("initiativeId");

  const makeUrl = (path, extra = {}) => {
    const newParams = new URLSearchParams();
    if (initiativeId) newParams.set("initiativeId", initiativeId);
    Object.entries(extra).forEach(([k, v]) => {
      if (v !== undefined && v !== null) newParams.set(k, v);
    });
    const query = newParams.toString();
    return query ? `${path}?${query}` : path;
  };

  const section = params.get("section");
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
            <Link to={makeUrl("/discovery")}>Overview</Link>
          </li>
          <li>
            <Link to={makeUrl("/discovery", { section: "tasks" })}>Tasks</Link>
            {tasksOpen && (
              <ul>
                <li>
                  <Link to={makeUrl("/action-dashboard")}>Action Dashboard</Link>
                </li>
              </ul>
            )}
          </li>
          <li>
            <Link to={makeUrl("/discovery", { section: "documents" })}>
              Documents
            </Link>
          </li>
          <li>
            <Link to={makeUrl("/discovery", { section: "questions" })}>
              Questions
            </Link>
            {questionsOpen && (
              <ul>
                <li>
                  <Link
                    to={makeUrl("/discovery", {
                      section: "questions",
                      status: "toask",
                    })}
                  >
                    Ask
                  </Link>
                </li>
                <li>
                  <Link
                    to={makeUrl("/discovery", {
                      section: "questions",
                      status: "asked",
                    })}
                  >
                    Asked
                  </Link>
                </li>
                <li>
                  <Link
                    to={makeUrl("/discovery", {
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
            <Link to={makeUrl("/messages")}>Messages</Link>
          </li>
          <li>
            <Link to={makeUrl("/project-status")}>Project Status</Link>
            {statusOpen && (
              <ul>
                <li>
                  <Link to={makeUrl("/project-status/history")}>History</Link>
                  {historyOpen && (
                    <ul>
                      <li>
                        <Link
                          to={makeUrl("/project-status/history", {
                            type: "client",
                          })}
                        >
                          Client-facing
                        </Link>
                      </li>
                      <li>
                        <Link
                          to={makeUrl("/project-status/history", {
                            type: "internal",
                          })}
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
            <Link to={makeUrl("/inquiry-map")}>Inquiry Map</Link>
          </li>
        </ul>
      </nav>
    </aside>
  );
}
