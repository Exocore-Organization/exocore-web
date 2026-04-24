import React, { useState } from 'react';
import axios from 'axios';
import { rpc } from '../access/rpcClient';
import toast from 'react-hot-toast';
import {
    ChevronLeft, Settings as SettingsIcon,
    Files, Package, GitBranch, Cloud, Sparkles, X,
    TerminalSquare, PlayCircle, Globe, AlertCircle,
    AlertTriangle, CheckCircle2, Code2, Loader2, Search,
    Info, ArrowRight, Package2, Download, History as HistoryIcon
} from 'lucide-react';

export type AutoSaveState = 'idle' | 'saving' | 'saved' | 'error';
import type { EditorTheme, SidebarTab, BottomPanel, DiagnosticItem, FileNode } from '../../types/editor';

interface LayoutHeaderProps {
    theme: EditorTheme;
    isMobile: boolean;
    autoSaveState: AutoSaveState;
    hasActiveFile: boolean;
    activeFileIsCode: boolean;
    onBack: () => void;
    onOpenHistory: () => void;
    onSettings: () => void;
    onOpenCommand: () => void;
}

const AUTOSAVE_LABEL: Record<AutoSaveState, string> = {
    idle: '',
    saving: 'Saving…',
    saved: 'Saved',
    error: 'Save failed',
};
const AUTOSAVE_COLOR: Record<AutoSaveState, string> = {
    idle: 'transparent',
    saving: '#f59e0b',
    saved: '#22c55e',
    error: '#ef4444',
};

export const LayoutHeader: React.FC<LayoutHeaderProps> = ({
    theme: active, isMobile, autoSaveState, hasActiveFile, activeFileIsCode,
    onBack, onOpenHistory, onSettings, onOpenCommand,
}) => (
    <header className="main-header" style={{ background: active.surface }}>
        <button className="icon-btn" onClick={onBack} aria-label="Back"><ChevronLeft size={20} /></button>
        <div className="header-title">EXOCODE</div>
        <div className="header-actions">
            {hasActiveFile && activeFileIsCode && autoSaveState !== 'idle' && (
                <span
                    aria-live="polite"
                    title={AUTOSAVE_LABEL[autoSaveState]}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                        textTransform: 'uppercase', color: AUTOSAVE_COLOR[autoSaveState],
                        padding: '0 6px',
                    }}
                >
                    {autoSaveState === 'saving' && <Loader2 size={12} className="spin" />}
                    {!isMobile && <span>{AUTOSAVE_LABEL[autoSaveState]}</span>}
                </span>
            )}
            <button className="icon-btn" onClick={onOpenCommand} aria-label="Command palette" title={isMobile ? 'Search' : 'Command (Ctrl+K)'}>
                <Search size={18} />
            </button>
            {hasActiveFile && activeFileIsCode && (
                <button className="icon-btn" onClick={onOpenHistory} aria-label="Code history" title="Code history (local)">
                    <HistoryIcon size={18} />
                </button>
            )}
            <button className="icon-btn" onClick={onSettings} aria-label="Settings"><SettingsIcon size={18} /></button>
        </div>
    </header>
);

interface SidebarTabsProps {
    activeTab: SidebarTab;
    isMobile: boolean;
    isDraggingTabs: boolean;
    theme: EditorTheme;
    tabsRef: React.RefObject<HTMLDivElement | null>;
    packagesLabel?: string;
    onTabChange: (tab: SidebarTab) => void;
    onClose: () => void;
    onDragStart: (e: React.MouseEvent | React.TouchEvent) => void;
    onDragMove: (e: React.MouseEvent | React.TouchEvent) => void;
    onDragEnd: () => void;
}

