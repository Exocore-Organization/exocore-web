import React, { useMemo, useRef, useEffect, useCallback, useState, useLayoutEffect } from 'react';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-scss';
import 'prismjs/components/prism-less';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-markup-templating';
import 'prismjs/components/prism-php';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-kotlin';
import 'prismjs/components/prism-swift';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-shell-session';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-toml';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-graphql';
import 'prismjs/components/prism-docker';
import 'prismjs/components/prism-ini';

import { THEME_MAP, ALL_THEMES } from './editorThemes';
export { ALL_THEMES };
export type { ThemeDef, SyntaxPalette } from './editorThemes';

const EXT_LANG: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', mts: 'typescript', cts: 'typescript',
    js: 'javascript', jsx: 'jsx', mjs: 'javascript', cjs: 'javascript',
    css: 'css', scss: 'scss', sass: 'scss', less: 'less',
    html: 'markup', htm: 'markup', xml: 'markup', svg: 'markup', vue: 'markup',
    php: 'php', py: 'python', rs: 'rust', c: 'c', cpp: 'cpp', cc: 'cpp',
    h: 'c', hpp: 'cpp', cs: 'csharp', go: 'go', java: 'java', kt: 'kotlin',
    swift: 'swift', rb: 'ruby', sh: 'bash', bash: 'bash', zsh: 'bash',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    md: 'markdown', markdown: 'markdown',
    sql: 'sql', graphql: 'graphql', gql: 'graphql',
    dockerfile: 'docker', ini: 'ini', env: 'ini', conf: 'ini',
};

export function langForFile(name: string): string {
    const lower = name.toLowerCase();
    if (lower === 'dockerfile') return 'docker';
    const ext = lower.split('.').pop() ?? '';
    return EXT_LANG[ext] ?? 'markup';
}

export interface SimpleCodeEditorRef {
    focus: () => void;
    getValue: () => string;
    setValue: (v: string) => void;
    getCursorLine: () => number;
}

export interface InlineDiagnostic {
    line: number;
    column: number;
    length?: number;
    endLine?: number;
    endColumn?: number;
    message: string;
    severity: 'error' | 'warning' | 'info';
    code?: number;
}

interface Props {
    filename: string;
    value: string;
    onChange: (val: string) => void;
    themeName: string;
    wordWrap: boolean;
    isMobile: boolean;
    onSave?: () => void;
    editorRef?: React.MutableRefObject<SimpleCodeEditorRef | null>;
    projectId?: string;
    fullPath?: string;
    enableLsp?: boolean;
    /** Diagnostics to render as inline squiggles + gutter markers. */
    diagnostics?: InlineDiagnostic[];
}

const SEV_COLOR: Record<InlineDiagnostic['severity'], string> = {
    error: '#ff5d5d',
    warning: '#f5c518',
    info: '#5cb6ff',
};

function squiggleDataUri(color: string): string {
    const c = encodeURIComponent(color);
    return `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 6 3' width='6' height='3'><path d='M0 2 Q1.5 0 3 2 T6 2' stroke='${c}' fill='none' stroke-width='1'/></svg>")`;
}

