/**
 * Build-time docs index.
 *
 * `import.meta.glob` pulls every Markdown file under `../exocore-web/docs/`
 * into the bundle as a raw string. We then turn each path into a routable
 * doc record with a slug, title, section, breadcrumb, and full body — all
 * available synchronously to the search box on the home page (no extra
 * network round-trip on a static host).
 */
const RAW = import.meta.glob("../../../exocore-web/docs/**/*.md", {
    query:  "?raw",
    import: "default",
    eager:  true,
}) as Record<string, string>;

export interface DocRecord {
    /** Stable URL slug, e.g. `editor/` for docs/editor/README.md or `editor/sub` for docs/editor/sub.md. */
    slug:        string;
    /** First H1 in the file, falling back to the directory name. */
    title:       string;
    /** Top-level section folder (panel / auth / dashboard / …). `""` for the root README. */
    section:     string;
    /** Pretty breadcrumb segments like `["Editor"]` or `["Editor", "Languages"]`. */
    breadcrumbs: string[];
    /** Full markdown body — exactly what shipped on disk. */
    body:        string;
    /** First paragraph after the H1 (used as a search-result preview). */
    excerpt:     string;
    /** Lower-cased, whitespace-collapsed copy of the body for fast `includes` search. */
    haystack:    string;
}

const FOLDER_LABELS: Record<string, string> = {
    panel:       "Panel Gate",
    auth:        "Auth",
    dashboard:   "Dashboard",
    profile:     "Profile",
    social:      "Social",
    leaderboard: "Leaderboard",
    projects:    "Projects",
    cloud:       "Cloud Drive",
    github:      "GitHub",
    editor:      "Editor / IDE",
    screenshots: "Screenshots",
};

function prettify(name: string): string {
    if (FOLDER_LABELS[name]) return FOLDER_LABELS[name];
    return name
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function firstHeading(md: string): string | null {
    const m = md.match(/^\s*#\s+(.+?)\s*$/m);
    return m ? m[1].trim() : null;
}

function firstParagraph(md: string): string {
    // Strip H1, blockquotes, code fences, and tables, then grab the first
    // non-empty paragraph.
    const trimmed = md
        .replace(/^\s*#\s+.+$/m, "")
        .replace(/^>.*$/gm, "")
        .replace(/```[\s\S]*?```/g, "")
        .replace(/^\|.*\|$/gm, "")
        .trim();
    const para = trimmed.split(/\n{2,}/).find((p) => p.trim().length > 0) || "";
    return para.replace(/\s+/g, " ").slice(0, 220);
}

function buildIndex(): DocRecord[] {
    const records: DocRecord[] = [];
    for (const [absPath, body] of Object.entries(RAW)) {
        // absPath ends with /exocore-web/docs/<...>.md — strip everything up
        // to and including `/docs/` to get the relative path.
        const m = absPath.match(/\/docs\/(.+\.md)$/i);
        if (!m) continue;
        const rel = m[1];

        // Compute slug: README.md collapses to its folder, anything else
        // keeps its own filename (sans .md).
        const segments = rel.split("/");
        const file     = segments.pop()!;
        let slug: string;
        if (/^readme\.md$/i.test(file)) {
            slug = segments.join("/") + "/";
            if (slug === "/") slug = "";
        } else {
            slug = [...segments, file.replace(/\.md$/i, "")].join("/");
        }

        const section = segments[0] || "";
        const heading = firstHeading(body);
        const title   = heading || (segments.length ? prettify(segments[segments.length - 1]) : "Overview");
        const breadcrumbs = segments.length ? segments.map(prettify) : ["Overview"];
        const excerpt  = firstParagraph(body);
        const haystack = (title + " " + body).toLowerCase().replace(/\s+/g, " ");

        records.push({ slug, title, section, breadcrumbs, body, excerpt, haystack });
    }

    // Stable order: root first, then alphabetical by slug.
    records.sort((a, b) => {
        if (a.slug === "" || a.slug === "/") return -1;
        if (b.slug === "" || b.slug === "/") return  1;
        return a.slug.localeCompare(b.slug);
    });

    return records;
}

export const DOCS: DocRecord[] = buildIndex();

export function findBySlug(slug: string): DocRecord | undefined {
    const normalized = slug.replace(/^\/+/, "").replace(/\/{2,}/g, "/");
    return (
        DOCS.find((d) => d.slug === normalized) ||
        // try with trailing slash variant
        DOCS.find((d) => d.slug === normalized + "/") ||
        DOCS.find((d) => d.slug.replace(/\/$/, "") === normalized.replace(/\/$/, ""))
    );
}

/** Group docs into top-level sections for the sidebar / home grid. */
export interface DocSection {
    id:    string;
    label: string;
    docs:  DocRecord[];
}

export function sectionsView(): DocSection[] {
    const map = new Map<string, DocRecord[]>();
    for (const d of DOCS) {
        const id = d.section || "_root";
        if (!map.has(id)) map.set(id, []);
        map.get(id)!.push(d);
    }
    const sections: DocSection[] = [];
    for (const [id, docs] of map.entries()) {
        sections.push({
            id,
            label: id === "_root" ? "Overview" : prettify(id),
            docs,
        });
    }
    sections.sort((a, b) => {
        if (a.id === "_root") return -1;
        if (b.id === "_root") return  1;
        return a.label.localeCompare(b.label);
    });
    return sections;
}

export interface SearchHit {
    doc:     DocRecord;
    score:   number;
    snippet: string;
}

const SNIPPET_RADIUS = 80;

/** Naive but fast in-memory search: tokenise the query, score by total
 *  hits across title + body, and return a snippet around the first hit. */
export function search(query: string, limit = 25): SearchHit[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const terms = q.split(/\s+/).filter(Boolean);
    const hits: SearchHit[] = [];

    for (const doc of DOCS) {
        let score = 0;
        let firstIdx = -1;
        for (const t of terms) {
            const titleMatch = doc.title.toLowerCase().includes(t);
            const bodyIdx    = doc.haystack.indexOf(t);
            if (titleMatch) score += 5;
            if (bodyIdx >= 0) {
                score += 1;
                if (firstIdx === -1 || bodyIdx < firstIdx) firstIdx = bodyIdx;
            }
        }
        if (score === 0) continue;

        let snippet = doc.excerpt;
        if (firstIdx >= 0) {
            const start = Math.max(0, firstIdx - SNIPPET_RADIUS);
            const end   = Math.min(doc.haystack.length, firstIdx + SNIPPET_RADIUS);
            snippet = (start > 0 ? "… " : "") + doc.haystack.slice(start, end).trim() + (end < doc.haystack.length ? " …" : "");
        }
        hits.push({ doc, score, snippet });
    }

    hits.sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title));
    return hits.slice(0, limit);
}
