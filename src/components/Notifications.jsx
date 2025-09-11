import { useNotifications } from "../context/NotificationsContext.jsx";
import { useInquiryMap } from "../context/InquiryMapContext.jsx";
import { makeIdToDisplayIdMap } from "../utils/hypotheses.js";

export default function Notifications() {
  const { notifications, markAsRead } = useNotifications();
  const { hypotheses = [] } = useInquiryMap() || {};
  const idToLetter = makeIdToDisplayIdMap(hypotheses || []);

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
