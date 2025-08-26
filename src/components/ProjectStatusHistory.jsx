import { useSearchParams } from "react-router-dom";
import useCanonical from "../utils/useCanonical";

export default function ProjectStatusHistory() {
  const [searchParams] = useSearchParams();
  const type = searchParams.get("type") || "client";
  useCanonical(window.location.href);
  return (
    <div className="project-status-section">
      <h3>{type === "internal" ? "Internal" : "Client-facing"} Updates</h3>
    </div>
  );
}
