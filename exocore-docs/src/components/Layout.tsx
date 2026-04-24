import { Outlet, Link, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { useEffect } from "react";

interface Props {
    sidebarOpen:    boolean;
    setSidebarOpen: (open: boolean) => void;
}

export function Layout({ sidebarOpen, setSidebarOpen }: Props) {
    const location = useLocation();

    // Auto-close the mobile sidebar whenever the route changes — the user
    // tapped a link in it; getting the content underneath back into view is
    // expected.
    useEffect(() => { setSidebarOpen(false); }, [location.pathname, setSidebarOpen]);

    // Lock body scroll while the off-canvas sidebar is open on small screens.
    useEffect(() => {
        const orig = document.body.style.overflow;
        if (sidebarOpen) document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = orig; };
    }, [sidebarOpen]);

    return (
        <div className="app-shell">
            <header className="topbar">
                <button
                    type="button"
                    className="hamburger"
                    aria-label="Toggle navigation"
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                >
                    <span /><span /><span />
                </button>
                <Link to="/" className="brand" aria-label="Exocore Docs home">
                    <span className="brand-mark" aria-hidden>
                        <svg viewBox="0 0 32 32" width="22" height="22" fill="none">
                            <defs>
                                <linearGradient id="brand-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                                    <stop offset="0" stopColor="#FFE500" />
                                    <stop offset="1" stopColor="#00FF94" />
                                </linearGradient>
                            </defs>
                            <path
                                d="M16 2 L29 9 V23 L16 30 L3 23 V9 Z"
                                stroke="url(#brand-grad)"
                                strokeWidth="2.4"
                                strokeLinejoin="round"
                            />
                            <path d="M11 12 H22 M11 16 H19 M11 20 H22" stroke="url(#brand-grad)" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                    </span>
                    <span className="brand-text">
                        Exocore <span className="brand-text-accent">Docs</span>
                    </span>
                </Link>
                <nav className="topbar-actions">
                    <a className="topbar-link" href="https://huggingface.co" target="_blank" rel="noreferrer">
                        🤗 Host
                    </a>
                    <a
                        className="topbar-link topbar-link-primary"
                        href="https://github.com/ChoruOfficial"
                        target="_blank"
                        rel="noreferrer"
                    >
                        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden>
                            <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2 .37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
                        </svg>
                        GitHub
                    </a>
                </nav>
            </header>

            <div className={`shell-body ${sidebarOpen ? "sidebar-open" : ""}`}>
                <Sidebar />
                <main className="main-pane">
                    <Outlet />
                </main>
                <div
                    className="sidebar-backdrop"
                    onClick={() => setSidebarOpen(false)}
                    aria-hidden
                />
            </div>

            <footer className="footer">
                <span>Exocore Docs · {new Date().getFullYear()}</span>
                <span className="footer-sep">·</span>
                <span>Built with Vite + React + react-markdown</span>
            </footer>
        </div>
    );
}
