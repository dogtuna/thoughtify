import { Outlet } from "react-router-dom";
import "./AIToolsLayout.css";

// Layout for AI tools with full width content area
const AIToolsLayout = () => {
  return (
    <div className="ai-tools-layout">
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default AIToolsLayout;
