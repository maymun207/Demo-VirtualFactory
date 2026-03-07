/**
 * main.tsx — Vite Application Entry Point
 *
 * Mounts the React application into the DOM element with id="root".
 * Uses React.StrictMode for development-time checks.
 * Imports index.css for global styles (responsive root font scaling).
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
