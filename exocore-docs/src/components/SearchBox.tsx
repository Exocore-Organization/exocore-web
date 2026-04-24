import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { search, type SearchHit } from "../lib/docs";

interface Props {
    autoFocus?: boolean;
    placeholder?: string;
}

export function SearchBox({ autoFocus, placeholder }: Props) {
    const [query, setQuery]     = useState("");
    const [active, setActive]   = useState(0);
    const [open,   setOpen]     = useState(false);
    const inputRef              = useRef<HTMLInputElement>(null);
    const navigate              = useNavigate();

    const hits: SearchHit[] = useMemo(() => search(query, 12), [query]);

    useEffect(() => {
        if (autoFocus) inputRef.current?.focus();
    }, [autoFocus]);

    // Global "/" shortcut to focus the search box (only if the user isn't
    // already typing in some other field).
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "/") return;
            const target = e.target as HTMLElement | null;
            if (target && /input|textarea|select/i.test(target.tagName)) return;
            e.preventDefault();
            inputRef.current?.focus();
            setOpen(true);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, hits.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
        } else if (e.key === "Enter" && hits[active]) {
            e.preventDefault();
            navigate(`/docs/${hits[active].doc.slug}`);
            setOpen(false);
        } else if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
        }
    };

    return (
        <div className="search-wrap">
            <div className="search-shell">
                <span className="search-icon" aria-hidden>🔍</span>
                <input
                    ref={inputRef}
                    type="search"
                    className="search-input"
                    value={query}
                    placeholder={placeholder || "Search the docs (press / to focus)…"}
                    onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={onKeyDown}
                    autoComplete="off"
                    spellCheck={false}
                />
                {query && (
                    <button
                        type="button"
                        className="search-clear"
                        aria-label="Clear search"
                        onClick={() => { setQuery(""); inputRef.current?.focus(); }}
                    >×</button>
                )}
            </div>

            {open && query.trim() && (
                <div className="search-results" role="listbox">
                    {hits.length === 0 && (
                        <div className="search-empty">No matches for “{query}”.</div>
                    )}
                    {hits.map((hit, i) => (
                        <Link
                            key={hit.doc.slug || "_root"}
                            to={`/docs/${hit.doc.slug}`}
                            className={"search-result" + (i === active ? " active" : "")}
                            onMouseEnter={() => setActive(i)}
                            onClick={() => setOpen(false)}
                        >
                            <div className="search-result-head">
                                <span className="search-result-title">{hit.doc.title}</span>
                                <span className="search-result-section">
                                    {hit.doc.breadcrumbs.join(" / ")}
                                </span>
                            </div>
                            <div className="search-result-snippet">{hit.snippet}</div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
