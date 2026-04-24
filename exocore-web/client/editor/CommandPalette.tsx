import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
    Search, FileCode, Save, Settings as SettingsIcon, Palette,
    TerminalSquare, PlayCircle, AlertCircle, Globe, Files,
    ChevronLeft, Sparkles, Package, GitBranch
} from 'lucide-react';
import type { FileNode, EditorTheme, BottomPanel, SidebarTab } from '../../types/editor';

export type CmdkAction = {
    id: string;
    label: string;
    hint?: string;
    section: string;
    icon: React.ReactNode;
    onSelect: () => void;
};

interface CommandPaletteProps {
    open: boolean;
    onClose: () => void;
    files: FileNode[];
    theme: EditorTheme;
    onOpenFile: (node: FileNode) => void;
    onSetPanel: (panel: BottomPanel) => void;
    onSetSidebarTab: (tab: SidebarTab) => void;
    onToggleSidebar: () => void;
    onSave: () => void;
    onOpenSettings: () => void;
    onBack: () => void;
    activePanel: BottomPanel;
}

const flattenFiles = (nodes: FileNode[], acc: FileNode[] = []): FileNode[] => {
    if (!nodes) return acc;
    for (const n of nodes) {
        if (n.type === 'file') acc.push(n);
        if (n.children) flattenFiles(n.children, acc);
    }
    return acc;
};

const fuzzy = (q: string, text: string) => {
    if (!q) return true;
    const ql = q.toLowerCase();
    const tl = text.toLowerCase();
    if (tl.includes(ql)) return true;
    let qi = 0;
    for (let i = 0; i < tl.length && qi < ql.length; i++) {
        if (tl[i] === ql[qi]) qi++;
    }
    return qi === ql.length;
};

