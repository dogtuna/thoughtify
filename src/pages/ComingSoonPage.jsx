// src/ComingSoonPage.jsx
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { addDoc, collection } from "firebase/firestore";
import { getAnalytics, logEvent } from "firebase/analytics";
import { app, db } from "../firebase";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Link } from "react-router-dom";
import PropTypes from "prop-types";

import "../App.css";
import "../coreBenefits.css";

export default function ComingSoonPage({ openSignupModal }) {
  console.log("VITE_XAPI_BASIC_AUTH raw:", import.meta.env.VITE_XAPI_BASIC_AUTH);
const LRS_AUTH = "Basic " + btoa(import.meta.env.VITE_XAPI_BASIC_AUTH);
console.log("LRS_AUTH header:", LRS_AUTH);
  const {
    register: registerSignup,
    handleSubmit: handleSignupSubmit,
    reset: resetSignup,
  } = useForm();

  // Separate hook for the inquiry form.
  const {
    register: registerInquiry,
    handleSubmit: handleInquirySubmit,
    reset: resetInquiry,
  } = useForm();

  const [submitted, setSubmitted] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [variant] = useState(() => (Math.random() < 0.5 ? "A" : "B"));

  useEffect(() => {
    const analytics = getAnalytics(app);
    logEvent(analytics, "headline_variant_view", { variant });
  }, [variant]);

  const handleJoinClick = () => {
    const analytics = getAnalytics(app);
    logEvent(analytics, "join_mailing_list_click", { variant });
    setSubmitted(false);
    if (openSignupModal) {
      openSignupModal();
    }
    setShowModal(true);
  };

  const headline =
    variant === "A"
      ? "Stay ahead with Thoughtify updates"
      : "Join Thoughtify's learning revolution";

const onEmailSubmit = async (data) => {
  try {
    // 1) Save to Firestore
    await addDoc(collection(db, "emailList"), data);
    setSubmitted(true);

    // 2) Build xAPI statement
    const name = data.name || "Unknown Name";
    const email = data.email || "unknown@example.com";
    const businessName = data.businessName || "Unknown Business";

    const xAPIStatement = {
      actor: {
        objectType: "Agent",
        name,
        mbox: `mailto:${email}`,
      },
      verb: {
        id: "http://adlnet.gov/expapi/verbs/subscribed",
        display: { "en-US": "subscribed" },
      },
      object: {
        id: `https://thoughtify.training/subscribed/email_list`,
        definition: {
          name: { "en-US": "Subscribed to email list" },
          description: {
            "en-US": `User ${name} - ${email} from ${businessName} has subscribed to the email list.`,
          },
        },
        objectType: "Activity",
      },
      timestamp: new Date().toISOString(),
    };

    // 3) Send to SCORM Cloud LRS
    const lrsResponse = await fetch(
      "https://cloud.scorm.com/lrs/8FKK4XRIED/statements",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Experience-API-Version": "1.0.3",
          Authorization: LRS_AUTH,
        },
        body: JSON.stringify(xAPIStatement),
      }
    );

    // 4) Safely parse the response (JSON or plain text)
    let lrsResponseData;
    const contentType = lrsResponse.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      lrsResponseData = await lrsResponse.json();
    } else {
      lrsResponseData = await lrsResponse.text();
    }
    console.log("xAPI raw response:", lrsResponseData);

    // 5) Handle HTTP errors
    if (!lrsResponse.ok) {
      console.error("SCORM Cloud LRS Error:", lrsResponseData);
      throw new Error(
        `Failed to send xAPI statement: ${lrsResponseData}`
      );
    }

    // 6) Clear the form
    resetSignup();
  } catch (error) {
    console.error("Error adding email or sending xAPI:", error);
  }
};
  const onInquirySubmit = async (data) => {
    try {
      const inquiryData = {
        ...data,
        status: "new",
      };
  
      await addDoc(collection(db, "inquiries"), inquiryData);

      const xAPIStatement = {
        actor: {
          objectType: "Agent",
          name: data.name || "Unknown User",
          mbox: `mailto:${data.email}`,
        },
        verb: {
          id: "http://adlnet.gov/expapi/verbs/submitted",
          display: { "en-US": "submitted" },
        },
        object: {
          id: `https://thoughtify.training/inquiry`,
          definition: {
            name: { "en-US": "Inquiry sent" },
            description: {
              "en-US": `User ${data.email} sent an inquiry with message: ${data.message}.`,
            },
          },
          objectType: "Activity",
        },
        timestamp: new Date().toISOString(),
      };

      const lrsResponse = await fetch("https://cloud.scorm.com/lrs/8FKK4XRIED/statements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Experience-API-Version": "1.0.3",
          Authorization: LRS_AUTH,
        },
        body: JSON.stringify(xAPIStatement),
      });

      const lrsResponseData = await lrsResponse.json();
      console.log("xAPI Response:", lrsResponseData);

      if (!lrsResponse.ok) {
        console.error("SCORM Cloud LRS Error:", lrsResponseData);
        throw new Error(`Failed to send xAPI statement: ${JSON.stringify(lrsResponseData)}`);
      }

      resetInquiry();
    } catch (error) {
      console.error("Error sending inquiry: ", error);
    }
  };

  return (
    <>
      <section className="hero">
        <div className="hero-content">
          <h1 className="hero-title">
            Stop Drowning in Content. Start Designing with Impact.
          </h1>
          <p className="hero-subtitle">
            Thoughtify.Training is your AI partner for instructional design. Our integrated suite automates the repetitive tasks, freeing you to focus on the strategic and creative work you love.
          </p>
        </div>
        <img
          src="https://placehold.co/600x400?text=Thoughtify"
          alt="Thoughtify Training illustration"
          className="hero-image"
        />
      </section>

      <section className="cta-section">
        <a href="#workflow-video" className="cta-primary">
          Watch the 2-Minute Workflow
        </a>
        <Link to="/ai-tools" className="cta-secondary">
          Or, start building now →
        </Link>
      </section>

      <section id="workflow-video" className="workflow-section">
        <h2 className="workflow-headline">
          Go from Idea to Assessment in Minutes, Not Weeks.
        </h2>
        <img
          src="https://placehold.co/800x450?text=Workflow+Video"
          alt="Workflow demo placeholder"
          className="workflow-video"
        />
        <div className="workflow-steps">
          <div className="workflow-step">
            <div className="step-number">1</div>
            <h3 className="step-title">Define Your Outline</h3>
            <p className="step-description">
              Instantly generate a pedagogically sound structure for any topic.
            </p>
          </div>
          <div className="workflow-step">
            <div className="step-number">2</div>
            <h3 className="step-title">Generate Your Content</h3>
            <p className="step-description">
              Transform your outline into rich lesson content, study materials, and storyboards with a single click.
            </p>
          </div>
          <div className="workflow-step">
            <div className="step-number">3</div>
            <h3 className="step-title">Create Your Assessments</h3>
            <p className="step-description">
              Automatically create relevant, objective-based questions from your generated content.
            </p>
          </div>
        </div>
      </section>

      <div className="page-container">
        {/* Inquiry Form */}
        <Card className="glass-card">
          <CardContent>
            <form onSubmit={handleInquirySubmit(onInquirySubmit)} className="form">
            <label className="form-label">Have a question? Reach out to us:</label>
            <Input
              type="text"
              placeholder="Your Name"
              {...registerInquiry("name", { required: true })}
              className="input"
            />
            <Input
              type="text"
              placeholder="Business Name"
              {...registerInquiry("businessName", { required: true })}
              className="input"
            />
            <Input
              type="email"
              placeholder="Your Email"
              {...registerInquiry("email", { required: true })}
              className="input"
            />
            <Textarea
              placeholder="Your Message"
              {...registerInquiry("message", { required: true })}
              className="textarea"
            />
            <Button type="submit" className="button">Send</Button>
          </form>
        </CardContent>
      </Card>

      <br /><br />

      {/* New Section: Try our free AI tools */}
      <Card className="glass-card">
        <CardContent>
          <h2>Try our free AI tools</h2>
          <div className="ai-tools-links" style={{ display: "flex", justifyContent: "center", gap: "20px", marginTop: "20px" }}>
            <Link to="/ai-tools/course-outline" style={{
              padding: "10px 20px",
              backgroundColor: "#8C259E",
              color: "white",
              borderRadius: "6px",
              textDecoration: "none",
              fontWeight: "bold"
            }}>
              Course Outline Generator
            </Link>
            <Link to="/ai-tools/study-material" style={{
              padding: "10px 20px",
              backgroundColor: "#8C259E",
              color: "white",
              borderRadius: "6px",
              textDecoration: "none",
              fontWeight: "bold"
            }}>
              Study Material Generator
            </Link>
            <Link to="/ai-tools/assessment" style={{
              padding: "10px 20px",
              backgroundColor: "#8C259E",
              color: "white",
              borderRadius: "6px",
              textDecoration: "none",
              fontWeight: "bold"
            }}>
              Assessment Generator
            </Link>
            <Link to="/ai-tools/lesson-content" style={{
              padding: "10px 20px",
              backgroundColor: "#8C259E",
              color: "white",
              borderRadius: "6px",
              textDecoration: "none",
              fontWeight: "bold"
            }}>
              Lesson Content Generator
            </Link>
            <Link to="/ai-tools/storyboard" style={{
              padding: "10px 20px",
              backgroundColor: "#8C259E",
              color: "white",
              borderRadius: "6px",
              textDecoration: "none",
              fontWeight: "bold"
            }}>
              E-Learning Storyboard Generator
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="core-benefits-cta">
        <h2>{headline}</h2>
        <p>Get exclusive insights and be the first to know when we launch.</p>
        <Button className="join-mailing-button" onClick={handleJoinClick}>
          Join our mailing list
        </Button>
      </div>

      {showModal && (
        <div className="signup-overlay" onClick={() => setShowModal(false)}>
          <div className="signup-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="close-button"
              onClick={() => setShowModal(false)}
              aria-label="Close"
            >
              &times;
            </button>
            {submitted ? (
              <p className="success-message">
                Thank you for signing up! We&apos;ll keep you updated.
              </p>
            ) : (
              <form
                onSubmit={handleSignupSubmit(onEmailSubmit)}
                className="signup-form"
              >
                <Input
                  type="text"
                  placeholder="Your Name"
                  {...registerSignup("name", { required: true })}
                  className="input signup-input"
                />
                <Input
                  type="email"
                  placeholder="Your Email"
                  {...registerSignup("email", { required: true })}
                  className="input signup-input"
                />
                <Button type="submit" className="signup-button">
                  Sign Up
                </Button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  </>
  );
}

ComingSoonPage.propTypes = {
  openSignupModal: PropTypes.func,
};
