import { Outlet } from "react-router-dom";
import NavBar from "./NavBar";
import DiscoverySidebar from "./DiscoverySidebar";
import "./DiscoverySidebar.css";
import useCanonical from "../utils/useCanonical";

export default function AppShell() {
  useCanonical(window.location.href);
  return (
    <div className="app-shell">
      <NavBar />
      <DiscoverySidebar />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
