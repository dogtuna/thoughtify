/* eslint-disable no-unused-vars */
// src/Inquiries.jsx
import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import "../pages/admin.css";
import {
  collection, deleteDoc, doc, getDocs, addDoc, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

const LRS_AUTH = "Basic " + btoa(import.meta.env.VITE_XAPI_BASIC_AUTH);

export default function NewInquiries({ user, openReplyModal }) {
  const [selectedItem, setSelectedItem] = useState(null);
  const [replyData, setReplyData] = useState("");
  const [allInquiries, setAllInquiries] = useState([]);

  // Fetch inquiries from Firestore
  const fetchAllInquiries = async () => {
    try {
      const inquirySnap = await getDocs(collection(db, "inquiries"));
      setAllInquiries(
        inquirySnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      );
    } catch (error) {
      console.error("Error fetching inquiries:", error);
    }
  };

  useEffect(() => {
    if (user) {
      fetchAllInquiries();
    }
  }, [user]);

  // const openReplyModal = (inquiry) => {
  //   setReplyData({
  //     show: true,
  //     inquiry: inquiry,
  //     email: inquiry.email,
  //     businessName: inquiry.businessName,
  //     subject: "Reply to your inquiry",
  //     message: "",
  //   });
  // };

  const handleDeleteInquiry = async (inquiry) => {
    try {
      await deleteDoc(doc(db, "inquiries", inquiry.id));
      setAllInquiries((prev) => prev.filter((item) => item.id !== inquiry.id));

      const xAPIDeleteInquiry = {
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
          id: `https://thoughtify.training/inquiries/${inquiry.id}`,
          definition: {
            name: { "en-US": "Inquiry Deleted" },
            description: {
              "en-US": `User ${user.email} deleted inquiry from ${inquiry.businessName || "Unknown Business"}.`,
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
        body: JSON.stringify(xAPIDeleteInquiry),
      });
    } catch (error) {
      console.error("Error deleting inquiry:", error);
    }
  };

  const handleMoveToTaskQueue = async (inquiry) => {
    try {
      console.log(`Moving inquiry to task queue: ${inquiry.id}`);
      // Remove the 'id' field from inquiry data
      const { id, ...inquiryData } = inquiry;
      inquiryData.status = "claimed";
      inquiryData.movedAt = serverTimestamp();

      const userTaskQueueRef = collection(db, "profiles", user.uid, "taskQueue");
      const docRef = await addDoc(userTaskQueueRef, inquiryData);
      console.log(`Inquiry moved to task queue. New Firestore ID: ${docRef.id}`);

      // Optionally remove the inquiry from the global inquiries collection
      await deleteDoc(doc(db, "inquiries", inquiry.id));

      // Update local state: remove this inquiry from the list
      setAllInquiries((prev) => prev.filter((item) => item.id !== inquiry.id));

      // Send xAPI statement
      const xAPIMoveInquiry = {
        actor: {
          objectType: "Agent",
          name: user.displayName || user.uid || "Unknown User",
          mbox: `mailto:${user.email}`,
        },
        verb: {
          id: "http://adlnet.gov/expapi/verbs/moved",
          display: { "en-US": "moved" },
        },
        object: {
          id: `https://thoughtify.training/inquiries/${inquiry.id}`,
          definition: {
            name: { "en-US": "Inquiry Moved to Task Queue" },
            description: {
              "en-US": `User ${user.email} moved inquiry from ${inquiry.name} at ${inquiry.businessName || "Unknown Business"} to task queue.`,
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
        body: JSON.stringify(xAPIMoveInquiry),
      });
    } catch (error) {
      console.error("Error moving inquiry to task queue:", error);
    }
  };

  return (
    <div className="card glass-card">
      <h2>Inquiries</h2>
      <ul className="inquiry-list">
        {allInquiries.length === 0 ? (
          <p>No new inquiries.</p>
        ) : (
          allInquiries.map((inquiry) => (
            <li key={inquiry.id} className="inquiry-item">
              <strong>{inquiry.name} ({inquiry.email})</strong>
              <p>{inquiry.message}</p>
              <div className="inquiry-actions">
                <button className="task-button" onClick={() => handleMoveToTaskQueue(inquiry)}>
                  Move to Task Queue
                </button>
                <button className="reply-button" onClick={() => openReplyModal(inquiry)}>
                  Reply
                </button>
                <button className="delete-button" onClick={() => handleDeleteInquiry(inquiry)}>
                  Delete
                </button>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

NewInquiries.propTypes = {
  user: PropTypes.object.isRequired,
  openReplyModal: PropTypes.func.isRequired,
};