export const SidebarTabBar: React.FC<SidebarTabsProps> = ({
    activeTab, isMobile, isDraggingTabs, theme: active,
    tabsRef, packagesLabel, onTabChange, onClose,
    onDragStart, onDragMove, onDragEnd,
}) => (
    <div
        className={`sidebar-tabs ${isDraggingTabs ? 'dragging' : ''}`}
        style={{ borderBottom: `1px solid ${active.border}` }}
        ref={tabsRef}
        onMouseDown={onDragStart}
        onMouseLeave={onDragEnd}
        onMouseUp={onDragEnd}
        onMouseMove={onDragMove}
        onTouchStart={onDragStart}
        onTouchEnd={onDragEnd}
        onTouchMove={onDragMove}
    >
        {(['explorer', 'npm', 'github', 'drive', 'ai'] as SidebarTab[]).map((tab) => {
            const icons: Record<SidebarTab, React.ReactNode> = {
                explorer: <Files size={14} />,
                npm:      <Package size={14} />,
                github:   <GitBranch size={14} />,
                drive:    <Cloud size={14} />,
                ai:       <Sparkles size={14} />,
            };
            const labels: Record<SidebarTab, string> = {
                explorer: 'Explorer',
                npm:      packagesLabel ?? 'NPM',
                github:   'Git',
                drive:    'Drive',
                ai:       'AI',
            };
            return (
                <button
                    key={tab}
                    className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
                    onClick={() => !isDraggingTabs && onTabChange(tab)}
                >
                    {icons[tab]} {labels[tab]}
                </button>
            );
        })}
        <div style={{ flex: 1, minWidth: '20px' }} />
        {isMobile && (
            <button className="sidebar-close-btn" onClick={onClose}>
                <X size={18} />
            </button>
        )}
    </div>
);

/* ── Missing types banner ─────────────────────────────────────────────── */
function extractMissingPackage(msg: string, code?: number): string | null {
    if (code !== 7016 && code !== 2307) return null;
    const m1 = msg.match(/declaration file for module '([^']+)'/);
    if (m1) return m1[1];
    const m2 = msg.match(/Cannot find module '([^']+)'/);
    if (m2 && !m2[1].startsWith('.')) return m2[1];
    return null;
}

function typesPackageName(pkg: string): string {
    const base = pkg.replace(/^@([^/]+)\/(.+)$/, '$1__$2');
    return `@types/${base}`;
}

interface DiagnosticsListProps {
    diagnostics: DiagnosticItem[];
    onJumpToLine?: (line: number) => void;
    projectId?: string;
    /** Called when a missing-types install completes successfully. */
    onInstalled?: (pkg: string) => void;
}

type Filter = 'all' | 'error' | 'warning' | 'info';

const SCOLOR: Record<string, string> = {
    error:   '#f87171',
    warning: '#fbbf24',
    info:    '#60a5fa',
};

