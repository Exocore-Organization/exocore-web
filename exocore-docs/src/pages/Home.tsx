import { Link } from "react-router-dom";
import { SearchBox } from "../components/SearchBox";
import { sectionsView, DOCS } from "../lib/docs";

const HIGHLIGHTS: Array<{ slug: string; tag: string }> = [
    { slug: "panel/",       tag: "Gate" },
    { slug: "auth/",        tag: "Auth" },
    { slug: "dashboard/",   tag: "Workspace" },
    { slug: "editor/",      tag: "IDE" },
    { slug: "social/",      tag: "Realtime" },
    { slug: "leaderboard/", tag: "Gamified" },
    { slug: "projects/",    tag: "Projects" },
    { slug: "cloud/",       tag: "Drive" },
    { slug: "github/",      tag: "Git" },
];

interface Props {
    onSidebarOpen?: () => void;
}

export function Home({ onSidebarOpen }: Props) {
    const sections = sectionsView();
    const root     = DOCS.find((d) => d.slug === "" || d.slug === "/");

    return (
        <div className="home">
            <section className="hero">
                <span className="hero-eyebrow">Exocore · 2026 docs</span>
                <h1 className="hero-title">Browser-based IDE, social platform, and developer panel — all under one roof.</h1>
                <p className="hero-sub">
                    Search every page, jump straight to the editor walkthrough, browse panel-gate
                    setup, or dive into the social / leaderboard / GitHub guides. Press
                    <kbd>/</kbd> anywhere to focus search.
                </p>
                <SearchBox autoFocus placeholder="Search docs · routes · modules · features…" />
                {root && (
                    <p className="hero-cta">
                        New here? Start with the <Link to={`/docs/${root.slug}`}>Overview</Link>.
                        On mobile? <button type="button" className="hero-link" onClick={onSidebarOpen}>open the sidebar</button>.
                    </p>
                )}
            </section>

            <section className="section">
                <h2 className="section-title">Featured sections</h2>
                <div className="card-grid">
                    {HIGHLIGHTS.map((h) => {
                        const doc = DOCS.find((d) => d.slug === h.slug);
                        if (!doc) return null;
                        return (
                            <Link key={h.slug} to={`/docs/${doc.slug}`} className="doc-card">
                                <div className="doc-card-tag">{h.tag}</div>
                                <div className="doc-card-title">{doc.title}</div>
                                <p className="doc-card-excerpt">{doc.excerpt || "—"}</p>
                                <span className="doc-card-cta">Read →</span>
                            </Link>
                        );
                    })}
                </div>
            </section>

            <section className="section">
                <h2 className="section-title">All pages ({DOCS.length})</h2>
                <div className="all-grid">
                    {sections.map((section) => (
                        <div key={section.id} className="all-section">
                            <div className="all-section-label">{section.label}</div>
                            <ul className="all-section-list">
                                {section.docs.map((doc) => (
                                    <li key={doc.slug || "_root"}>
                                        <Link to={`/docs/${doc.slug}`}>{doc.title}</Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
