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
                <Link to="/" className="brand">
                    <span className="brand-mark">E</span>
                    <span className="brand-text">Exocore Docs</span>
                </Link>
                <nav className="topbar-actions">
                    <a className="topbar-link" href="https://huggingface.co" target="_blank" rel="noreferrer">
                        Host
                    </a>
                    <a
                        className="topbar-link"
                        href="https://github.com/ChoruOfficial"
                        target="_blank"
                        rel="noreferrer"
                    >
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