export const DiagnosticsList: React.FC<DiagnosticsListProps> = ({ diagnostics, onJumpToLine, projectId, onInstalled }) => {
    const [filter, setFilter] = useState<Filter>('all');
    const [installing, setInstalling] = useState<string | null>(null);

    const installTypes = async (pkg: string) => {
        if (!projectId) {
            toast.error('Open a project first to install types.');
            return;
        }
        const typesPkg = typesPackageName(pkg);
        setInstalling(pkg);
        const tid = toast.loading(`Installing ${typesPkg}…`);
        try {
            const res = await rpc.call<any>('npm.install', {
                projectId,
                packageName: typesPkg,
                dev: true,
            }, { timeoutMs: 180000 });
            if (res?.success) {
                toast.success(`${typesPkg} installed!`, { id: tid });
                onInstalled?.(pkg);
            } else {
                toast.error(`Install failed: ${res?.error ?? 'unknown'}`, { id: tid });
            }
        } catch (err: any) {
            toast.error(`Install failed: ${err?.response?.data?.error ?? err?.message ?? 'network error'}`, { id: tid });
        } finally {
            setInstalling(null);
        }
    };

    const errors   = diagnostics.filter(d => d.severity === 'error');
    const warnings = diagnostics.filter(d => d.severity === 'warning');
    const infos    = diagnostics.filter(d => d.severity === 'info');

    const visible = filter === 'all' ? diagnostics : diagnostics.filter(d => d.severity === filter);

    const missingPkgs = [...new Set(
        diagnostics.flatMap(d => {
            const pkg = extractMissingPackage(d.message, d.code);
            return pkg ? [pkg] : [];
        })
    )];

    return (
        <div className="diag-list" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* ── filter bar ── */}
            <div style={{
                display: 'flex', gap: 4, padding: '6px 10px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                flexShrink: 0,
            }}>
                {(['all', 'error', 'warning', 'info'] as Filter[]).map(f => {
                    const count = f === 'all' ? diagnostics.length : f === 'error' ? errors.length : f === 'warning' ? warnings.length : infos.length;
                    const active = filter === f;
                    return (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                padding: '2px 9px', borderRadius: 4, border: 'none',
                                cursor: 'pointer', fontSize: 11, fontWeight: 500,
                                background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                                color: active
                                    ? (f === 'error' ? SCOLOR.error : f === 'warning' ? SCOLOR.warning : f === 'info' ? SCOLOR.info : '#e2e8f0')
                                    : 'rgba(255,255,255,0.45)',
                                transition: 'all 0.15s',
                            }}
                        >
                            <span style={{ textTransform: 'capitalize' }}>{f}</span>
                            {count > 0 && (
                                <span style={{
                                    background: active ? (f === 'error' ? 'rgba(248,113,113,0.2)' : f === 'warning' ? 'rgba(251,191,36,0.2)' : f === 'info' ? 'rgba(96,165,250,0.2)' : 'rgba(255,255,255,0.15)') : 'rgba(255,255,255,0.08)',
                                    borderRadius: 3, padding: '0 5px', fontSize: 10, lineHeight: '16px',
                                }}>
                                    {count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ── missing types banners (clickable install) ── */}
            {missingPkgs.length > 0 && (
                <div style={{ padding: '4px 10px', flexShrink: 0 }}>
                    {missingPkgs.map(pkg => {
                        const typesPkg = typesPackageName(pkg);
                        const isLoading = installing === pkg;
                        return (
                            <div key={pkg} style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '6px 10px', borderRadius: 6, margin: '3px 0',
                                background: 'rgba(251,191,36,0.08)',
                                border: '1px solid rgba(251,191,36,0.18)',
                                fontSize: 11,
                            }}>
                                <Package2 size={13} color="#fbbf24" style={{ flexShrink: 0 }} />
                                <span style={{ color: '#fbbf24', flex: 1, minWidth: 0 }}>
                                    Missing types for <code style={{ background: 'rgba(251,191,36,0.12)', borderRadius: 3, padding: '1px 4px' }}>{pkg}</code>
                                </span>
                                <button
                                    onClick={() => installTypes(pkg)}
                                    disabled={isLoading || !projectId}
                                    title={`npm i -D ${typesPkg} --legacy-peer-deps`}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 5,
                                        padding: '4px 9px', borderRadius: 4,
                                        background: isLoading ? 'rgba(251,191,36,0.15)' : '#fbbf24',
                                        color: isLoading ? '#fbbf24' : '#1a1a1a',
                                        border: 'none', fontWeight: 700, fontSize: 10,
                                        textTransform: 'uppercase', letterSpacing: '0.04em',
                                        cursor: isLoading || !projectId ? 'wait' : 'pointer',
                                        opacity: !projectId ? 0.5 : 1,
                                        flexShrink: 0,
                                    }}
                                >
                                    {isLoading
                                        ? <Loader2 size={11} className="spin-loader" />
                                        : <Download size={11} />}
                                    {isLoading ? 'Installing' : `Install ${typesPkg}`}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── diagnostics list ── */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {visible.length === 0 ? (
                    <div className="no-probs">
                        <CheckCircle2 size={28} style={{ opacity: 0.18, marginBottom: 8 }} />
                        <div style={{ fontSize: 12, opacity: 0.4 }}>
                            {filter === 'all' ? 'Workspace is clean.' : `No ${filter}s.`}
                        </div>
                    </div>
                ) : (
                    visible.map((d, i) => (
                        <div
                            key={i}
                            className={`diag-row ${d.severity}`}
                            style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 10px', cursor: onJumpToLine ? 'pointer' : 'default' }}
                            onClick={() => onJumpToLine?.(d.line)}
                            title={onJumpToLine ? `Jump to line ${d.line}` : undefined}
                        >
                            <span style={{ flexShrink: 0, marginTop: 1, color: SCOLOR[d.severity] }}>
                                {d.severity === 'error'   ? <AlertCircle size={13} /> :
                                 d.severity === 'warning' ? <AlertTriangle size={13} /> :
                                                            <Info size={13} />}
                            </span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                                <span className="d-msg" style={{ fontSize: 12, lineHeight: '18px', wordBreak: 'break-word' }}>
                                    {d.message}
                                </span>
                                {(d.source || d.code) && (
                                    <span style={{ display: 'block', fontSize: 10, opacity: 0.4, marginTop: 1, fontFamily: 'monospace' }}>
                                        {d.source && <span>{d.source}</span>}
                                        {d.code && <span> TS{d.code}</span>}
                                    </span>
                                )}
                            </span>
                            <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, opacity: 0.45, whiteSpace: 'nowrap' }}>
                                Ln {d.line}
                                {onJumpToLine && (
                                    <ArrowRight size={11} style={{ opacity: 0.6 }} />
                                )}
                            </span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

interface StatusBarProps {
    theme: EditorTheme;
    isMobile: boolean;
    sidebarVisible: boolean;
    bottomPanel: BottomPanel;
    errorsCount: number;
    warningsCount: number;
    activeFile: FileNode | null;
    onToggleSidebar: () => void;
    onTogglePanel: (panel: Exclude<BottomPanel, 'none'>) => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
    theme: active, isMobile, sidebarVisible, bottomPanel,
    errorsCount, warningsCount, activeFile,
    onToggleSidebar, onTogglePanel,
}) => {
    if (isMobile) {
        return (
            <footer className="status-bar" style={{ background: active.surface, borderTop: `1px solid ${active.border}` }}>
                <div className="mobile-nav">
                    <button
                        className={`m-nav-btn ${sidebarVisible ? 'active' : ''}`}
                        onClick={onToggleSidebar}
                    >
                        <Files size={20} />
                        <span className="m-nav-label">Files</span>
                    </button>
                    <button
                        className={`m-nav-btn ${bottomPanel === 'problems' ? 'active' : ''}`}
                        onClick={() => onTogglePanel('problems')}
                    >
                        <AlertCircle size={20} color={errorsCount > 0 ? '#ff5555' : 'inherit'} />
                        <span className="m-nav-label" style={{ color: errorsCount > 0 ? '#ff5555' : 'inherit' }}>Errors</span>
                    </button>
                    <button
                        className={`m-nav-btn ${bottomPanel === 'console' ? 'active' : ''}`}
                        onClick={() => onTogglePanel('console')}
                    >
                        <PlayCircle size={20} />
                        <span className="m-nav-label">Console</span>
                    </button>
                    <button
                        className={`m-nav-btn ${bottomPanel === 'terminal' ? 'active' : ''}`}
                        onClick={() => onTogglePanel('terminal')}
                    >
                        <TerminalSquare size={20} />
                        <span className="m-nav-label">Terminal</span>
                    </button>
                </div>
            </footer>
        );
    }

    return (
        <footer className="status-bar" style={{ background: active.surface, borderTop: `1px solid ${active.border}` }}>
            <button className={`status-btn ${sidebarVisible ? 'active' : ''}`} onClick={onToggleSidebar}>
                <Files size={14} /> Explorer
            </button>
            <div className="status-divider" />
            <button
                className={`status-btn ${bottomPanel === 'problems' ? 'active' : ''}`}
                onClick={() => onTogglePanel('problems')}
                style={{ color: errorsCount > 0 ? '#ff5555' : warningsCount > 0 ? '#f59e0b' : 'inherit' }}
            >
                <AlertCircle size={14} />
                {errorsCount > 0 && <span>{errorsCount} errors</span>}
                {errorsCount === 0 && warningsCount > 0 && <span>{warningsCount} warnings</span>}
                {errorsCount === 0 && warningsCount === 0 && <span>Problems</span>}
            </button>
            <button
                className={`status-btn ${bottomPanel === 'console' ? 'active' : ''}`}
                onClick={() => onTogglePanel('console')}
            >
                <PlayCircle size={14} /> Console
            </button>
            <button
                className={`status-btn ${bottomPanel === 'terminal' ? 'active' : ''}`}
                onClick={() => onTogglePanel('terminal')}
            >
                <TerminalSquare size={14} /> Terminal
            </button>
            {activeFile && (
                <>
                    <div className="status-divider" />
                    <button
                        className={`status-btn ${bottomPanel === 'webview' ? 'active' : ''}`}
                        onClick={() => onTogglePanel('webview')}
                    >
                        <Globe size={14} /> Webview
                    </button>
                </>
            )}
            <div style={{ flex: 1 }} />
            {activeFile && (
                <span className="status-file notranslate" translate="no">
                    <Code2 size={12} /> {activeFile.name}
                </span>
            )}
        </footer>
    );
};

interface ExitConfirmProps {
    theme: EditorTheme;
    onStay: () => void;
    onLeave: () => void;
}

export const ExitConfirmModal: React.FC<ExitConfirmProps> = ({ theme: active, onStay, onLeave }) => (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div style={{ background: active.surface, border: `1px solid ${active.border}`, borderRadius: 14, padding: '1.5rem', maxWidth: 320, width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: '0.75rem' }}>👋</div>
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.5rem', color: active.textMain }}>Leave Editor?</div>
            <div style={{ fontSize: '0.85rem', color: active.textMuted, marginBottom: '1.25rem' }}>Unsaved changes may be lost.</div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={onStay} style={{ flex: 1, padding: '10px', borderRadius: 8, border: `1px solid ${active.border}`, background: 'transparent', color: active.textMain, fontWeight: 600, cursor: 'pointer' }}>Stay</button>
                <button onClick={onLeave} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: active.accent, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Leave</button>
            </div>
        </div>
    </div>
);
