import NavBar from "./components/NavBar";
import Footer from "./components/Footer";
import CookieConsent from "./components/CookieConsent";
import { Outlet } from "react-router-dom";
import "./App.css";

export default function App() {
  return (
    <>
      <NavBar />
      <Outlet />
      <Footer />
      <CookieConsent />
    </>
  );
}
