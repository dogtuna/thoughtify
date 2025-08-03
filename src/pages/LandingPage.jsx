import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import "../coreBenefits.css";
import { app } from "../firebase";
import { getAnalytics, logEvent } from "firebase/analytics";

export default function LandingPage({ openSignupModal }) {
  const [variant] = useState(() => (Math.random() < 0.5 ? "A" : "B"));

  useEffect(() => {
    const analytics = getAnalytics(app);
    logEvent(analytics, "headline_variant_view", { variant });
  }, [variant]);

  const handleJoinClick = () => {
    const analytics = getAnalytics(app);
    logEvent(analytics, "join_mailing_list_click", { variant });
    if (openSignupModal) {
      openSignupModal();
    }
  };

  const headline =
    variant === "A"
      ? "Stay ahead with Thoughtify updates"
      : "Join Thoughtify's learning revolution";

  return (
    <div className="landing-page">
      {/* Existing benefits grid would be rendered above this section */}
      <div className="core-benefits-cta">
        <h2>{headline}</h2>
        <p>Get exclusive insights and be the first to know when we launch.</p>
        <button className="join-mailing-button" onClick={handleJoinClick}>
          Join our mailing list
        </button>
      </div>
    </div>
  );
}

LandingPage.propTypes = {
  openSignupModal: PropTypes.func,
};
