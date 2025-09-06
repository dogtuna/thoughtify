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
import { useMcp } from "../context/McpContext";

import "../App.css";
import "../coreBenefits.css";

export default function ComingSoonPage({ openSignupModal }) {
  const LRS_AUTH = "Basic " + btoa(import.meta.env.VITE_XAPI_BASIC_AUTH);
  const LRS_HEADERS = {
    "Content-Type": "application/json",
    "X-Experience-API-Version": "1.0.3",
    Authorization: LRS_AUTH,
  };
  const { runTool } = useMcp();
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
    await runTool("statements", xAPIStatement, LRS_HEADERS);

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

      await runTool("statements", xAPIStatement, LRS_HEADERS);

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
            Your Strategy, <span className="gradient-text">supercharged</span> by AI.
          </h1>
          <p className="hero-subtitle">
            Thoughtify OS transforms your complex project data into clear, prioritized action plans. End analysis paralysis and drive decisive execution.
          </p>
          <div className="hero-actions">
            {/* <Link to="/ai-tools" className="cta-primary">
              Get Started for Free
            </Link>
            <a href="#workflow-video" className="cta-secondary">
              Watch Demo
            </a> */}
          </div>
        </div>
        <img
          src={hero1}
          alt="Illustration showing AI-powered course generation"
          className="hero-image"
        />
      </section>

      <section id="foundation" className="foundation-section">
        <h2 className="foundation-headline">Stop Patching Cracks. Reinforce the Foundation.</h2>
        <div className="foundation-grid">
          <div className="foundation-card">
            <div className="foundation-icon" aria-hidden>🛠️</div>
            <h3 className="foundation-question">Is it a skill gap or a broken process?</h3>
            <p className="foundation-desc">
              Your leaders ask for training, but you suspect a deeper, systemic issue. Wasting resources on the wrong solution is not an option.
            </p>
          </div>
          <div className="foundation-card">
            <div className="foundation-icon" aria-hidden>🤝</div>
            <h3 className="foundation-question">Are conflicting opinions derailing your project?</h3>
            <p className="foundation-desc">
              Your stakeholders have different versions of the truth. You need to find the objective evidence to build alignment and move forward.
            </p>
          </div>
          <div className="foundation-card">
            <div className="foundation-icon" aria-hidden>📊</div>
            <h3 className="foundation-question">Drowning in data but starving for insight?</h3>
            <p className="foundation-desc">
              You have emails, documents, and interview notes, but finding the true signal in the noise is taking weeks of manual work.
            </p>
          </div>
        </div>
      </section>

      {/* Section 3: Your Strategic Co-Pilot */}
      <section id="copilot" className="copilot-section">
        <h2 className="copilot-headline">Your Strategic Co-Pilot</h2>
        <p className="copilot-sub">The AI-Powered Workflow to Find and Fix the Real Problem</p>

        {/* Sub-section 3A: Inquiry Map (text left, visual right) */}
        <div className="feature">
          <div className="feature-text">
            <h3 className="feature-title">1. Diagnose the Root Cause with the Inquiry Map</h3>
            <p className="feature-desc">
              Thoughtify's AI doesn't just summarize your data; it builds an Inquiry Map—a visual, interactive
              evidence board for your investigation. It automatically generates competing hypotheses for your
              business problem and assigns a real-time confidence score as you add evidence. You'll instantly see
              which lines of inquiry are promising and which are dead ends. No more guesswork; just a clear,
              data-driven path to the real "why."
            </p>
          </div>
          <div className="feature-visual">
            <img
              src="https://placehold.co/640x360?text=Inquiry+Map+Preview"
              alt="Preview of the Inquiry Map with hypotheses and confidence scores"
            />
          </div>
        </div>

        {/* Sub-section 3B: Action Dashboard (visual left, text right) */}
        <div className="feature reverse">
          <div className="feature-visual">
            <img
              src="https://placehold.co/640x360?text=Action+Dashboard+Preview"
              alt="Preview of the Action Dashboard with prioritized columns and task cards"
            />
          </div>
          <div className="feature-text">
            <h3 className="feature-title">2. Create a Prioritized Action Plan, Instantly</h3>
            <p className="feature-desc">
              Once the Inquiry Map has identified the root cause, the Action Dashboard answers the critical
              question, "Now what?" Instead of a disorganized to-do list, the AI intelligently prioritizes every
              task based on its strategic impact. You'll always know the one or two 'Critical' tasks you need to do
              right now to solve the problem and drive the project forward.
            </p>
          </div>
        </div>
      </section>

      <section className="benefits-section">
        <h2 className="benefits-headline">Move Faster. Act with Confidence. Drive Real Results.</h2>
        <div className="benefits-grid">
          <div className="benefit-item">
            <span className="benefit-icon" role="img" aria-label="timer">⏱️</span>
            <h3 className="benefit-title">From Weeks to Days</h3>
            <p className="benefit-description">
              Thoughtify&apos;s AI automates the most time-consuming parts of performance consulting—
              synthesizing interviews, analyzing documents, and identifying patterns. What takes a human
              consultant weeks of manual work, you can now accomplish in a fraction of the time.
            </p>
          </div>
          <div className="benefit-item">
            <span className="benefit-icon" role="img" aria-label="scales">⚖️</span>
            <h3 className="benefit-title">Replace Politics with Proof</h3>
            <p className="benefit-description">
              Stop debating opinions and start analyzing evidence. The Inquiry Map provides a single source of truth,
              visually tracking your investigation and building a data-driven case for your recommendations. Present
              your findings with unshakeable, evidence-backed confidence.
            </p>
          </div>
          <div className="benefit-item">
            <span className="benefit-icon" role="img" aria-label="target">🎯</span>
            <h3 className="benefit-title">Solve the Right Problem, Every Time</h3>
            <p className="benefit-description">
              The biggest cost is solving the wrong problem. Thoughtify ensures your efforts are focused on the true
              root cause, preventing wasted budget on ineffective solutions and directly linking your work to the
              business metrics that matter, like revenue and retention.
            </p>
          </div>
        </div>
      </section>

      {/* Demo CTA replacing social proof */}
      <section className="demo-cta-section" id="demo-cta">
        <h2 className="demo-cta-headline">Ready to Close the Gap Between Strategy and Reality?</h2>
        <p className="demo-cta-sub">
          See how Thoughtify OS can help you uncover the root causes of your most complex business challenges.
        </p>
        <div className="demo-cta-actions">
          <a href="#contact" className="demo-cta-button">Request a Demo</a>
        </div>
      </section>

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