const SimpleCodeEditor: React.FC<Props> = ({
    filename, value, onChange, themeName, wordWrap, isMobile, onSave, editorRef,
    diagnostics,
}) => {
    const theme = THEME_MAP.get(themeName) ?? ALL_THEMES[0];
    const language = useMemo(() => langForFile(filename), [filename]);

    const wrapRef = useRef<HTMLDivElement | null>(null);
    const taRef = useRef<HTMLTextAreaElement | null>(null);
    const valueRef = useRef(value);
    valueRef.current = value;

    /* Open diagnostic tooltip state */
    const [openDiag, setOpenDiag] = useState<number | null>(null);

    /* Char width measurement for accurate squiggle placement */
    const [charWidth, setCharWidth] = useState<number>(0);

    useEffect(() => {
        if (!editorRef) return;
        editorRef.current = {
            focus: () => taRef.current?.focus(),
            getValue: () => valueRef.current,
            setValue: (v: string) => onChange(v),
            getCursorLine: () => {
                const ta = taRef.current;
                if (!ta) return 1;
                const upto = (ta.value || '').slice(0, ta.selectionStart);
                return upto.split('\n').length;
            },
        };
        return () => { if (editorRef) editorRef.current = null; };
    }, [editorRef, onChange]);

    useEffect(() => {
        taRef.current = wrapRef.current?.querySelector('textarea') ?? null;
    }, [language]);

    /* Close diag tooltip when clicking outside */
    useEffect(() => {
        if (openDiag === null) return;
        const onDocDown = (e: MouseEvent | TouchEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('.sce-diag-pop') && !target.closest('.sce-gutter-marker')) {
                setOpenDiag(null);
            }
        };
        document.addEventListener('mousedown', onDocDown);
        document.addEventListener('touchstart', onDocDown, { passive: true });
        return () => {
            document.removeEventListener('mousedown', onDocDown);
            document.removeEventListener('touchstart', onDocDown as any);
        };
    }, [openDiag]);

    const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
        if (onSave && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            onSave();
        }
    }, [onSave]);

    const syntaxCss = useMemo(() => buildPrismCss(theme), [theme]);

    const lineCount = useMemo(
        () => (value.match(/\n/g)?.length ?? 0) + 1,
        [value],
    );
    const lines = useMemo(
        () => Array.from({ length: lineCount }, (_, i) => i + 1),
        [lineCount],
    );

    const fontSize = isMobile ? 13 : 14;
    const lineHeight = 1.55;
    const lineHeightPx = fontSize * lineHeight;
    const padding = 12;
    const showLineNumbers = true; /* always — used for diag markers */

    /* Group diagnostics by line for gutter markers */
    const diagsByLine = useMemo(() => {
        const m = new Map<number, InlineDiagnostic[]>();
        if (!diagnostics) return m;
        for (const d of diagnostics) {
            const arr = m.get(d.line) ?? [];
            arr.push(d);
            m.set(d.line, arr);
        }
        return m;
    }, [diagnostics]);

    /* Worst severity per line for gutter marker color */
    const severityForLine = (line: number): InlineDiagnostic['severity'] | null => {
        const arr = diagsByLine.get(line);
        if (!arr || arr.length === 0) return null;
        if (arr.some(d => d.severity === 'error')) return 'error';
        if (arr.some(d => d.severity === 'warning')) return 'warning';
        return 'info';
    };

    /* Measure monospace char width once after mount + when fontSize changes */
    useLayoutEffect(() => {
        const probe = wrapRef.current?.querySelector<HTMLElement>('.sce-char-probe');
        if (!probe) return;
        const w = probe.getBoundingClientRect().width / 80;
        if (w > 0 && Math.abs(w - charWidth) > 0.05) setCharWidth(w);
    }, [fontSize, charWidth]);

    const highlight = useCallback((code: string) => {
        const grammar = (Prism.languages as any)[language] || Prism.languages.markup;
        try { return Prism.highlight(code, grammar, language); }
        catch { return escapeHtml(code); }
    }, [language]);

    const onGutterClick = (line: number) => {
        if (!diagsByLine.has(line)) return;
        setOpenDiag(prev => prev === line ? null : line);
    };

    /* Render inline squiggle for a single diagnostic */
    const renderSquiggle = (d: InlineDiagnostic, idx: number) => {
        if (!charWidth) return null;
        const sameLine = !d.endLine || d.endLine === d.line;
        const widthChars = sameLine
            ? Math.max(1, (d.endColumn ?? d.column + (d.length ?? 1)) - d.column)
            : Math.max(1, d.length ?? 1);
        const top = padding + (d.line - 1) * lineHeightPx + lineHeightPx - 4;
        const left = padding + d.column * charWidth;
        const width = widthChars * charWidth;
        const color = SEV_COLOR[d.severity];
        return (
            <div
                key={`sq-${idx}`}
                style={{
                    position: 'absolute',
                    top, left, width, height: 4,
                    backgroundImage: squiggleDataUri(color),
                    backgroundRepeat: 'repeat-x',
                    backgroundSize: '6px 3px',
                    pointerEvents: 'none',
                }}
                aria-hidden="true"
            />
        );
    };

    /* Build tooltip content for the active diag line */
    const activeDiags = openDiag !== null ? diagsByLine.get(openDiag) ?? [] : [];

    return (
        <div
            ref={wrapRef}
            className="sce-wrap"
            data-theme-id={theme.id}
            onKeyDown={onKeyDown}
            style={{
                position: 'absolute', inset: 0,
                background: theme.bg, color: theme.text,
                fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize, lineHeight,
                overflow: 'auto',
                display: 'flex',
            }}
        >
            <style>{`
                .sce-wrap { caret-color: ${theme.accent}; }
                .sce-wrap textarea { outline: none !important; -webkit-text-fill-color: transparent; color: transparent; caret-color: ${theme.accent}; }
                .sce-wrap textarea::selection,
                .sce-wrap pre ::selection { background: ${theme.selection} !important; }
                .sce-wrap .sce-gutter {
                    flex: 0 0 auto;
                    padding: 12px 6px 12px 8px;
                    color: ${theme.muted};
                    background: ${theme.surface};
                    text-align: right;
                    user-select: none;
                    border-right: 1px solid ${theme.line};
                    min-width: ${isMobile ? 36 : 44}px;
                    font-variant-numeric: tabular-nums;
                    position: sticky; left: 0; z-index: 4;
                }
                .sce-wrap .sce-gline {
                    line-height: ${lineHeightPx}px;
                    height: ${lineHeightPx}px;
                    display: flex; align-items: center; justify-content: flex-end;
                    gap: 4px;
                    cursor: default;
                }
                .sce-wrap .sce-gline.has-diag { cursor: pointer; }
                .sce-wrap .sce-gutter-marker {
                    width: 8px; height: 8px; border-radius: 50%;
                    flex-shrink: 0; box-shadow: 0 0 0 1px rgba(0,0,0,0.4);
                }
                .sce-wrap .sce-diag-line-bg {
                    position: absolute; left: 0; right: 0; height: ${lineHeightPx}px;
                    pointer-events: none;
                }
                .sce-wrap .sce-char-probe {
                    position: absolute; visibility: hidden; white-space: pre;
                    font-family: inherit; font-size: ${fontSize}px;
                    top: -9999px; left: -9999px;
                }
                .sce-wrap .sce-diag-pop {
                    position: absolute; z-index: 20;
                    max-width: min(420px, calc(100% - 24px));
                    background: ${theme.surface};
                    color: ${theme.text};
                    border: 2px solid ${theme.line};
                    box-shadow: 4px 4px 0 0 ${theme.accent};
                    padding: 10px 12px;
                    font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
                    font-size: 12px; line-height: 1.45;
                }
                .sce-wrap .sce-diag-row { display: flex; gap: 8px; align-items: flex-start; }
                .sce-wrap .sce-diag-row + .sce-diag-row { margin-top: 8px; padding-top: 8px; border-top: 1px solid ${theme.line}; }
                .sce-wrap .sce-diag-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex-shrink: 0; }
                .sce-wrap .sce-diag-msg { flex: 1; min-width: 0; word-break: break-word; }
                .sce-wrap .sce-diag-code { display: inline-block; opacity: .65; font-family: "IBM Plex Mono", monospace; font-size: 10px; margin-left: 6px; }
                .sce-wrap .npm__react-simple-code-editor__textarea,
                .sce-wrap pre {
                    white-space: ${wordWrap ? 'pre-wrap' : 'pre'} !important;
                    word-break: ${wordWrap ? 'break-word' : 'normal'} !important;
                    overflow-wrap: ${wordWrap ? 'break-word' : 'normal'} !important;
                }
                ${syntaxCss}
            `}</style>

            <span className="sce-char-probe">{'0'.repeat(80)}</span>

            {showLineNumbers && (
                <div className="sce-gutter" aria-hidden="false">
                    {lines.map((n) => {
                        const sev = severityForLine(n);
                        return (
                            <div
                                key={n}
                                className={`sce-gline${sev ? ' has-diag' : ''}`}
                                onClick={sev ? () => onGutterClick(n) : undefined}
                                role={sev ? 'button' : undefined}
                                aria-label={sev ? `${sev} on line ${n}` : undefined}
                            >
                                {sev && (
                                    <span
                                        className="sce-gutter-marker"
                                        style={{ background: SEV_COLOR[sev] }}
                                    />
                                )}
                                <span>{n}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                <Editor
                    value={value}
                    onValueChange={onChange}
                    highlight={highlight}
                    padding={padding}
                    tabSize={2}
                    insertSpaces={true}
                    textareaId="sce-textarea"
                    textareaClassName="sce-textarea"
                    preClassName={`language-${language}`}
                    style={{
                        fontFamily: 'inherit',
                        fontSize, lineHeight,
                        minHeight: '100%',
                        background: 'transparent',
                        color: theme.text,
                    }}
                />

                {/* Squiggle overlay */}
                {diagnostics && diagnostics.length > 0 && (
                    <div style={{
                        position: 'absolute', inset: 0, pointerEvents: 'none',
                        zIndex: 3,
                    }}>
                        {/* Full-width line tint for affected lines */}
                        {Array.from(diagsByLine.entries()).map(([line, arr]) => {
                            const sev = arr.some(d => d.severity === 'error') ? 'error'
                                : arr.some(d => d.severity === 'warning') ? 'warning' : 'info';
                            const bg = sev === 'error' ? 'rgba(255,93,93,0.07)'
                                : sev === 'warning' ? 'rgba(245,197,24,0.07)'
                                : 'rgba(92,182,255,0.06)';
                            return (
                                <div
                                    key={`bg-${line}`}
                                    className="sce-diag-line-bg"
                                    style={{
                                        top: padding + (line - 1) * lineHeightPx,
                                        background: bg,
                                    }}
                                />
                            );
                        })}
                        {diagnostics.map(renderSquiggle)}
                    </div>
                )}

                {/* Tooltip popover */}
                {openDiag !== null && activeDiags.length > 0 && (
                    <div
                        className="sce-diag-pop"
                        style={{
                            top: padding + openDiag * lineHeightPx + 4,
                            left: 12,
                        }}
                    >
                        {activeDiags.map((d, i) => (
                            <div className="sce-diag-row" key={i}>
                                <span
                                    className="sce-diag-dot"
                                    style={{ background: SEV_COLOR[d.severity] }}
                                />
                                <div className="sce-diag-msg">
                                    {d.message}
                                    {d.code != null && (
                                        <span className="sce-diag-code">ts({d.code})</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    } as Record<string, string>)[c] ?? c);
}

export function buildPrismCss(theme: { syntax: any; text: string }) {
    const s = theme.syntax;
    return `
        .sce-wrap pre, .sce-wrap code { color: ${theme.text}; }
        .sce-wrap .token.comment,
        .sce-wrap .token.prolog,
        .sce-wrap .token.doctype,
        .sce-wrap .token.cdata { color: ${s.comment}; font-style: italic; }
        .sce-wrap .token.punctuation { color: ${s.meta}; }
        .sce-wrap .token.namespace  { opacity: .85; }
        .sce-wrap .token.property,
        .sce-wrap .token.tag        { color: ${s.tag}; }
        .sce-wrap .token.boolean,
        .sce-wrap .token.number     { color: ${s.number}; }
        .sce-wrap .token.constant,
        .sce-wrap .token.symbol     { color: ${s.builtin}; }
        .sce-wrap .token.selector,
        .sce-wrap .token.attr-name  { color: ${s.attr}; }
        .sce-wrap .token.string,
        .sce-wrap .token.char,
        .sce-wrap .token.template-string { color: ${s.string}; }
        .sce-wrap .token.builtin,
        .sce-wrap .token.inserted   { color: ${s.builtin}; }
        .sce-wrap .token.operator,
        .sce-wrap .token.entity,
        .sce-wrap .token.url        { color: ${s.operator}; }
        .sce-wrap .token.atrule,
        .sce-wrap .token.attr-value,
        .sce-wrap .token.keyword    { color: ${s.keyword}; }
        .sce-wrap .token.function,
        .sce-wrap .token.class-name { color: ${s.fn}; }
        .sce-wrap .token.regex,
        .sce-wrap .token.important  { color: ${s.invalid}; }
        .sce-wrap .token.variable   { color: ${s.variable}; }
        .sce-wrap .token.parameter  { color: ${s.variable}; }
        .sce-wrap .token.type-name  { color: ${s.type}; }
        .sce-wrap .token.italic     { font-style: italic; }
        .sce-wrap .token.bold,
        .sce-wrap .token.important  { font-weight: 700; }
    `;
}

export default SimpleCodeEditor;
export type { Props as SimpleCodeEditorProps };
