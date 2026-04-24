import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

interface Props {
    body:     string;
    /** The current doc's slug (e.g. `editor/`) — used to rewrite relative
     *  links inside the markdown so they stay inside the SPA. */
    baseSlug: string;
}

/**
 * Resolve a relative path against a doc slug, returning the dot-free
 * `a/b/c` form. Used as the foundation for both link and image rewriting.
 */
function resolveAgainstSlug(href: string, baseSlug: string): string {
    const baseParts = baseSlug.split("/").filter(Boolean);
    if (!baseSlug.endsWith("/")) baseParts.pop();        // drop the file segment
    const parts = baseParts.slice();
    for (const seg of href.split("/")) {
        if (seg === "" || seg === ".") continue;
        if (seg === "..") { parts.pop(); continue; }
        parts.push(seg);
    }
    return parts.join("/");
}

/**
 * Rewrite a relative href found inside a markdown file so it resolves
 * against the doc's slug *inside* the SPA. Anchors and absolute URLs are
 * passed through untouched.
 */
function rewriteHref(href: string, baseSlug: string): string {
    if (!href) return href;
    if (/^[a-z]+:/i.test(href)) return href;            // http(s):, mailto:, …
    if (href.startsWith("#"))   return href;
    if (href.startsWith("/"))   return href;            // absolute SPA path

    let resolved = resolveAgainstSlug(href, baseSlug);

    // Markdown links commonly point at README.md or sibling .md files.
    // Map them onto our slug shape (folder/ for README, folder/page for
    // anything else).
    resolved = resolved.replace(/\/?README\.md$/i, "/").replace(/\.md$/i, "");
    return `#/docs/${resolved}`;
}

/**
 * Rewrite a relative image src so it points at the bundled copy in
 * `public/screenshots/` (or wherever in the docs tree it sits). The docs
 * markdown references images like `../screenshots/editor/00-panel-gate.png`
 * — we resolve those against the doc slug, strip the leading `screenshots/`
 * prefix, and re-anchor onto `./screenshots/...` which the static host
 * serves verbatim from `public/`.
 *
 * Returns `null` if the path cannot be mapped onto the screenshots folder
 * (so the caller can fall back to the original src).
 */
function rewriteImg(src: string, baseSlug: string): string | null {
    if (!src) return null;
    if (/^[a-z]+:/i.test(src)) return src;              // http(s):, data:, …
    if (src.startsWith("/"))   return src;              // absolute path — host already handles it

    const resolved = resolveAgainstSlug(src, baseSlug);
    const m = resolved.match(/(?:^|\/)screenshots\/(.+)$/i);
    if (!m) return null;
    return `./screenshots/${m[1]}`;
}

export function MarkdownView({ body, baseSlug }: Props) {
    return (
        <article className="markdown-body">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSlug, rehypeHighlight]}
                components={{
                    a({ href, children, ...rest }) {
                        const rewritten = href ? rewriteHref(href, baseSlug) : href;
                        const isExternal = !!href && /^https?:\/\//i.test(href);
                        return (
                            <a
                                {...rest}
                                href={rewritten}
                                target={isExternal ? "_blank" : undefined}
                                rel={isExternal ? "noreferrer" : undefined}
                            >
                                {children}
                            </a>
                        );
                    },
                    img({ src, alt, ...rest }) {
                        // Resolve relative image paths against the doc's slug.
                        // Anything inside `screenshots/` is served verbatim by the
                        // static host out of `public/screenshots/`, so re-anchor
                        // those onto `./screenshots/...`. Other relative paths
                        // (none currently exist) fall through to the original src.
                        const finalSrc = typeof src === "string"
                            ? (rewriteImg(src, baseSlug) ?? src)
                            : src;
                        return (
                            <img
                                src={finalSrc}
                                alt={alt}
                                loading="lazy"
                                {...rest}
                            />
                        );
                    },
                }}
            >
                {body}
            </ReactMarkdown>
        </article>
    );
}
