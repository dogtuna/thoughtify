import { useState } from "react";
import { Link } from "react-router-dom";
import { getAnalyticsConsent, setAnalyticsConsent } from "../utils/analytics.js";

export default function PrivacyPolicy() {
  const [consent, setConsent] = useState(getAnalyticsConsent());

  const updateConsent = (value) => {
    setAnalyticsConsent(value);
    setConsent(value);
  };

  return (
    <div className="privacy-policy">
      <h1>Privacy Policy</h1>
      <p>
        Thoughtify respects your privacy. This policy explains how we collect,
        use, and safeguard your information when you interact with our site.
        We comply with the General Data Protection Regulation (GDPR) and the
        California Consumer Privacy Act (CCPA).
      </p>
      <h2>Information We Collect</h2>
      <p>
        We collect personal details that you choose to share, such as your name
        and email address when signing up or sending an inquiry.
      </p>
      <h2>How We Use Information</h2>
      <p>
        Your information is used to respond to messages, send updates, and
        improve our services. We do not sell your personal data.
      </p>
      <h2>Cookies and Analytics</h2>
      <p>
        We use Google Analytics to understand how visitors use our site. Analytics
        cookies are only set after you give consent. You can change your
        preference at any time below.
      </p>
      <p>
        Current analytics preference: {consent === "granted" ? "Enabled" : "Disabled"}.
      </p>
      <div className="cookie-consent-actions">
        <button onClick={() => updateConsent("granted")}>Enable Analytics</button>
        <button className="decline" onClick={() => updateConsent("denied")}>Disable Analytics</button>
      </div>
      <h2>Your Rights</h2>
      <p>
        Depending on your location, you may have rights to access, correct, or
        delete your personal data and to opt out of certain processing. To
        exercise these rights, please <Link to="/">contact us</Link>.
      </p>
      <h2>Contact Us</h2>
      <p>
        If you have any questions about this policy, please <Link to="/">contact
        us</Link>.
      </p>
    </div>
  );
}
