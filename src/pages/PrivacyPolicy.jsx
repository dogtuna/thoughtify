import { Link } from "react-router-dom";

export default function PrivacyPolicy() {
  return (
    <div className="privacy-policy">
      <h1>Privacy Policy</h1>
      <p>
        Thoughtify respects your privacy. This policy explains how we collect,
        use, and safeguard your information when you interact with our site.
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
      <h2>Contact Us</h2>
      <p>
        If you have any questions about this policy, please <Link to="/">contact
        us</Link>.
      </p>
    </div>
  );
}
