// src/ComingSoonPage.jsx
import { useState } from "react";
import { useForm } from "react-hook-form";
import { addDoc, collection } from "firebase/firestore";
import { db } from "../firebase";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Link } from "react-router-dom";

import "../App.css"; // Ensure styling is still applied

export default function ComingSoonPage() {
  const LRS_AUTH = "Basic " + btoa(import.meta.env.VITE_XAPI_BASIC_AUTH);
  // Using one form hook for the email subscription form.
  const {
    register: registerSubscription,
    handleSubmit: handleSubscriptionSubmit,
    reset: resetSubscription,
  } = useForm();

  // Separate hook for the inquiry form.
  const {
    register: registerInquiry,
    handleSubmit: handleInquirySubmit,
    reset: resetInquiry,
  } = useForm();

  const [submitted, setSubmitted] = useState(false);

  const onEmailSubmit = async (data) => {
    try {
      // Save the subscription data to the "emailList" collection.
      await addDoc(collection(db, "emailList"), data);
      setSubmitted(true);

      // Extract and default values from the data
      const name = data.name || "Unknown Name";
      const email = data.email || "unknown@example.com";
      const businessName = data.businessName || "Unknown Business";

      const xAPIStatement = {
        actor: {
          objectType: "Agent",
          name: name,
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

      // Send xAPI statement to SCORM Cloud LRS
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
      
      resetSubscription();
    } catch (error) {
      console.error("Error adding email: ", error);
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
    <div className="page-container">
      <h1 className="main-title">Thoughtify Training</h1>
      <h1 className="main-title">Coming Soon</h1>
      <p className="subtitle">
        Our AI-fueled tools and assessments help organizations of any size design impactful, future-ready learning and development initiatives.
      </p>
      
      {/* Email Subscription */}
      <Card className="glass-card">
        <CardContent>
          {submitted ? (
            <p className="success-message">Thank you for signing up! We&apos;ll keep you updated.</p>
          ) : (
            <form onSubmit={handleSubscriptionSubmit(onEmailSubmit)} className="form">
              <label className="form-label">Join our mailing list:</label>
              <Input
                type="text"
                placeholder="Your Name"
                {...registerSubscription("name", { required: true })}
                className="input"
              />
              <Input
                type="text"
                placeholder="Business Name"
                {...registerSubscription("businessName", { required: true })}
                className="input"
              />
              <Input
                type="email"
                placeholder="Enter your email"
                {...registerSubscription("email", { required: true })}
                className="input"
              />
              <Button type="submit" className="button">Subscribe</Button>
            </form>
          )}
        </CardContent>
      </Card>

      <br /><br />

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
    </div>
  );
}
