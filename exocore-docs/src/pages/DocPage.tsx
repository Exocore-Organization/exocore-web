import { useParams, Link, Navigate } from "react-router-dom";
import { findBySlug, DOCS } from "../lib/docs";
import { MarkdownView } from "../components/MarkdownView";
import { SearchBox } from "../components/SearchBox";

export function DocPage() {
    const params = useParams();
    // React-Router's `*` wildcard arrives as params["*"]
    const raw = params["*"] || "";
    const doc = findBySlug(raw) || findBySlug(raw + "/");
    if (!doc) return <Navigate to="/404" replace />;

    // Build an in-page sibling list: the next/prev doc inside the same section.
    const idx = DOCS.findIndex((d) => d.slug === doc.slug);
    const prev = idx > 0                ? DOCS[idx - 1] : null;
    const next = idx < DOCS.length - 1  ? DOCS[idx + 1] : null;

    return (
        <div className="doc-page">
            <nav className="breadcrumb" aria-label="Breadcrumb">
                <Link to="/">Home</Link>
                {doc.breadcrumbs.map((b, i) => (
                    <span key={i} className="crumb">
                        <span className="crumb-sep">/</span>
                        <span>{b}</span>
                    </span>
                ))}
            </nav>

            <div className="doc-page-search">
                <SearchBox placeholder="Search inside the docs…" />
            </div>

            <MarkdownView body={doc.body} baseSlug={doc.slug} />

            <nav className="doc-pager" aria-label="Document navigation">
                <div className="doc-pager-cell">
                    {prev && (
                        <Link to={`/docs/${prev.slug}`} className="doc-pager-link prev">
                            <span className="doc-pager-dir">← Previous</span>
                            <span className="doc-pager-title">{prev.title}</span>
                        </Link>
                    )}
                </div>
                <div className="doc-pager-cell right">
                    {next && (
                        <Link to={`/docs/${next.slug}`} className="doc-pager-link next">
                            <span className="doc-pager-dir">Next →</span>
                            <span className="doc-pager-title">{next.title}</span>
                        </Link>
                    )}
                </div>
            </nav>
        </div>
    );
}
