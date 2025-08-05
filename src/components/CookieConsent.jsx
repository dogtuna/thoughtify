import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getAnalyticsConsent, setAnalyticsConsent } from "../utils/analytics.js";

const CookieConsent = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = getAnalyticsConsent();
    if (!consent) {
      setVisible(true);
    }
  }, []);

  const accept = () => {
    setAnalyticsConsent("granted");
    setVisible(false);
  };

  const decline = () => {
    setAnalyticsConsent("denied");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="cookie-consent">
      <p>
        We use cookies for analytics to improve your experience. Read our
        <Link to="/privacy"> privacy policy</Link> for more details.
      </p>
      <div className="cookie-consent-actions">
        <button onClick={accept}>Accept</button>
        <button className="decline" onClick={decline}>Decline</button>
      </div>
    </div>
  );
};

export default CookieConsent;