export const CommandPalette: React.FC<CommandPaletteProps> = ({
    open, onClose, files, theme,
    onOpenFile, onSetPanel, onSetSidebarTab, onToggleSidebar,
    onSave, onOpenSettings, onBack, activePanel,
}) => {
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (open) {
            setQuery('');
            setSelected(0);
            setTimeout(() => inputRef.current?.focus(), 30);
        }
    }, [open]);

    const allFiles = useMemo(() => flattenFiles(files), [files]);

    const actions: CmdkAction[] = useMemo(() => {
        const a: CmdkAction[] = [
            { id: 'save', label: 'Save File', hint: 'Ctrl+S', section: 'Actions', icon: <Save size={14} />, onSelect: onSave },
            { id: 'settings', label: 'Open Settings', hint: 'Themes & preferences', section: 'Actions', icon: <SettingsIcon size={14} />, onSelect: onOpenSettings },
            { id: 'theme', label: 'Change Theme', hint: 'Browse 50+ themes', section: 'Actions', icon: <Palette size={14} />, onSelect: onOpenSettings },
            { id: 'back', label: 'Back to Dashboard', section: 'Actions', icon: <ChevronLeft size={14} />, onSelect: onBack },
            { id: 'sidebar', label: 'Toggle Explorer', section: 'View', icon: <Files size={14} />, onSelect: onToggleSidebar },
            { id: 'panel-terminal', label: activePanel === 'terminal' ? 'Hide Terminal' : 'Show Terminal', section: 'View', icon: <TerminalSquare size={14} />, onSelect: () => onSetPanel(activePanel === 'terminal' ? 'none' : 'terminal') },
            { id: 'panel-console', label: activePanel === 'console' ? 'Hide Console' : 'Show Console', section: 'View', icon: <PlayCircle size={14} />, onSelect: () => onSetPanel(activePanel === 'console' ? 'none' : 'console') },
            { id: 'panel-problems', label: activePanel === 'problems' ? 'Hide Problems' : 'Show Problems', section: 'View', icon: <AlertCircle size={14} />, onSelect: () => onSetPanel(activePanel === 'problems' ? 'none' : 'problems') },
            { id: 'panel-webview', label: activePanel === 'webview' ? 'Hide Preview' : 'Show Preview', section: 'View', icon: <Globe size={14} />, onSelect: () => onSetPanel(activePanel === 'webview' ? 'none' : 'webview') },
            { id: 'tab-explorer', label: 'Go to Explorer', section: 'Sidebar', icon: <Files size={14} />, onSelect: () => onSetSidebarTab('explorer') },
            { id: 'tab-npm', label: 'Go to Packages', section: 'Sidebar', icon: <Package size={14} />, onSelect: () => onSetSidebarTab('npm') },
            { id: 'tab-github', label: 'Go to Git', section: 'Sidebar', icon: <GitBranch size={14} />, onSelect: () => onSetSidebarTab('github') },
            { id: 'tab-ai', label: 'Go to AI Assistant', section: 'Sidebar', icon: <Sparkles size={14} />, onSelect: () => onSetSidebarTab('ai') },
        ];
        return a;
    }, [onSave, onOpenSettings, onBack, onToggleSidebar, onSetPanel, onSetSidebarTab, activePanel]);

    const filtered = useMemo(() => {
        const fileMatches: CmdkAction[] = allFiles
            .filter(f => fuzzy(query, f.path))
            .slice(0, 30)
            .map(f => ({
                id: 'file:' + f.path,
                label: f.name,
                hint: f.path,
                section: 'Files',
                icon: <FileCode size={14} />,
                onSelect: () => onOpenFile(f),
            }));
        const actionMatches = actions.filter(a => fuzzy(query, a.label + ' ' + (a.hint || '')));
        const all = query
            ? [...fileMatches, ...actionMatches]
            : [...actionMatches, ...fileMatches.slice(0, 8)];
        return all;
    }, [query, actions, allFiles, onOpenFile]);

    const grouped = useMemo(() => {
        const g: Record<string, CmdkAction[]> = {};
        filtered.forEach(item => { (g[item.section] = g[item.section] || []).push(item); });
        const order = ['Actions', 'View', 'Sidebar', 'Files'];
        return order.filter(s => g[s]?.length).map(s => ({ section: s, items: g[s] }));
    }, [filtered]);

    const flat = useMemo(() => grouped.flatMap(g => g.items), [grouped]);

    useEffect(() => { setSelected(0); }, [query]);

    const handleSelect = useCallback((idx: number) => {
        const item = flat[idx];
        if (item) { item.onSelect(); onClose(); }
    }, [flat, onClose]);

    const handleKey = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, flat.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
        else if (e.key === 'Enter') { e.preventDefault(); handleSelect(selected); }
    };

    useEffect(() => {
        if (!listRef.current) return;
        const el = listRef.current.querySelector(`[data-cmdk-idx="${selected}"]`) as HTMLElement | null;
        el?.scrollIntoView({ block: 'nearest' });
    }, [selected]);

    if (!open) return null;

    let runningIdx = -1;
    return (
        <div className="cmdk-overlay" onClick={onClose}>
            <div
                className="cmdk-panel"
                onClick={e => e.stopPropagation()}
                style={{ background: theme.surface, color: theme.textMain }}
            >
                <div className="cmdk-input-wrap">
                    <Search size={16} style={{ opacity: 0.5 }} />
                    <input
                        ref={inputRef}
                        className="cmdk-input"
                        placeholder="Search files, run commands…"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKey}
                    />
                    <span className="cmdk-kbd">ESC</span>
                </div>
                <div className="cmdk-list" ref={listRef}>
                    {flat.length === 0 ? (
                        <div className="cmdk-empty">No matches for "{query}"</div>
                    ) : grouped.map(group => (
                        <div key={group.section}>
                            <div className="cmdk-section">{group.section}</div>
                            {group.items.map(item => {
                                runningIdx++;
                                const idx = runningIdx;
                                return (
                                    <div
                                        key={item.id}
                                        data-cmdk-idx={idx}
                                        className={`cmdk-item ${idx === selected ? 'selected' : ''}`}
                                        onMouseEnter={() => setSelected(idx)}
                                        onClick={() => handleSelect(idx)}
                                    >
                                        <span className="cmdk-icon">{item.icon}</span>
                                        <span className="cmdk-label">{item.label}</span>
                                        {item.hint && <span className="cmdk-hint">{item.hint}</span>}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
