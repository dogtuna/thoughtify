import { useNotifications } from "../context/NotificationsContext.jsx";

export default function Notifications() {
  const { notifications, markAsRead } = useNotifications();

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
                {n.message}
                {n.count > 1 ? ` (${n.count})` : ""}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
