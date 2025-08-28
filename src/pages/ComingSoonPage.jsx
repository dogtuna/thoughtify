// src/ComingSoonPage.jsx
import { useState } from "react";
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
import Testimonials from "../components/Testimonials";
import hero1 from "../assets/hero1.png";
import { runTool } from "../mcp/client";

import "../App.css";
import "../coreBenefits.css";

export default function ComingSoonPage({ openSignupModal }) {
  const LRS_AUTH = "Basic " + btoa(import.meta.env.VITE_XAPI_BASIC_AUTH);
  const LRS_SERVER = "https://cloud.scorm.com/lrs/8FKK4XRIED";
  const LRS_HEADERS = {
    "Content-Type": "application/json",
    "X-Experience-API-Version": "1.0.3",
    Authorization: LRS_AUTH,
  };
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
  const [signupStep, setSignupStep] = useState(1);

  const sliderItems = [
    {
      title: "Course Outline Generator",
      description: "Lays the foundation for your entire project.",
      image: "https://placehold.co/800x400?text=Course+Outline+Generator",
      alt: "Screenshot of the Course Outline Generator interface",
    },
    {
      title: "Lesson Content Generator",
      description: "Builds upon your outline to create engaging material.",
      image: "https://placehold.co/800x400?text=Lesson+Content+Generator",
      alt: "Screenshot of the Lesson Content Generator workspace",
    },
    {
      title: "Study Material Generator",
      description: "Creates reinforcement assets from your core content.",
      image: "https://placehold.co/800x400?text=Study+Material+Generator",
      alt: "Screenshot demonstrating generated study materials",
    },
    {
      title: "E-Learning Storyboard Generator",
      description:
        "Translates your lessons into a visual plan for development.",
      image: "https://placehold.co/800x400?text=Storyboard+Generator",
      alt: "Screenshot of an e-learning storyboard layout",
    },
    {
      title: "Assessment Generator",
      description:
        "Checks for understanding by creating questions tied directly to your learning objectives.",
      image: "https://placehold.co/800x400?text=Assessment+Generator",
      alt: "Screenshot of assessment questions generated from objectives",
    },
  ];

  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = () =>
    setCurrentSlide((prev) => (prev + 1) % sliderItems.length);

  const prevSlide = () =>
    setCurrentSlide((prev) => (prev - 1 + sliderItems.length) % sliderItems.length);

  const handleJoinClick = () => {
    const analytics = getAnalytics(app);
    logEvent(analytics, "join_mailing_list_click");
    setSubmitted(false);
    if (openSignupModal) {
      openSignupModal();
    }
    setShowModal(true);
    setSignupStep(1);
  };

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
    await runTool(LRS_SERVER, "statements", xAPIStatement, LRS_HEADERS);

    // 6) Clear the form and reset step
    resetSignup();
    setSignupStep(1);
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

      await runTool(LRS_SERVER, "statements", xAPIStatement, LRS_HEADERS);

      resetInquiry();
    } catch (error) {
      console.error("Error sending inquiry: ", error);
    }
  };

  return (
    <>
      <section id="home" className="hero">
        <div className="hero-content">
          <h1 className="hero-title">
            Stop Drowning in Content. Start Designing with Impact.
          </h1>
          <p className="hero-subtitle">
            Create course outlines, lessons, and assessments in minutes. No instructional design experience required.
          </p>
          <div className="hero-actions">
            <Link to="/ai-tools" className="cta-primary">
              Get Started for Free
            </Link>
            <a href="#workflow-video" className="cta-secondary">
              Watch Demo
            </a>
          </div>
        </div>
        <img
          src={hero1}
          alt="Illustration showing AI-powered course generation"
          className="hero-image"
        />
      </section>

      <section id="workflow-video" className="workflow-section">
        <h2 className="workflow-headline">
          Go from Idea to Assessment in Minutes, Not Weeks.
        </h2>
        <video
          className="workflow-video"
          controls
          aria-label="Workflow demonstration video"
        >
          <source
            src="https://www.w3schools.com/html/mov_bbb.mp4"
            type="video/mp4"
          />
          <track
            src="/workflow-demo-captions.vtt"
            kind="captions"
            srcLang="en"
            label="English captions"
            default
          />
        </video>
        <div className="workflow-steps">
          <div className="workflow-step">
            <div className="step-number">1</div>
            <h3 className="step-title">Define Your Outline</h3>
            <p className="step-description">
              Generate a structured outline for any topic in seconds.
            </p>
          </div>
          <div className="workflow-step">
            <div className="step-number">2</div>
            <h3 className="step-title">Generate Your Content</h3>
            <p className="step-description">
              Turn outlines into lessons, study aids, and storyboards with one click.
            </p>
          </div>
          <div className="workflow-step">
            <div className="step-number">3</div>
            <h3 className="step-title">Create Your Assessments</h3>
            <p className="step-description">
              Generate objective-based questions automatically.
            </p>
          </div>
        </div>
      </section>

      <div id="pricing" className="core-benefits-cta">
        <h2>Full platform coming soon.</h2>
        <p>Be the first to know when we launch.</p>
        <Button className="join-mailing-button" onClick={handleJoinClick}>
          Join the Waitlist
        </Button>
      </div>

      <section className="benefits-section">
        <h2 className="benefits-headline">Reclaim Your Time. Amplify Your Genius.</h2>
        <div className="benefits-grid">
          <div className="benefit-item">
            <span className="benefit-icon" role="img" aria-label="clock">⏰</span>
            <h3 className="benefit-title">Slash Development Time</h3>
            <ul className="benefit-description">
              <li>Automate writing and structure.</li>
              <li>Ship projects faster.</li>
            </ul>
          </div>
          <div className="benefit-item">
            <span className="benefit-icon" role="img" aria-label="lightbulb">💡</span>
            <h3 className="benefit-title">Eliminate Writer&apos;s Block</h3>
            <ul className="benefit-description">
              <li>Generate ideas, examples, and scenarios.</li>
              <li>Start with a strong draft, not a blank page.</li>
            </ul>
          </div>
          <div className="benefit-item">
            <span className="benefit-icon" role="img" aria-label="target">🎯</span>
            <h3 className="benefit-title">Ensure Instructional Soundness</h3>
            <ul className="benefit-description">
              <li>Use outlines grounded in learning principles.</li>
              <li>Keep content consistent and high quality.</li>
            </ul>
          </div>
          <div className="benefit-item">
            <span className="benefit-icon" role="img" aria-label="upward arrow">⬆️</span>
            <h3 className="benefit-title">Focus on High-Value Work</h3>
            <ul className="benefit-description">
              <li>Automate tedious tasks.</li>
              <li>Spend time on strategy and design.</li>
            </ul>
          </div>
        </div>
      </section>

      <Testimonials />

      <section id="tools" className="info-slider">
        <div
          className="slider-track"
          style={{ transform: `translateX(-${currentSlide * 100}%)` }}
        >
          {sliderItems.map((item, index) => (
            <div className="slide" key={index}>
              <img
                src={item.image}
                alt={item.alt}
                className="slide-image"
              />
              <h3 className="slide-title">{item.title}</h3>
              <p className="slide-description">{item.description}</p>
            </div>
          ))}
        </div>
        <button
          className="slider-button prev"
          onClick={prevSlide}
          aria-label="Previous"
        >
          ‹
        </button>
        <button
          className="slider-button next"
          onClick={nextSlide}
          aria-label="Next"
        >
          ›
        </button>
        <Link to="/ai-tools">
          <Button className="button">Try Our Free Tools</Button>
        </Link>
      </section>

      <section className="founder-section">
        <img
          src="https://placehold.co/400x400?text=Jonny+Davis"
          alt="Photo of Jonny Davis"
          className="founder-photo"
        />
        <div className="founder-content">
          <h2 className="founder-headline">
            Built by an Instructional Designer, for Instructional Designers.
          </h2>
          <p className="founder-text">
            I&apos;m Jonny Davis, an instructional designer with over a decade of experience. I built Thoughtify to tackle tight deadlines and repetitive work. It frees you to focus on creative, high-impact learning.
          </p>
        </div>
      </section>

      <div className="page-container">
        {/* Inquiry Form */}
      <Card id="contact" className="glass-card">
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
          <p className="privacy-notice">
            We respect your privacy; see our <Link to="/privacy">privacy policy</Link> for details.
          </p>
        </CardContent>
      </Card>
      <section className="final-cta">
        <h2 className="final-cta-headline">Ready to Revolutionize Your Workflow?</h2>
        <div className="final-cta-actions">
          <Link to="/ai-tools" className="final-cta-button">
            Get Started for Free
          </Link>
          <a href="#contact" className="final-cta-link">
            Contact Us
          </a>
        </div>
      </section>

      {showModal && (
        <div
          className="signup-overlay"
          onClick={() => {
            setShowModal(false);
            setSignupStep(1);
          }}
        >
          <div className="signup-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="close-button"
              onClick={() => {
                setShowModal(false);
                setSignupStep(1);
              }}
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
                {signupStep === 1 ? (
                  <>
                    <label htmlFor="signup-name" className="signup-label">
                      Name
                    </label>
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="Your Name"
                      {...registerSignup("name", { required: true })}
                      className="input signup-input"
                    />
                    <label htmlFor="signup-email" className="signup-label">
                      Email
                    </label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="Your Email"
                      {...registerSignup("email", { required: true })}
                      className="input signup-input"
                    />
                    <Button
                      type="button"
                      className="signup-button"
                      onClick={() => setSignupStep(2)}
                    >
                      Next
                    </Button>
                  </>
                ) : (
                  <>
                    <label
                      htmlFor="signup-business"
                      className="signup-label"
                    >
                      Business Name
                    </label>
                    <Input
                      id="signup-business"
                      type="text"
                      placeholder="Business Name"
                      {...registerSignup("businessName")}
                      className="input signup-input"
                    />
                    <Button type="submit" className="signup-button">
                      Join Mailing List
                    </Button>
                    <p className="privacy-notice">
                      We respect your privacy; see our <Link to="/privacy">privacy policy</Link> for details.
                    </p>
                  </>
                )}
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
