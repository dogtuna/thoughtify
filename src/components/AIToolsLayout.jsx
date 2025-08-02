import { Link, Outlet } from "react-router-dom";
import "./AIToolsLayout.css";

const AIToolsLayout = () => {
  return (
    <div className="ai-tools-layout">
      <aside className="sidebar">
        <h2 className="sidebar-title">AI Tools</h2>
        <nav>
          <ul>
            <li>
              {/* Use relative paths here */}
              <Link to="course-outline">Course Outline Generator</Link>
            </li>
            <li>
              <Link to="study-material">Study Material Generator</Link>
            </li>
            <li>
              <Link to="assessment">Assessment Generator</Link>
            </li>
            <li>
              <Link to="lesson-content">Lesson Content Generator</Link>
            </li>
            <li>
              <Link to="storyboard">Storyboard Generator</Link>
            </li>
          </ul>
        </nav>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default AIToolsLayout;
