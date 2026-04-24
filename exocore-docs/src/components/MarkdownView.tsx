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
 * Rewrite a relative href found inside a markdown file so it resolves
 * against the doc's slug *inside* the SPA. Anchors and absolute URLs are
 * passed through untouched.
 */
function rewriteHref(href: string, baseSlug: string): string {
    if (!href) return href;
    if (/^[a-z]+:/i.test(href)) return href;            // http(s):, mailto:, …
    if (href.startsWith("#"))   return href;
    if (href.startsWith("/"))   return href;            // absolute SPA path

    // Resolve `..` and `./` segments against the base slug.
    const baseParts = baseSlug.split("/").filter(Boolean);
    if (!baseSlug.endsWith("/")) baseParts.pop();        // drop the file segment
    const parts = baseParts.slice();
    for (const seg of href.split("/")) {
        if (seg === "" || seg === ".") continue;
        if (seg === "..") { parts.pop(); continue; }
        parts.push(seg);
    }
    let resolved = parts.join("/");

    // Markdown links commonly point at README.md or sibling .md files.
    // Map them onto our slug shape (folder/ for README, folder/page for
    // anything else).
    resolved = resolved.replace(/\/?README\.md$/i, "/").replace(/\.md$/i, "");
    return `#/docs/${resolved}`;
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
                        // Resolve relative image paths the same way as links — they
                        // typically point at /screenshots/... inside the docs tree.
                        if (src && !/^[a-z]+:/i.test(src) && !src.startsWith("/")) {
                            const rewritten = rewriteHref(src, baseSlug);
                            // rewriteHref returns `#/docs/...` for markdown — strip
                            // the leading `#/docs/` and surface as a real asset URL.
                            const asset = rewritten.replace(/^#\/docs\//, "");
                            // We can't reach the original PNG from here at runtime
                            // (it lives outside the bundle), so just show a friendly
                            // placeholder describing what the image was.
                            return (
                                <span className="md-img-stub" title={`Bundled image: ${asset}`}>
                                    🖼 <em>{alt || asset}</em>
                                </span>
                            );
                        }
                        return <img src={src} alt={alt} {...rest} />;
                    },
                }}
            >
                {body}
            </ReactMarkdown>
        </article>
    );
}
