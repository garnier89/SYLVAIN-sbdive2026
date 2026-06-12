import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { silenceConsole } from "@/lib/logger";
import { installChunkRecovery } from "@/lib/chunkRecovery";

// Neutralize noisy console.log/debug/info in production (keeps warn/error).
silenceConsole();

// Gracefully recover from transient lazy-chunk load failures (reload once).
installChunkRecovery();

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
