import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ProjectProvider } from "./context/ProjectContext.jsx";
import PropTypes from "prop-types";
import { initAnalytics, getAnalyticsConsent } from "./utils/analytics.js";

window.PropTypes = PropTypes;

const consent = getAnalyticsConsent();
if (consent === 'granted') {
  initAnalytics();
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ProjectProvider>
      <App />
    </ProjectProvider>
  </StrictMode>
);
