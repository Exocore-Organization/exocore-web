import { NavLink } from "react-router-dom";
import { sectionsView } from "../lib/docs";

// Per-section emoji badges so the sidebar reads at a glance even when
// the labels collapse on narrow screens. Falls back to ▸ for anything
// not in the map.
const SECTION_ICON: Record<string, string> = {
    overview:    "📘",
    panel:       "🔐",
    auth:        "🪪",
    dashboard:   "🏠",
    editor:      "🧑‍💻",
    projects:    "📦",
    profile:     "👤",
    social:      "💬",
    leaderboard: "🏆",
    cloud:       "☁️",
    github:      "🐙",
    screenshots: "📸",
};

export function Sidebar() {
    const sections = sectionsView();

    return (
        <aside className="sidebar" aria-label="Documentation navigation">
            <NavLink to="/" end className={({ isActive }) => "sidebar-home" + (isActive ? " active" : "")}>
                <span aria-hidden>←</span> Home &amp; search
            </NavLink>

            {sections.map((section) => {
                const icon = SECTION_ICON[section.id] || "▸";
                return (
                    <div key={section.id} className="sidebar-section">
                        <div className="sidebar-section-label">
                            <span className="sidebar-section-icon" aria-hidden>{icon}</span>
                            {section.label}
                        </div>
                        <ul className="sidebar-list">
                            {section.docs.map((doc) => (
                                <li key={doc.slug || "_root"}>
                                    <NavLink
                                        to={`/docs/${doc.slug}`}
                                        className={({ isActive }) => "sidebar-link" + (isActive ? " active" : "")}
                                    >
                                        {doc.title}
                                    </NavLink>
                                </li>
                            ))}
                        </ul>
                    </div>
                );
            })}
        </aside>
    );
}
