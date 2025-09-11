import { useNotifications } from "../context/NotificationsContext.jsx";
import { useInquiryMap } from "../context/InquiryMapContext.jsx";
import { makeIdToDisplayIdMap } from "../utils/hypotheses.js";
import { functions, auth, appCheck } from "../firebase";
import { getToken as getAppCheckToken } from "firebase/app-check";
import { httpsCallable } from "firebase/functions";
import { useState } from "react";

export default function Notifications() {
  const { notifications, markAsRead } = useNotifications();
  const { hypotheses = [] } = useInquiryMap() || {};
  const idToLetter = makeIdToDisplayIdMap(hypotheses || []);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const prettyMessage = (n) => {
    const msg = n.message || "";
    // If this notification targets a specific hypothesis (doc id like hyp-<id>),
    // replace the raw id in the message with its letter label if we know it.
    if (typeof n.id === "string" && n.id.startsWith("hyp-")) {
      const hypId = n.id.slice(4);
      const letter = idToLetter[hypId] || null;
      if (letter) {
        return msg.replaceAll(hypId, `Hypothesis ${letter}`);
      }
    }
    return msg;
  };

  return (
    <div className="notifications-page">
      <h1>Notifications</h1>
      <div style={{ marginBottom: 12 }}>
        <button
          className="generator-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setStatus("");
            try {
              // Ensure auth token is fresh (avoids 401 if token expired)
              if (!auth.currentUser) {
                alert("Please sign in to reconcile notifications.");
                setBusy(false);
                return;
              }
              if (appCheck) {
                try { await getAppCheckToken(appCheck); } catch {}
              }
              try { await auth.currentUser.getIdToken(true); } catch {}
              const callable = httpsCallable(functions, "reconcileUserNotifications");
              const res = await callable({});
              const info = res?.data?.totals || {};
              setStatus(`Reconciled. Totals — Tasks: ${info.suggestedTasks || 0}, Questions: ${info.suggestedQuestions || 0}, Hypotheses: ${info.suggestedHypotheses || 0}`);
            } catch (e) {
              setStatus("Reconcile failed. Check console.");
              console.error(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Reconciling..." : "Reconcile Counts"}
        </button>
        {status && <span style={{ marginLeft: 8, opacity: 0.8 }}>{status}</span>}
      </div>
      {notifications.length === 0 ? (
        <p>No notifications</p>
      ) : (
        <ul>
          {notifications.map((n) => (
            <li key={n.id} className="notification-item">
              <a
                href={n.href}
                onClick={() => markAsRead(n.id)}
              >
                {prettyMessage(n)}
                {n.count > 1 ? ` (${n.count})` : ""}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
