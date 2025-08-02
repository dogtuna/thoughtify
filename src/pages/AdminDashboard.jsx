import { useEffect, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import PropTypes from "prop-types";
import { signOut, getAuth } from "firebase/auth";
import { 
  collection, getDocs, deleteDoc, doc, addDoc, updateDoc, serverTimestamp, onSnapshot, query, where 
} from "firebase/firestore";
import { db, auth } from "../firebase";
import TaskQueue from "../components/TaskQueue";
import Inquiries from "../components/Inquiries";
import "./admin.css";

const LRS_AUTH = "Basic " + btoa(import.meta.env.VITE_XAPI_BASIC_AUTH);

export default function AdminDashboard({ user }) {
  const functionsInstance = getFunctions();

  // State for invitation generation
  const [newInvitation, setNewInvitation] = useState({
    businessName: "",
    businessEmail: "",
  });
  const [selectedInvitation, setSelectedInvitation] = useState(null);
  const [invitations, setInvitations] = useState([]);

  // Email blast state
  const [blastData, setBlastData] = useState({
    show: false,
    subject: "",
    message: "",
  });

  // Reply modal state for inquiries
  const [replyData, setReplyData] = useState({
    show: false,
    email: "",
    subject: "",
    message: "",
  });

  // Dashboard data
  const [tasks, setTasks] = useState([]);
  const [emailCount, setEmailCount] = useState(0);
  const [inquiries, setInquiries] = useState([]);

  // Fetch invitations from Firestore
  const fetchInvitations = async () => {
    try {
      const invitationSnap = await getDocs(collection(db, "invitations"));
      setInvitations(
        invitationSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      );
    } catch (error) {
      console.error("Error fetching invitations:", error);
    }
  };

  // Fetch emails, inquiries, and task queue data
  const fetchData = async () => {
    try {
      // Global email list remains unchanged.
      const emailSnap = await getDocs(collection(db, "emailList"));
      setEmailCount(emailSnap.size);
  
      // Set up a real-time listener for the inquiries in the current user’s profile.
      const profileInquiriesRef = collection(db, "profiles", user.uid, "inquiries");
      const unsubscribeInquiries = onSnapshot(
        profileInquiriesRef,
        (snapshot) => {
          const inquiriesData = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          console.log("Fetched inquiries from user profile:", inquiriesData);
          setInquiries(inquiriesData);
        },
        (error) => {
          console.error("Error fetching profile inquiries:", error);
        }
      );
  
// Fetch tasks from the current user's profile subcollection "taskQueue"
// that are not completed
const profileTasksRef = collection(db, "profiles", user.uid, "taskQueue");
const tasksQuery = query(profileTasksRef, where("status", "!=", "completed"));
const taskSnap = await getDocs(tasksQuery);
console.log("Fetched tasks from user profile:", taskSnap);
setTasks(taskSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
  
      // Optionally, return the unsubscribe function for inquiries if you need to clean up.
      return unsubscribeInquiries;
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    }
  };
  
  useEffect(() => {
    if (user) {
      fetchInvitations();
      const unsubscribeInquiries = fetchData();
      // Cleanup the onSnapshot listener on unmount
      return () => {
        if (typeof unsubscribeInquiries === "function") {
          unsubscribeInquiries();
        }
      };
    }
  }, [user]);

  // ---------- Invitation Generation & Email Blast ----------
  const handleGenerateInvitation = async () => {
    const { businessName, businessEmail } = newInvitation;
    console.log("Generating invitation with:", { businessName, businessEmail });
  
    if (!businessName.trim() || !businessEmail.trim()) {
      alert("Please enter both business name and email.");
      return;
    }
  
    const generateInvitation = httpsCallable(functionsInstance, "generateInvitation");
  
    try {
      const result = await generateInvitation({ businessName, businessEmail });
      const invitationCode = result.data.invitationCode;
      const dashboardURL = `https://thoughtify.training/dashboard?invite=${invitationCode}`;
      const emailMessage = `Hello ${businessName},

Your invitation has been generated. Please click the link below to access your custom dashboard:
      
${dashboardURL}
      
Thank you,
Thoughtify Training Team`;
      
      console.log("Send email to:", businessEmail, "with message:", emailMessage);
      const sendEmailReply = httpsCallable(functionsInstance, "sendEmailReply");
      const emailPayload = {
        recipientEmail: businessEmail,
        subject: "You're invited to take the Thoughtify Training Needs Assessment!",
        message: emailMessage,
      };
    
      const emailResult = await sendEmailReply(emailPayload);
      if (emailResult.data.success) {
        alert(`Invitation generated successfully for ${businessName} and email sent to ${businessEmail}.`);
      } else {
        alert("Invitation generated, but there was an error sending the email: " + emailResult.data.error);
      }
  
      // xAPI Statement for invitation generation
      const xAPIInvitation = {
        actor: {
          objectType: "Agent",
          name: user.displayName || user.uid || "Unknown User",
          mbox: `mailto:${user.email}`,
        },
        verb: {
          id: "http://adlnet.gov/expapi/verbs/generated",
          display: { "en-US": "generated" },
        },
        object: {
          id: `https://thoughtify.training/invitations/${invitationCode}`,
          definition: {
            name: { "en-US": "Invitation Code Generated" },
            description: {
              "en-US": `User ${user.email} generated an invitation for ${businessName}.`,
            },
          },
          objectType: "Activity",
        },
        timestamp: new Date().toISOString(),
      };
      await fetch("https://cloud.scorm.com/lrs/8FKK4XRIED/statements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Experience-API-Version": "1.0.3",
          Authorization: LRS_AUTH,
        },
        body: JSON.stringify(xAPIInvitation),
      });
  
      setNewInvitation({ businessName: "", businessEmail: "" });
      fetchInvitations();
    } catch (error) {
      console.error("Error generating invitation:", error);
      alert("Failed to generate invitation.");
    }
  };

  const openReplyModal = (inquiry) => {
    setReplyData({
      show: true,
      inquiry: inquiry,
      email: inquiry.email,
      subject: "Reply to your inquiry",
      message: "",
    });
  };

  const openBlastModal = () => {
    setBlastData({ show: true, subject: "", message: "" });
  };

  const closeBlastModal = () => {
    setBlastData({ show: false, subject: "", message: "" });
  };

  const handleSendEmailBlast = async () => {
    const authInstance = getAuth();
    const currentUser = authInstance.currentUser;
    console.log("User sending email blast:", currentUser);
    
    if (!currentUser) {
      alert("You must be logged in to send an email blast.");
      return;
    }
    
    const idToken = await currentUser.getIdToken();
    const sendEmailBlast = httpsCallable(functionsInstance, "sendEmailBlast");
    
    try {
      const response = await sendEmailBlast({
        subject: blastData.subject,
        message: blastData.message,
        __token: idToken, // Explicitly pass the token in the payload if needed
      });
    
      if (response.data.success) {
        alert("Email blast sent successfully!");
    
        // Use a unique identifier (here, using a timestamp)
        const blastId = Date.now();
        const xAPIBlast = {
          actor: {
            objectType: "Agent",
            name: currentUser.displayName || currentUser.uid || "Unknown User",
            mbox: `mailto:${currentUser.email}`,
          },
          verb: {
            id: "http://adlnet.gov/expapi/verbs/sent",
            display: { "en-US": "sent" },
          },
          object: {
            id: `https://thoughtify.training/email_blasts/${blastId}`,
            definition: {
              name: { "en-US": "Email Blast Sent" },
              description: {
                "en-US": `User ${currentUser.email} sent an email blast with the subject line: ${blastData.subject}.`,
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
          body: JSON.stringify(xAPIBlast),
        });
    
        const lrsResponseData = await lrsResponse.json();
        console.log("xAPI Response:", lrsResponseData);
    
        if (!lrsResponse.ok) {
          console.error("SCORM Cloud LRS Error:", lrsResponseData);
          throw new Error(`Failed to send xAPI statement: ${JSON.stringify(lrsResponseData)}`);
        }
        closeBlastModal();
      } else {
        alert("Error sending email blast: " + response.data.error);
      }
    } catch (error) {
      console.error("Error sending email blast:", error);
      alert("Failed to send email blast.");
    }
  };

  const handleReplyTask = async (task, replyText) => {
    try {
      // Update the task with the reply text in Firestore
      await updateDoc(doc(db, "profiles", user.uid, "taskQueue", task.id), { reply: replyText, status: "open" });

  
      // Call the Cloud Function to send the email reply
      const sendEmail = httpsCallable(functionsInstance, "sendEmailReply");
      const emailPayload = {
        recipientEmail: task.email, // assuming task.email is the recipient's email address
        subject: "Reply to your task inquiry",
        message: replyText,
      };
      const emailResponse = await sendEmail(emailPayload);
      if (!emailResponse.data.success) {
        console.error("Error sending email reply:", emailResponse.data.error);
      }
  
      // Construct and send the xAPI statement for the task reply
      const xAPIReplyTask = {
        actor: {
          objectType: "Agent",
          name: user.displayName || user.uid || "Unknown User",
          mbox: `mailto:${user.email}`,
        },
        verb: {
          id: "http://adlnet.gov/expapi/verbs/replied",
          display: { "en-US": "replied" },
        },
        object: {
          id: `https://thoughtify.training/taskQueue/${task.id}`,
          definition: {
            name: { "en-US": "Task Reply" },
            description: {
              "en-US": `User ${user.email} replied to task ${task.taskName || "Unnamed Task"} from ${task.businessName || "Unknown Business"}.`,
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
        body: JSON.stringify(xAPIReplyTask),
      });
  
      const lrsResponseData = await lrsResponse.json();
      console.log("xAPI Response for task reply:", lrsResponseData);
    } catch (error) {
      console.error("Error replying to task:", error);
    }
  };  

  const handleCompleteTask = async (task) => {
    try {
      await updateDoc(doc(db, "profiles", user.uid, "taskQueue", task.id), { completed: true, status: "completed" });
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
  
      const xAPICompleteTask = {
        actor: {
          objectType: "Agent",
          name: user.displayName || user.uid || "Unknown User",
          mbox: `mailto:${user.email}`,
        },
        verb: {
          id: "http://adlnet.gov/expapi/verbs/completed",
          display: { "en-US": "completed" },
        },
        object: {
          id: `https://thoughtify.training/taskQueue/${task.id}`,
          definition: {
            name: { "en-US": "Task Completed" },
            description: {
              "en-US": `User ${user.email} completed task: ${task.taskName || "Unnamed Task"}.`,
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
        body: JSON.stringify(xAPICompleteTask),
      });
      const lrsResponseData = await lrsResponse.json();
      console.log("xAPI Task Completion Response:", lrsResponseData);
  
      if (!lrsResponse.ok) {
        console.error("SCORM Cloud LRS Error:", lrsResponseData);
        throw new Error(`Failed to send xAPI statement: ${JSON.stringify(lrsResponseData)}`);
      }
    } catch (error) {
      console.error("Error completing task:", error);
    }
  };

  const handleDeleteTask = async (task) => {
    try {
      await deleteDoc(doc(db, "taskQueue", task.id));
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
  
      const xAPIDeleteTask = {
        actor: {
          objectType: "Agent",
          name: user.displayName || user.uid || "Unknown User",
          mbox: `mailto:${user.email}`,
        },
        verb: {
          id: "http://adlnet.gov/expapi/verbs/deleted",
          display: { "en-US": "deleted" },
        },
        object: {
          id: `https://thoughtify.training/taskQueue/${task.id}`,
          definition: {
            name: { "en-US": "Task Deleted" },
            description: {
              "en-US": `User ${user.email} deleted task: ${task.taskName || "Unnamed Task"} from task queue.`,
            },
          },
          objectType: "Activity",
        },
        timestamp: new Date().toISOString(),
      };
  
      await fetch("https://cloud.scorm.com/lrs/8FKK4XRIED/statements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Experience-API-Version": "1.0.3",
          Authorization: LRS_AUTH,
        },
        body: JSON.stringify(xAPIDeleteTask),
      });
    } catch (error) {
      console.error("Error deleting task:", error);
    }
  };

  // ---------- Inquiry Reply Modal Handlers ----------


  const closeReplyModal = () => {
    setReplyData({ show: false, email: "", subject: "", message: "" });
  };

  const handleSendReply = async () => {
    const { email, subject, message, inquiry } = replyData;
    if (!email || !subject || !message || !inquiry) {
      console.error("Missing data for sending email reply:", { email, subject, message, inquiry });
      alert("Please complete all fields before sending.");
      return;
    }
    console.log("Sending reply with data:", { email, subject, message });
    const sendEmail = httpsCallable(functionsInstance, "sendEmailReply");
    try {
      const response = await sendEmail({
        recipientEmail: email,
        subject,
        message,
      });
      if (response.data.success) {
        alert("Reply sent successfully!");
  
        // Send xAPI statement for the inquiry reply
        const xAPIReplyInquiry = {
          actor: {
            objectType: "Agent",
            name: user.displayName || user.uid || "Unknown User",
            mbox: `mailto:${user.email}`,
          },
          verb: {
            id: "http://adlnet.gov/expapi/verbs/replied",
            display: { "en-US": "replied" },
          },
          object: {
            id: `https://thoughtify.training/inquiries/${inquiry.id}`,
            definition: {
              name: { "en-US": "Inquiry Replied" },
              description: {
                "en-US": `User ${user.email} replied to inquiry from ${inquiry.businessName || "Unknown Business"}.`,
              },
            },
            objectType: "Activity",
          },
          timestamp: new Date().toISOString(),
        };
  
        await fetch("https://cloud.scorm.com/lrs/8FKK4XRIED/statements", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Experience-API-Version": "1.0.3",
            Authorization: LRS_AUTH,
          },
          body: JSON.stringify(xAPIReplyInquiry),
        });
  
        // Move the inquiry to the user's "inquiries" sub-collection with status "open"
        const userLeadsRef = collection(db, "profiles", user.uid, "inquiries");
        const inquiryData = { ...inquiry, reply: message, status: "open", repliedAt: serverTimestamp() };
        await addDoc(userLeadsRef, inquiryData);
  
        // Optionally, remove the inquiry from the global inquiries collection
        await deleteDoc(doc(db, "inquiries", inquiry.id));
        setInquiries((prev) => prev.filter((item) => item.id !== inquiry.id));
  
        closeReplyModal();
      } else {
        alert("Error sending email reply: " + response.data.error);
      }
    } catch (error) {
      console.error("Error sending reply:", error);
      alert("Failed to send reply.");
    }
  };

  // ---------- Render UI ----------
  return (
    <div className="admin-dashboard">
      <h1>Admin Dashboard</h1>
      <button
        className="logout-button"
        onClick={() => signOut(auth).catch((error) => console.error("Error signing out:", error))}
      >
        Logout
      </button>
      {selectedInvitation && (
        <div className="modal-overlay" onClick={() => setSelectedInvitation(null)}>
          <div className="modalInv" onClick={(e) => e.stopPropagation()}>
            <h3>Invitation Details</h3>
            <p>
              <strong>Business Name:</strong> {selectedInvitation.businessName}
            </p>
            <p>
              <strong>Invitation Code:</strong> {selectedInvitation.invitationCode}
            </p>
            <button onClick={() => setSelectedInvitation(null)}>Close</button>
          </div>
        </div>
      )}
      <div className="dashboard-container">
        <div className="column">
          <div className="card glass-card">
            <h2>Collected Emails</h2>
            <p className="email-count">{emailCount}</p>
            <button className="blast-button" onClick={openBlastModal}>
              Send Email Blast
            </button>
          </div>

          {/* Email Blast Modal */}
          {blastData.show && (
            <div className="modal-overlay">
              <div className="blast-modal">
                <h3>Send Email Blast</h3>
                <input
                  type="text"
                  placeholder="Subject"
                  value={blastData.subject}
                  onChange={(e) => setBlastData({ ...blastData, subject: e.target.value })}
                />
                <textarea
                  placeholder="Write your message..."
                  value={blastData.message}
                  onChange={(e) => setBlastData({ ...blastData, message: e.target.value })}
                />
                <div className="modal-buttons">
                  <button className="send-button" onClick={handleSendEmailBlast}>
                    Send
                  </button>
                  <button className="close-button" onClick={closeBlastModal}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
          <Inquiries user={user} openReplyModal={openReplyModal}
          />
        </div>

        <div className="column">
          <TaskQueue
            inquiries={inquiries}
            tasks={tasks}
            setTasks={setTasks}
            onComplete={(task) => handleCompleteTask(task)}
            onReplyTask={(task, replyText) => handleReplyTask(task, replyText)}
            onDelete={(taskId) => handleDeleteTask(taskId)}
          />
        </div>

        <div className="card glass-card">
          <h2>Generate New Invitation</h2>
          <div className="invitation-form">
            <input
              type="text"
              placeholder="Business Name"
              value={newInvitation.businessName}
              onChange={(e) =>
                setNewInvitation({ ...newInvitation, businessName: e.target.value })
              }
            />
            <input
              type="email"
              placeholder="Business Email"
              value={newInvitation.businessEmail}
              onChange={(e) =>
                setNewInvitation({ ...newInvitation, businessEmail: e.target.value })
              }
            />
            <button onClick={handleGenerateInvitation} className="wizard-button">
              Generate Invitation
            </button>
          </div>
          <h2>Generated Invitations</h2>
          {invitations.length === 0 ? (
            <p>No invitations generated yet.</p>
          ) : (
            <table className="invitations-table">
              <thead>
                <tr>
                  <th>Business Name</th>
                  <th>Business Email</th>
                  <th>Status</th>
                  <th>Last Login</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => (
                  <tr key={inv.id} onClick={() => setSelectedInvitation(inv)} style={{ cursor: "pointer" }}>
                    <td>{inv.businessName}</td>
                    <td>{inv.businessEmail}</td>
                    <td>{inv.status}</td>
                    <td>
                      {inv.lastLogin
                        ? new Date(inv.lastLogin.seconds * 1000).toLocaleString()
                        : "N/A"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Reply Modal */}
      {replyData.show && (
        <div className="modal-overlay">
          <div className="reply-modal">
            <h3>Reply to Inquiry</h3>
            <p>
              <strong>To:</strong> {replyData.email}
            </p>
            <div className="form-group">
              <label htmlFor="reply-subject">Subject:</label>
              <input
                id="reply-subject"
                type="text"
                value={replyData.subject}
                onChange={(e) => setReplyData({ ...replyData, subject: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="reply-message">Message:</label>
              <textarea
                id="reply-message"
                placeholder="Write your message..."
                value={replyData.message}
                onChange={(e) => setReplyData({ ...replyData, message: e.target.value })}
              />
            </div>
            <div className="modal-buttons">
              <button className="send-button" onClick={handleSendReply}>
                Send
              </button>
              <button className="close-button" onClick={closeReplyModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

AdminDashboard.propTypes = {
  user: PropTypes.object.isRequired,
};