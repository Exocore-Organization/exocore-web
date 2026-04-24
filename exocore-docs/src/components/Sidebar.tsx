import { NavLink } from "react-router-dom";
import { sectionsView } from "../lib/docs";

export function Sidebar() {
    const sections = sectionsView();

    return (
        <aside className="sidebar" aria-label="Documentation navigation">
            <NavLink to="/" end className={({ isActive }) => "sidebar-home" + (isActive ? " active" : "")}>
                ← Home & search
            </NavLink>

            {sections.map((section) => (
                <div key={section.id} className="sidebar-section">
                    <div className="sidebar-section-label">{section.label}</div>
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
            ))}
        </aside>
    );
}
