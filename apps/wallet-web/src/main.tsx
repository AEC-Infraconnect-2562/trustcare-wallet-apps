import React from "react";
import { createRoot } from "react-dom/client";
import { LanguageProvider } from "@trustcare/i18n/src/provider.web";
import App from "./App";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>
);

