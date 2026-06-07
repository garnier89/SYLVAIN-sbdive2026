import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { silenceConsole } from "@/lib/logger";

// Neutralize noisy console.log/debug/info in production (keeps warn/error).
silenceConsole();

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
