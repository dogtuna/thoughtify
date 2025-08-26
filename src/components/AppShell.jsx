import { Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import NavBar from "./NavBar";
import DiscoverySidebar from "./DiscoverySidebar";
import "./DiscoverySidebar.css";
import { auth } from "../firebase";
import useCanonical from "../utils/useCanonical";

export default function AppShell() {
  const [loggedIn, setLoggedIn] = useState(false);
  useCanonical(window.location.href);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setLoggedIn(!!user));
    return () => unsub();
  }, []);

  return (
    <div className="app-shell">
      <NavBar />
      {loggedIn && <DiscoverySidebar />}
      <main className={loggedIn ? "app-main" : "app-main full"}>
        <Outlet />
      </main>
    </div>
  );
}
