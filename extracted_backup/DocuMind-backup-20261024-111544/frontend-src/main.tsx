import React from "react"; import { createRoot } from "react-dom/client"; import { BrowserRouter } from "react-router-dom";
import App from "./App"; import { AuthProvider } from "./lib/auth"; import { I18n } from "./lib/i18n"; import "./index.css";
createRoot(document.getElementById("root")!).render(<React.StrictMode><BrowserRouter><I18n><AuthProvider><App /></AuthProvider></I18n></BrowserRouter></React.StrictMode>);
