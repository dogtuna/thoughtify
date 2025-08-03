import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ProjectProvider } from "./context/ProjectContext.jsx";
import PropTypes from "prop-types";

// Ensure PropTypes is available globally for any components expecting it
window.PropTypes = PropTypes;

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ProjectProvider>
      <App />
    </ProjectProvider>
  </StrictMode>
);
