import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";

// HashRouter (not BrowserRouter) so the docs site works on every dumb static
// host — Hugging Face Spaces, GitHub Pages, IPFS, S3 — without needing a
// rewrite rule for client-side routes. URL fragment handling stays inside
// the SPA.
ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <HashRouter>
            <App />
        </HashRouter>
    </React.StrictMode>,
);
