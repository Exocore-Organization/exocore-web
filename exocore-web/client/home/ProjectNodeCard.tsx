import React from 'react';
import { getTemplateIcon } from '../shared/components/IconTemplate';

// Map detected `language`/`runtime` strings (from system.exo) to keys understood by getTemplateIcon.
const LANGUAGE_ICON_KEY: Record<string, string> = {
    nodejs: 'node',
    node: 'node',
    js: 'js',
    javascript: 'js',
    ts: 'typescript',
    typescript: 'typescript',
    py: 'python',
    python: 'python',
    rb: 'ruby',
    ruby: 'ruby',
    rs: 'rust',
    rust: 'rust',
    go: 'go',
    java: 'java',
    kt: 'kotlin',
    kotlin: 'kotlin',
    swift: 'swift',
    dart: 'dart',
    php: 'php',
    cs: 'csharp',
    csharp: 'csharp',
    c: 'c',
    cpp: 'cpp',
    lua: 'lua',
    r: 'r',
    ex: 'elixir',
    elixir: 'elixir',
    hs: 'haskell',
    haskell: 'haskell',
    hc: 'holyc',
    holyc: 'holyc',
    html: 'html',
    vue: 'vue',
    svelte: 'svelte',
    tsx: 'react',
    jsx: 'react',
    bun: 'bun',
    deno: 'deno',
};

const resolveIconKey = (lang?: string): string | undefined => {
    if (!lang) return undefined;
    const key = lang.toLowerCase();
    return LANGUAGE_ICON_KEY[key] ?? key;
};

export interface ProjectData {
    id: string;
    name: string;
    author?: string;
    description?: string;
    language?: string;
    icon?: string;
    run?: string;
    port?: number;
    status?: string;
    createdAt?: string;
    localUrl?: string | null;
    tunnelUrl?: string | null;
}

const STATUS_COLOR: Record<string, string> = {
    running: '#22c55e',
    stopped: '#6b7280',
    error: '#ef4444',
    building: '#f59e0b',
    Online: '#22c55e',
    Archived: '#6b7280',
};

interface ProjectNodeCardProps {
    project: ProjectData;
    onOpen: () => void;
    onStart: () => void;
    onStop: () => void;
}

export const ProjectNodeCard: React.FC<ProjectNodeCardProps> = ({
    project: p,
    onOpen, onStart, onStop,
}) => {
    const statusKey = p.status ?? 'stopped';
    const color = STATUS_COLOR[statusKey] ?? '#6b7280';

    return (
        <div
            className="project-node-card"
            style={{ cursor: 'pointer' }}
            onClick={onOpen}
            title={`Open ${p.name ?? p.id} in editor`}
        >
            <div className="pnc-header">
                <div className="pnc-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {(() => {
                        const iconKey = p.icon ?? resolveIconKey(p.language);
                        if (iconKey) return getTemplateIcon(iconKey, p.language, 22);
                        return <span>{(p.name ?? p.id).slice(0, 2).toUpperCase()}</span>;
                    })()}
                </div>
                <div className="pnc-meta">
                    <div className="pnc-name notranslate" translate="no">{p.name ?? p.id}</div>
                    <div className="pnc-desc">{p.description ?? 'No description'}</div>
                </div>
                <div className="pnc-status-dot" style={{ background: color }} title={statusKey}/>
            </div>

            <div className="pnc-actions" onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button
                    className="btn btn-xs"
                    style={{ background: 'rgba(0,255,148,0.08)', color: '#00FF94', border: '2px solid rgba(0,255,148,0.3)', padding: '0.3rem 0.625rem', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 700, textTransform: 'uppercase' }}
                    onClick={onStart}
                >Start</button>
                <button
                    className="btn btn-xs"
                    style={{ background: 'rgba(255,59,59,0.08)', color: '#FF3B3B', border: '2px solid rgba(255,59,59,0.3)', padding: '0.3rem 0.625rem', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 700, textTransform: 'uppercase' }}
                    onClick={onStop}
                >Stop</button>
            </div>

            <div className="pnc-footer">
                <span className="pnc-run notranslate" translate="no">{p.run ?? 'npm start'}</span>
                <span className="pnc-badge" style={{ borderColor: `${color}44`, color }}>{statusKey}</span>
            </div>

            {(p.localUrl || p.tunnelUrl) && (
                <div className="pnc-urls" onClick={e => e.stopPropagation()}>
                    {p.localUrl && (
                        <a className="pnc-url-link pnc-url-local" href={p.localUrl} target="_blank" rel="noopener noreferrer">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg> Local
                        </a>
                    )}
                    {p.tunnelUrl && (
                        <a className="pnc-url-link pnc-url-cf" href={p.tunnelUrl} target="_blank" rel="noopener noreferrer">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> Cloudflare
                        </a>
                    )}
                </div>
            )}

        </div>
    );
};
