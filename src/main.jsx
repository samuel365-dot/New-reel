import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { installAndroidPlatform } from "./platform/android.js";
import "./designs.css";
import "./mobile.css";

// Reel is an Android app: install the `window.reel` bridge (Capacitor plugins) before the app renders.
installAndroidPlatform();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
