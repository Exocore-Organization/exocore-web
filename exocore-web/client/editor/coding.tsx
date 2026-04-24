import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import nprogress from 'nprogress';
import toast, { Toaster } from 'react-hot-toast';
import { useHotkeys } from 'react-hotkeys-hook';
import SimpleCodeEditor, { langForFile, buildPrismCss } from './SimpleCodeEditor';
import type { SimpleCodeEditorRef } from './SimpleCodeEditor';
import Prism from 'prismjs';
import { ALL_THEMES } from './editorThemes';
import {
    Files, X,
    TerminalSquare, Loader2, Code2,
    PlayCircle, Globe, Music,
    AlertCircle, AlertTriangle
} from 'lucide-react';

import { useLegacyEditorStore, FileNode } from './store';
import { useEditorStore } from './editorStore';
import { useFileStore } from './fileStore';
import { Sidebar } from './Sidebar';
import { Settings } from './Settings';
import { KittyTerminal } from '../terminal/KittyTerminal';
import { GithubPane } from './GithubPane';
import { GDrivePane } from './GDrivePane';
import { PackagesPane, getPackageManagerLabel } from './PackagesPane';
import { ConsolePane } from './ConsolePane';
import { Webview } from './Webview';
import { ExocoreAI } from './ExocoreAI';
import { useLspClient } from './LspClient';
import { LayoutHeader, SidebarTabBar, DiagnosticsList, ExitConfirmModal } from './Layout';
import type { AutoSaveState } from './Layout';
import { History as HistoryIconLg, RotateCcw, Trash2, Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react';
import { Tabs } from './Tabs';
import { CommandPalette } from './CommandPalette';
import { Search } from 'lucide-react';

import 'nprogress/nprogress.css';

const LIGHT_THEMES = new Set([
    'github-light','replit-light','catppuccin-latte','tokyo-day',
    'ayu-light','gruvbox-light','material-light','solarized-light',
    'tomorrow','vitesse-light','rose-pine-dawn','everforest-light','sepia',
]);

const THEMES: Record<string, any> = {
    'cursor-dark':          { bg: '#000000', surface: '#0a0a0a', border: '#222222', accent: '#ffffff',  textMain: '#ededed',  textMuted: '#888888' },
    'github-dark':          { bg: '#0d1117', surface: '#161b22', border: '#30363d', accent: '#58a6ff',  textMain: '#c9d1d9',  textMuted: '#8b949e' },
    'github-light':         { bg: '#ffffff', surface: '#f6f8fa', border: '#d0d7de', accent: '#0969da',  textMain: '#24292f',  textMuted: '#4a525c' },
    'github-dimmed':        { bg: '#22272e', surface: '#2d333b', border: '#444c56', accent: '#6cb6ff',  textMain: '#adbac7',  textMuted: '#636e7b' },
    'replit-dark':          { bg: '#0e1525', surface: '#1c2333', border: '#2b3245', accent: '#00a1ff',  textMain: '#f5f9f9',  textMuted: '#808ca3' },
    'replit-light':         { bg: '#f5f9f9', surface: '#e8edf5', border: '#cdd5e5', accent: '#0079d3',  textMain: '#1a2332',  textMuted: '#5a6785' },
    'dracula':              { bg: '#282a36', surface: '#21222c', border: '#44475a', accent: '#ff79c6',  textMain: '#f8f8f2',  textMuted: '#6272a4' },
    'one-dark-pro':         { bg: '#282c34', surface: '#21252b', border: '#3e4451', accent: '#61afef',  textMain: '#abb2bf',  textMuted: '#5c6370' },
    'catppuccin':           { bg: '#1e1e2e', surface: '#181825', border: '#313244', accent: '#cba6f7',  textMain: '#cdd6f4',  textMuted: '#6c7086' },
    'catppuccin-latte':     { bg: '#eff1f5', surface: '#e6e9ef', border: '#bcc0cc', accent: '#8839ef',  textMain: '#4c4f69',  textMuted: '#6c6f85' },
    'catppuccin-macchiato': { bg: '#24273a', surface: '#1e2030', border: '#363a4f', accent: '#c6a0f6',  textMain: '#cad3f5',  textMuted: '#6e738d' },
    'tokyo-night':          { bg: '#1a1b26', surface: '#16161e', border: '#292e42', accent: '#7aa2f7',  textMain: '#c0caf5',  textMuted: '#565f89' },
    'tokyo-storm':          { bg: '#24283b', surface: '#1f2335', border: '#364a82', accent: '#7aa2f7',  textMain: '#c0caf5',  textMuted: '#565f89' },
    'tokyo-day':            { bg: '#e1e2e7', surface: '#d4d5da', border: '#b6bfe2', accent: '#2e7de9',  textMain: '#3760bf',  textMuted: '#5c6797' },
    'night-owl':            { bg: '#011627', surface: '#0b2942', border: '#1d3b53', accent: '#7e57c2',  textMain: '#d6deeb',  textMuted: '#637777' },
    'nord':                 { bg: '#2e3440', surface: '#3b4252', border: '#434c5e', accent: '#88c0d0',  textMain: '#d8dee9',  textMuted: '#4c566a' },
    'synthwave-84':         { bg: '#262335', surface: '#1a1833', border: '#3c3261', accent: '#f92aad',  textMain: '#ffffff',  textMuted: '#848bbd' },
    'monokai-pro':          { bg: '#2d2a2e', surface: '#221f22', border: '#403e41', accent: '#ffd866',  textMain: '#fcfcfa',  textMuted: '#727072' },
    'monokai-classic':      { bg: '#272822', surface: '#1e1f1c', border: '#49483e', accent: '#f8f8f2',  textMain: '#f8f8f2',  textMuted: '#75715e' },
    'shades-of-purple':     { bg: '#2d2b55', surface: '#1e1e3f', border: '#4d3d90', accent: '#fb9e00',  textMain: '#ffffff',  textMuted: '#a599e9' },
    'ayu-mirage':           { bg: '#1f2430', surface: '#1a1e28', border: '#2b3345', accent: '#ffcc66',  textMain: '#cbccc6',  textMuted: '#5c6773' },
    'ayu-dark':             { bg: '#0d1017', surface: '#131721', border: '#2d3645', accent: '#ffb454',  textMain: '#bfbdb6',  textMuted: '#5c6773' },
    'ayu-light':            { bg: '#fafafa', surface: '#f3f4f5', border: '#d9e0e8', accent: '#ff9940',  textMain: '#5c6166',  textMuted: '#787b80' },
    'gruvbox':              { bg: '#282828', surface: '#3c3836', border: '#504945', accent: '#d79921',  textMain: '#ebdbb2',  textMuted: '#928374' },
    'gruvbox-light':        { bg: '#fbf1c7', surface: '#f2e5bc', border: '#c8b88a', accent: '#b57614',  textMain: '#3c3836',  textMuted: '#7c6f64' },
    'material':             { bg: '#263238', surface: '#1e2a30', border: '#314549', accent: '#89ddff',  textMain: '#eeffff',  textMuted: '#546e7a' },
    'material-light':       { bg: '#fafafa', surface: '#f0f0f0', border: '#ccc',    accent: '#2196f3',  textMain: '#37474f',  textMuted: '#5d7079' },
    'solarized-dark':       { bg: '#002b36', surface: '#073642', border: '#0a4552', accent: '#268bd2',  textMain: '#839496',  textMuted: '#586e75' },
    'solarized-light':      { bg: '#fdf6e3', surface: '#eee8d5', border: '#c9c2a4', accent: '#268bd2',  textMain: '#586e75',  textMuted: '#657b83' },
    'cobalt2':              { bg: '#193549', surface: '#122637', border: '#1e4a6e', accent: '#ffc600',  textMain: '#ffffff',  textMuted: '#0088ff' },
    'palenight':            { bg: '#292d3e', surface: '#1b1e2b', border: '#3c435e', accent: '#82aaff',  textMain: '#bfc7d5',  textMuted: '#4b5263' },
    'rose-pine':            { bg: '#191724', surface: '#1f1d2e', border: '#26233a', accent: '#c4a7e7',  textMain: '#e0def4',  textMuted: '#6e6a86' },
    'rose-pine-dawn':       { bg: '#faf4ed', surface: '#f2e9de', border: '#dfdad9', accent: '#907aa9',  textMain: '#575279',  textMuted: '#6e6a86' },
    'mellow':               { bg: '#1a1a1a', surface: '#141414', border: '#2d2a2f', accent: '#e8b5a2',  textMain: '#c9c7cd',  textMuted: '#4c4a50' },
    'horizon':              { bg: '#1c1e26', surface: '#16181f', border: '#2e303e', accent: '#e95678',  textMain: '#d5d8da',  textMuted: '#4d4f56' },
    'kanagawa':             { bg: '#1f1f28', surface: '#16161d', border: '#2d4f67', accent: '#7fb4ca',  textMain: '#dcd7ba',  textMuted: '#54546d' },
    'everforest-dark':      { bg: '#2d353b', surface: '#232a2e', border: '#3c4741', accent: '#a7c080',  textMain: '#d3c6aa',  textMuted: '#5c6a72' },
    'everforest-light':     { bg: '#fdf6e3', surface: '#f4f0d9', border: '#d8d2b8', accent: '#8da101',  textMain: '#5c6a72',  textMuted: '#708070' },
    'iceberg':              { bg: '#161821', surface: '#0f1117', border: '#272c3f', accent: '#84a0c6',  textMain: '#c6c8d1',  textMuted: '#3d424d' },
    'spacegray':            { bg: '#20242b', surface: '#191d24', border: '#2c333f', accent: '#8fa1b3',  textMain: '#b0bec5',  textMuted: '#414b58' },
    'doom-one':             { bg: '#282c34', surface: '#21242b', border: '#3d4451', accent: '#51afef',  textMain: '#bbc2cf',  textMuted: '#5b6268' },
    'atom-dark':            { bg: '#1d1f21', surface: '#161719', border: '#373b41', accent: '#00b7ff',  textMain: '#c5c8c6',  textMuted: '#5a5f5d' },
    'tomorrow-night':       { bg: '#1d1f21', surface: '#282a2e', border: '#373b41', accent: '#81a2be',  textMain: '#c5c8c6',  textMuted: '#5a5f5d' },
    'tomorrow':             { bg: '#ffffff', surface: '#efefef', border: '#d6d6d6', accent: '#4271ae',  textMain: '#4d4d4c',  textMuted: '#6e706e' },
    'poimandres':           { bg: '#1b1e28', surface: '#171922', border: '#303340', accent: '#89ddff',  textMain: '#a6accd',  textMuted: '#303340' },
    'vitesse-dark':         { bg: '#121212', surface: '#1a1a1a', border: '#2a2a2a', accent: '#4d9375',  textMain: '#dbd7ca',  textMuted: '#5a5a5a' },
    'vitesse-light':        { bg: '#ffffff', surface: '#f5f5f5', border: '#dcdcdc', accent: '#1e754f',  textMain: '#393a34',  textMuted: '#6b7d6b' },
    'neo-brutalism':        { bg: '#000000', surface: '#0a0a0a', border: '#FFE500', accent: '#FFE500',  textMain: '#ffffff',  textMuted: '#555555' },
    'cyberpunk':            { bg: '#0a0015', surface: '#10002b', border: '#2a0050', accent: '#00f5ff',  textMain: '#e0e0e0',  textMuted: '#4a4060' },
    'snazzy':               { bg: '#282a36', surface: '#3a3c4e', border: '#3a3c4e', accent: '#ff6ac1',  textMain: '#f8f8f2',  textMuted: '#606172' },
    'laserwave':            { bg: '#27212e', surface: '#1f1a26', border: '#35293e', accent: '#eb64b9',  textMain: '#f4ede4',  textMuted: '#5e5368' },
    'sepia':                { bg: '#f1e7d0', surface: '#e9d8b9', border: '#cdb98f', accent: '#8a6642',  textMain: '#4d3b23',  textMuted: '#7a5e3a' },
    'blackboard':           { bg: '#0c1021', surface: '#0d1222', border: '#253b76', accent: '#c0e34f',  textMain: '#f8f8f8',  textMuted: '#484c67' },
    'vscode-dark':          { bg: '#1e1e1e', surface: '#181818', border: '#2d2d2d', accent: '#007acc',  textMain: '#cccccc',  textMuted: '#858585' },
    'monokai':              { bg: '#2d2a2e', surface: '#221f22', border: '#403e41', accent: '#ffd866',  textMain: '#fcfcfa',  textMuted: '#727072' }
};

/** Convert "#rrggbb" (or short "#rgb") into a CSS rgba() string with the given alpha.
 *  Used so theme-accented overlays/hover states track the active theme instead
 *  of being hardcoded to the Neo-Brutalism yellow. */
function hexToRgba(hex: string, alpha: number): string {
    let h = (hex || '').replace('#', '').trim();
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (h.length !== 6) return `rgba(255,229,0,${alpha})`;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

/* ── Per-file edit history, persisted on the server inside the project
   folder (.history/<base64>.json). Lives next to the source so Google
   Drive backups (full-folder zip) preserve every snapshot. ─────────── */
interface HistoryEntry { ts: number; size: number; content: string }

async function loadHistory(projectId: string, filePath: string): Promise<HistoryEntry[]> {
    try {
        const { rpc } = await import('../access/rpcClient');
        const res = await rpc.call<{ entries?: HistoryEntry[] }>('coding.history.list', { projectId, filePath });
        return Array.isArray(res?.entries) ? res.entries : [];
    } catch { return []; }
}
async function pushHistory(projectId: string, filePath: string, content: string): Promise<void> {
    try {
        const { rpc } = await import('../access/rpcClient');
        await rpc.call('coding.history.push', { projectId, filePath, content });
    } catch { /* best-effort, non-critical */ }
}
async function clearHistory(projectId: string, filePath: string): Promise<void> {
    try {
        const { rpc } = await import('../access/rpcClient');
        await rpc.call('coding.history.clear', { projectId, filePath });
    } catch { /* ignore */ }
}

/* ── Line-level diff (LCS) for the History compare view ─────────────── */
type DiffOp = { type: 'eq' | 'del' | 'add'; left?: string; right?: string };
const DIFF_LINE_CAP = 4000;
function diffLines(a: string, b: string): { ops: DiffOp[]; truncated: boolean } {
    const aLines = a.split('\n');
    const bLines = b.split('\n');
    if (aLines.length > DIFF_LINE_CAP || bLines.length > DIFF_LINE_CAP) {
        const max = Math.max(aLines.length, bLines.length);
        const ops: DiffOp[] = [];
        for (let i = 0; i < max; i++) {
            const l = aLines[i]; const r = bLines[i];
            if (l === r) ops.push({ type: 'eq', left: l, right: r });
            else if (l !== undefined && r !== undefined) {
                ops.push({ type: 'del', left: l });
                ops.push({ type: 'add', right: r });
            } else if (l !== undefined) ops.push({ type: 'del', left: l });
            else ops.push({ type: 'add', right: r! });
        }
        return { ops, truncated: true };
    }
    const m = aLines.length, n = bLines.length;
    const dp: Uint32Array[] = [];
    for (let i = 0; i <= m; i++) dp.push(new Uint32Array(n + 1));
    for (let i = m - 1; i >= 0; i--) {
        for (let j = n - 1; j >= 0; j--) {
            if (aLines[i] === bLines[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
            else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    const ops: DiffOp[] = [];
    let i = 0, j = 0;
    while (i < m && j < n) {
        if (aLines[i] === bLines[j]) { ops.push({ type: 'eq', left: aLines[i], right: bLines[j] }); i++; j++; }
        else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ type: 'del', left: aLines[i] }); i++; }
        else { ops.push({ type: 'add', right: bLines[j] }); j++; }
    }
    while (i < m) ops.push({ type: 'del', left: aLines[i++] });
    while (j < n) ops.push({ type: 'add', right: bLines[j++] });
    return { ops, truncated: false };
}

/* ── Hunk grouping for the Merge picker ─────────────────────────────── */
type HunkChoice = 'base' | 'compare' | 'both' | 'skip';
type HunkOrEq =
    | { kind: 'eq'; op: DiffOp }
    | { kind: 'hunk'; id: number; dels: DiffOp[]; adds: DiffOp[] };

function groupHunks(ops: DiffOp[]): HunkOrEq[] {
    const out: HunkOrEq[] = [];
    let id = 0;
    let i = 0;
    while (i < ops.length) {
        if (ops[i].type === 'eq') { out.push({ kind: 'eq', op: ops[i] }); i++; continue; }
        const dels: DiffOp[] = [];
        const adds: DiffOp[] = [];
        while (i < ops.length && ops[i].type !== 'eq') {
            if (ops[i].type === 'del') dels.push(ops[i]);
            else adds.push(ops[i]);
            i++;
        }
        out.push({ kind: 'hunk', id: id++, dels, adds });
    }
    return out;
}

function buildMerged(items: HunkOrEq[], choices: Record<number, HunkChoice>): string {
    const lines: string[] = [];
    for (const it of items) {
        if (it.kind === 'eq') { lines.push(it.op.left ?? ''); continue; }
        const c = choices[it.id] ?? 'compare';
        if (c === 'base') for (const d of it.dels) lines.push(d.left ?? '');
        else if (c === 'compare') for (const a of it.adds) lines.push(a.right ?? '');
        else if (c === 'both') {
            for (const d of it.dels) lines.push(d.left ?? '');
            for (const a of it.adds) lines.push(a.right ?? '');
        }
        // 'skip' contributes nothing
    }
    return lines.join('\n');
}

const getFileType = (filename: string | undefined) => {
    if (!filename) return 'code';
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico'].includes(ext)) return 'image';
    if (['mp4', 'webm', 'ogg', 'mov'].includes(ext)) return 'video';
    if (['mp3', 'wav'].includes(ext)) return 'audio';
    return 'code';
};


const CodingPage = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const projectId = searchParams.get('project');

    const {
        files, activeFile, content, setActiveFile, setContent,
        isLoading, currentTheme, setTheme, wordWrap, setWordWrap
    } = useLegacyEditorStore();

    const [showSettings, setShowSettings] = useState(false);
    const [autoSaveState, setAutoSaveState] = useState<AutoSaveState>('idle');
    const [showHistory, setShowHistory] = useState(false);
    const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
    const savedContentRef = useRef<{ path: string; content: string } | null>(null);
    const autoSaveTimerRef = useRef<number | null>(null);
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
    const [sidebarVisible, setSidebarVisible] = useState(window.innerWidth > 768);
    const [showExitConfirm, setShowExitConfirm] = useState(false);
    const [showCmdk, setShowCmdk] = useState(false);

    const [activeSidebarTab, setActiveSidebarTab] = useState<'explorer' | 'npm' | 'github' | 'ai'>('explorer');
    const [projectLanguage, setProjectLanguage] = useState<string>('nodejs');
    const [projectRuntime, setProjectRuntime] = useState<string>('node');

    // Brand the browser tab as "Exocode" while the editor is mounted.
    // (The dashboard re-sets it back to "Exocore" when it mounts.)
    useEffect(() => {
        const prev = document.title;
        document.title = 'Exocode';
        return () => { document.title = prev; };
    }, []);

    useEffect(() => {
        if (!projectId) return;
        void (async () => {
            try {
                const { rpc } = await import('../access/rpcClient');
                const res = await rpc.call<any>('projects.list', {});
                const list = res?.projects || [];
                const proj = list.find((p: any) => p.id === projectId);
                if (proj) {
                    setProjectLanguage(proj.language || 'nodejs');
                    setProjectRuntime(proj.runtime || 'node');
                }
            } catch {}
        })();
    }, [projectId]);

    const autoInstall = searchParams.get('autoinstall') === '1';
    const [bottomPanel, setBottomPanel] = useState<'none' | 'terminal' | 'console' | 'webview' | 'problems'>(
        autoInstall ? 'terminal' : 'none'
    );

    // After a one-shot autoinstall, strip the flag from the URL so a
    // refresh / re-mount doesn't re-trigger the install command.
    useEffect(() => {
        if (!autoInstall) return;
        const sp = new URLSearchParams(searchParams);
        sp.delete('autoinstall');
        const t = setTimeout(() => {
            navigate(`/editor?${sp.toString()}`, { replace: true });
        }, 1500);
        return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const [webviewUrl, setWebviewUrl] = useState<string | null>(null);
    const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
    const [showWebview, setShowWebview] = useState(false);

    const diagnostics = useLspClient(content || "", activeFile?.name || "", projectId ?? undefined);
    const errorsCount = diagnostics.filter(d => d.severity === 'error').length;
    const warningsCount = diagnostics.filter(d => d.severity === 'warning').length;

    const [sidebarWidth, setSidebarWidth] = useState(260);
    const isResizing = useRef(false);

    const editorWrapperRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<SimpleCodeEditorRef | null>(null);

    const jumpToLine = useCallback((line: number) => {
        const ref = editorRef.current;
        if (!ref) return;
        try {
            const ta = document.querySelector<HTMLTextAreaElement>('.sce-wrap textarea');
            if (!ta) { ref.focus(); return; }
            const text = ta.value || '';
            const lines = text.split('\n');
            const safeL = Math.max(1, Math.min(line, lines.length));
            let pos = 0;
            for (let i = 0; i < safeL - 1; i++) pos += lines[i].length + 1;
            ta.focus();
            ta.setSelectionRange(pos, pos);
            /* Scroll target line into view */
            const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 22;
            const scroller = ta.closest<HTMLElement>('.sce-wrap');
            if (scroller) scroller.scrollTo({ top: Math.max(0, (safeL - 3) * lineHeight), behavior: 'smooth' });
        } catch {}
    }, []);

    const activeFileType = getFileType(activeFile?.name);

    
    const tabsRef = useRef<HTMLDivElement>(null);
    const [isDraggingTabs, setIsDraggingTabs] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);

    const onDragStart = (e: React.MouseEvent | React.TouchEvent) => {
        if (!tabsRef.current) return;
        setIsDraggingTabs(true);
        const pageX = 'touches' in e ? e.touches[0].pageX : (e as React.MouseEvent).pageX;
        setStartX(pageX - tabsRef.current.offsetLeft);
        setScrollLeft(tabsRef.current.scrollLeft);
    };

    const onDragMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDraggingTabs || !tabsRef.current) return;
        e.preventDefault();
        const pageX = 'touches' in e ? e.touches[0].pageX : (e as React.MouseEvent).pageX;
        const x = pageX - tabsRef.current.offsetLeft;
        const walk = (x - startX) * 2;
        tabsRef.current.scrollLeft = scrollLeft - walk;
    };

    const onDragEnd = () => {
        setIsDraggingTabs(false);
    };

    nprogress.configure({ showSpinner: false, speed: 400 });

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (!isMobile) return;
        window.history.pushState({ editorGuard: true }, '');
        const handlePop = (e: PopStateEvent) => {
            if (e.state?.editorGuard !== true) {
                window.history.pushState({ editorGuard: true }, '');
                setShowExitConfirm(true);
            }
        };
        window.addEventListener('popstate', handlePop);
        return () => window.removeEventListener('popstate', handlePop);
    }, [isMobile]);

    const flushSave = useCallback(async (): Promise<void> => {
        if (!activeFile || activeFileType !== 'code' || !projectId) return;
        const path = activeFile.path;
        const snapshot = content;
        const ref = savedContentRef.current;
        if (ref && ref.path === path && ref.content === snapshot) return;
        setAutoSaveState('saving');
        try {
            const { rpc } = await import('../access/rpcClient');
            await rpc.call('coding.save', { projectId, filePath: path, content: snapshot });
            savedContentRef.current = { path, content: snapshot };
            await pushHistory(projectId, path, snapshot);
            setAutoSaveState('saved');
        } catch {
            setAutoSaveState('error');
        }
    }, [activeFile, content, projectId, activeFileType]);

    // Debounced auto-save: each keystroke schedules a save 800 ms later.
    // Switching files re-baselines the "last saved" content so the loaded
    // file isn't immediately re-saved.
    useEffect(() => {
        if (!activeFile || activeFileType !== 'code' || !projectId) {
            setAutoSaveState('idle');
            return;
        }
        const ref = savedContentRef.current;
        if (!ref || ref.path !== activeFile.path) {
            savedContentRef.current = { path: activeFile.path, content };
            setAutoSaveState('saved');
            return;
        }
        if (ref.content === content) return;
        setAutoSaveState('saving');
        if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = window.setTimeout(() => { void flushSave(); }, 800);
        return () => {
            if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
        };
    }, [content, activeFile, activeFileType, projectId, flushSave]);

    const openHistory = useCallback(async () => {
        if (!activeFile || !projectId) return;
        const entries = await loadHistory(projectId, activeFile.path);
        setHistoryEntries(entries);
        setShowHistory(true);
    }, [activeFile, projectId]);

    const restoreHistory = useCallback(async (entry: HistoryEntry) => {
        if (!activeFile) return;
        setContent(entry.content);
        setShowHistory(false);
        toast.success('Restored snapshot — auto-saving…');
    }, [activeFile, setContent]);

    const wipeHistory = useCallback(async () => {
        if (!activeFile || !projectId) return;
        if (!confirm('Clear local code history for this file? Hindi maibabalik.')) return;
        await clearHistory(projectId, activeFile.path);
        setHistoryEntries([]);
        toast.success('History cleared.');
    }, [activeFile, projectId]);

    const handleFileOpen = async (node: FileNode) => {
        try {
            const type = getFileType(node.name);
            if (type === 'code') {
                const { rpc } = await import('../access/rpcClient');
                const res = await rpc.call<any>('coding.read', { projectId, filePath: node.path });
                setActiveFile(node, res.content);
            } else {
                setActiveFile(node, '');
            }
            if (isMobile) setSidebarVisible(false);
        } catch (err) { toast.error("Read failed"); }
    };

    const initApp = useCallback(async () => {
        if (!projectId) return navigate('/dashboard');
        useEditorStore.getState().setActiveFile(null, '');
        useFileStore.getState().setFiles([]);
        useEditorStore.getState().setLoading(true);
        nprogress.start();
        try {
            const { rpc } = await import('../access/rpcClient');
            const [filesRes, settingsRes] = await Promise.all([
                rpc.call<any>('coding.files', { projectId }),
                axios.post('/exocore/api/settings').catch(() => null),
            ]);
            useFileStore.getState().setFiles(filesRes.files);
            if (settingsRes?.data?.success && settingsRes.data.settings) {
                if (settingsRes.data.settings.editorTheme) setTheme(settingsRes.data.settings.editorTheme);
                if (settingsRes.data.settings.wordWrap !== undefined) setWordWrap(settingsRes.data.settings.wordWrap);
            }
        } finally { useEditorStore.getState().setLoading(false); nprogress.done(); }
    }, [projectId, setTheme, setWordWrap, navigate]);

    useEffect(() => { initApp(); }, [initApp]);
    useHotkeys('ctrl+s', (e) => { e.preventDefault(); void flushSave(); }, { enableOnFormTags: true });
    useHotkeys('ctrl+shift+h, meta+shift+h', (e) => { e.preventDefault(); void openHistory(); }, { enableOnFormTags: true });
    useHotkeys('ctrl+k, meta+k, ctrl+p, meta+p', (e) => { e.preventDefault(); setShowCmdk(true); }, { enableOnFormTags: true });
    useHotkeys('escape', () => { if (showCmdk) setShowCmdk(false); }, { enableOnFormTags: true });

    const togglePanel = (panel: 'terminal' | 'console' | 'webview' | 'problems') => {
        setBottomPanel(prev => prev === panel ? 'none' : panel);
        if (isMobile) setSidebarVisible(false);
    };

        const active = THEMES[currentTheme] || THEMES['cursor-dark'];
        const isLight = LIGHT_THEMES.has(currentTheme);
        const scheme = isLight ? 'light' : 'dark';

        if (isLoading) return <div className="loader-screen" style={{ background: active.bg, color: active.accent }}><Loader2 className="spin" /> Starting Exocode...</div>;

        const mediaUrl = activeFile ? `/exocore/api/editor/coding/media?projectId=${projectId}&filePath=${encodeURIComponent(activeFile.path)}` : '';

        return (
            <div className="vscode-layout" data-scheme={scheme} style={{ background: active.bg, color: active.textMain }}>
            <Toaster position="bottom-right" />

            {showExitConfirm && (
                <ExitConfirmModal
                    theme={active}
                    onStay={() => setShowExitConfirm(false)}
                    onLeave={() => { setShowExitConfirm(false); navigate('/dashboard'); }}
                />
            )}

            <LayoutHeader
                theme={active}
                isMobile={isMobile}
                autoSaveState={autoSaveState}
                hasActiveFile={!!activeFile}
                activeFileIsCode={activeFileType === 'code'}
                onBack={() => isMobile ? setShowExitConfirm(true) : navigate('/dashboard')}
                onOpenHistory={openHistory}
                onSettings={() => setShowSettings(true)}
                onOpenCommand={() => setShowCmdk(true)}
            />

            <CommandPalette
                open={showCmdk}
                onClose={() => setShowCmdk(false)}
                files={files}
                theme={active}
                onOpenFile={(node) => handleFileOpen(node)}
                onSetPanel={(p) => setBottomPanel(p)}
                onSetSidebarTab={(t) => { setActiveSidebarTab(t); setSidebarVisible(true); }}
                onToggleSidebar={() => setSidebarVisible(v => !v)}
                onSave={() => void flushSave()}
                onOpenSettings={() => setShowSettings(true)}
                onBack={() => navigate('/dashboard')}
                activePanel={bottomPanel}
            />

            {isMobile && sidebarVisible && (
                <div className="mobile-backdrop" onClick={() => setSidebarVisible(false)} />
            )}

            {isMobile && !showCmdk && bottomPanel === 'none' && !sidebarVisible && (
                <button
                    className="fab-cmdk"
                    onClick={() => setShowCmdk(true)}
                    style={{ background: active.accent }}
                    aria-label="Search & commands"
                >
                    <Search size={22} />
                </button>
            )}

            <div className="workspace-container">
            <aside className={`sidebar-fixed ${sidebarVisible ? 'open' : ''}`} style={{
                width: isMobile ? '85%' : `${sidebarWidth}px`,
                background: active.surface, borderRight: `1px solid ${active.border}`,
            }}>
            <SidebarTabBar
                activeTab={activeSidebarTab}
                isMobile={isMobile}
                isDraggingTabs={isDraggingTabs}
                theme={active}
                tabsRef={tabsRef}
                packagesLabel={getPackageManagerLabel(projectLanguage, projectRuntime)}
                onTabChange={(tab) => setActiveSidebarTab(tab)}
                onClose={() => setSidebarVisible(false)}
                onDragStart={onDragStart}
                onDragMove={onDragMove}
                onDragEnd={onDragEnd}
            />

            <div className="sidebar-body">
            {activeSidebarTab === 'explorer' && <Sidebar projectId={projectId} isVisible={true} onOpen={handleFileOpen} />}
            {activeSidebarTab === 'npm' && <PackagesPane projectId={projectId!} theme={active} language={projectLanguage} runtime={projectRuntime} />}
            {activeSidebarTab === 'github' && <GithubPane projectId={projectId!} theme={active} />}
            {activeSidebarTab === 'drive' && <GDrivePane projectId={projectId!} theme={active} />}
            {activeSidebarTab === 'ai' && <ExocoreAI projectId={projectId!} theme={active} />}
            </div>
            </aside>

            {!isMobile && sidebarVisible && (
                <div className="resizer" onMouseDown={() => {
                    isResizing.current = true;
                    document.onmousemove = (e) => { if(isResizing.current) setSidebarWidth(Math.max(180, Math.min(500, e.clientX))); };
                    document.onmouseup = () => isResizing.current = false;
                }} />
            )}

            <main className="editor-area">
            <div className="content-split">
            <div className="monaco-container">
            {activeFile ? (
                <div className="editor-wrapper">
                <Tabs activeFile={activeFile} activeFileType={activeFileType} theme={active} projectId={projectId} />

                <div ref={editorWrapperRef} style={{ flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {activeFileType === 'code' && (
                    <SimpleCodeEditor
                        filename={activeFile.name}
                        value={content || ''}
                        onChange={setContent}
                        themeName={currentTheme}
                        wordWrap={wordWrap}
                        isMobile={isMobile}
                        onSave={() => void flushSave()}
                        projectId={projectId ?? undefined}
                        fullPath={activeFile.path}
                        editorRef={editorRef}
                        diagnostics={diagnostics}
                    />
                )}
                {activeFileType === 'image' && (
                    <div style={{ width: '100%', height: '100%', padding: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center', background: active.surface }}>
                    <img src={mediaUrl} alt={activeFile.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '4px', boxShadow: isLight ? '0 10px 30px rgba(0,0,0,0.12)' : '0 10px 30px rgba(0,0,0,0.3)' }} />
                    </div>
                )}
                {activeFileType === 'video' && (
                    <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#000' }}>
                    <video controls src={mediaUrl} style={{ maxWidth: '100%', maxHeight: '100%' }} />
                    </div>
                )}
                {activeFileType === 'audio' && (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: active.surface }}>
                    <Music size={64} style={{ color: active.textMuted, marginBottom: '20px' }} />
                    <audio controls src={mediaUrl} style={{ width: '80%', maxWidth: '400px' }} />
                    </div>
                )}
                </div>
                </div>
            ) : (
                <div className="empty-state-wrap">
                <div className="empty-icon-ring" style={{ borderColor: active.border, color: active.accent }}>
                    <Code2 size={44} strokeWidth={1.5} />
                </div>
                <div className="empty-title" style={{ color: active.textMain }}>No file open</div>
                <div className="empty-subtitle" style={{ color: active.textMuted }}>Select a file from the explorer to start editing</div>
                </div>
            )}
            </div>
            {showWebview && !isMobile && (
                <div className="webview-pane" style={{ borderLeft: `1px solid ${active.border}` }}>
                <Webview url={webviewUrl} tunnelUrl={tunnelUrl} theme={active} onClose={() => setShowWebview(false)} />
                </div>
            )}
            </div>

            {bottomPanel !== 'none' && (
                <div className={`bottom-panel ${isMobile ? 'mobile-panel' : ''}`} style={{ background: active.surface, borderTop: `1px solid ${active.border}` }}>
                <div className="panel-header" style={{ borderBottom: `1px solid ${active.border}` }}>
                <span>{bottomPanel.toUpperCase()}</span>
                <button className="close-panel" onClick={() => setBottomPanel('none')}><X size={16}/></button>
                </div>
                <div className="panel-content custom-scrollbar">
                {bottomPanel === 'problems' && (
                    <DiagnosticsList diagnostics={diagnostics} onJumpToLine={jumpToLine} projectId={projectId ?? undefined} />
                )}
                {bottomPanel === 'terminal' && <KittyTerminal theme={active} onClose={() => setBottomPanel('none')} />}
                {bottomPanel === 'console' && <ConsolePane projectId={projectId!} theme={active} onClose={() => setBottomPanel('none')} onRunningChange={() => {}} onUrlDetect={(u) => { setWebviewUrl(u); setTunnelUrl(null); if(!isMobile) setShowWebview(true); }} onTunnelDetect={(u) => setTunnelUrl(u)} />}
                {bottomPanel === 'webview' && isMobile && <Webview url={webviewUrl} tunnelUrl={tunnelUrl} theme={active} onClose={() => setBottomPanel('none')} />}
                </div>
                </div>
            )}
            </main>
            </div>

            <footer className="status-bar" style={{ background: active.surface, borderTop: `1px solid ${active.border}` }}>
            {isMobile ? (
                <div className="mobile-nav">
                <button className={`m-nav-btn ${sidebarVisible ? 'active' : ''}`} onClick={() => setSidebarVisible(!sidebarVisible)}><Files size={20}/><span className="m-nav-label">Files</span></button>
                <button className={`m-nav-btn ${bottomPanel === 'problems' ? 'active' : ''}`} onClick={() => togglePanel('problems')}><AlertCircle size={20} color={errorsCount > 0 ? '#ff5555' : 'inherit'}/><span className="m-nav-label" style={{ color: errorsCount > 0 ? '#ff5555' : 'inherit' }}>Errors</span></button>
                <button className={`m-nav-btn ${bottomPanel === 'console' ? 'active' : ''}`} onClick={() => togglePanel('console')}><PlayCircle size={20}/><span className="m-nav-label">Console</span></button>
                <button className={`m-nav-btn ${bottomPanel === 'terminal' ? 'active' : ''}`} onClick={() => togglePanel('terminal')}><TerminalSquare size={20}/><span className="m-nav-label">Terminal</span></button>
                <button className={`m-nav-btn ${bottomPanel === 'webview' ? 'active' : ''}`} onClick={() => togglePanel('webview')}><Globe size={20}/><span className="m-nav-label">Preview</span></button>
                </div>
            ) : (
                <div className="desktop-status">
                <div className="status-left">
                <button className="status-btn" onClick={() => setSidebarVisible(!sidebarVisible)}><Files size={13}/> Sidebar</button>
                <button className={`status-btn ${errorsCount > 0 ? 'has-error' : ''}`} onClick={() => togglePanel('problems')}><AlertCircle size={13}/> {errorsCount} Errors &nbsp; <AlertTriangle size={13}/> {warningsCount} Warnings</button>
                </div>
                <div className="status-right">
                <button className={`status-btn ${bottomPanel === 'console' ? 'active' : ''}`} onClick={() => togglePanel('console')}><PlayCircle size={13}/> Console</button>
                <button className={`status-btn ${bottomPanel === 'terminal' ? 'active' : ''}`} onClick={() => togglePanel('terminal')}><TerminalSquare size={13}/> Terminal</button>
                <button className={`status-btn ${showWebview ? 'active' : ''}`} onClick={() => setShowWebview(!showWebview)}><Globe size={13}/> Preview</button>
                </div>
                </div>
            )}
            </footer>

            {isMobile && sidebarVisible && <div className="mobile-overlay" onClick={() => setSidebarVisible(false)} />}

            <style>{`
                /* .vscode-layout rules now live in editor.css (position:fixed, overscroll lock) */
                /* .main-header rules now live in editor.css (always-pinned, safe-area aware) */
                .header-title { font-weight: 900; font-size: 11px; letter-spacing: 0.2em; opacity: 0.5; flex: 1; text-align: center; text-transform: uppercase; }
                .header-actions { display: flex; align-items: center; gap: 10px; }
                .save-btn { padding: 6px 14px; color: #000; font-size: 10px; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 8px; letter-spacing: 0.08em; text-transform: uppercase; }
                .workspace-container { display: flex; flex: 1; overflow: hidden; position: relative; }
                .sidebar-fixed { display: grid; grid-template-rows: auto 1fr; flex-shrink: 0; transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1); overflow: hidden; }

                /* DRAGGABLE TABS CSS */
                .sidebar-tabs {
                    display: flex;
                    padding: 0;
                    gap: 0;
                    overflow-x: auto;
                    white-space: nowrap;
                    cursor: grab;
                    user-select: none;
                }
                .sidebar-tabs.dragging { cursor: grabbing; }
                .sidebar-tabs::-webkit-scrollbar { display: none; }

                .tab-btn { background: none; border: none; border-right: 1px solid rgba(255,255,255,0.05); color: inherit; padding: 10px 14px; font-size: 10px; font-weight: 800; cursor: pointer; opacity: 0.45; display: flex; align-items: center; gap: 6px; border-radius: 0; letter-spacing: 0.1em; text-transform: uppercase; transition: 0.1s; flex-shrink: 0; }
                .tab-btn:hover { opacity: 0.8; background: ${hexToRgba(active.accent, 0.05)}; }
                .tab-btn.active { opacity: 1; background: ${hexToRgba(active.accent, 0.06)}; color: ${active.accent}; border-bottom: 2px solid ${active.accent}; }
                .sidebar-body { overflow: hidden; min-height: 0; height: 100%; }
                .sidebar-body > * { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
                .sidebar-close-btn { background: none; border: none; color: inherit; cursor: pointer; padding: 8px; opacity: 0.5; transition: 0.1s; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

                @media (max-width: 768px) {
                    .sidebar-fixed { position: absolute; left: 0; top: 0; height: 100%; transform: translateX(-100%); z-index: 2000; box-shadow: 10px 0 30px rgba(0,0,0,0.5); overflow: hidden; }
                    .sidebar-fixed.open { transform: translateX(0); }
                    .mobile-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.5); z-index: 1500; backdrop-filter: blur(2px); }
                }
                .editor-area { flex: 1; display: flex; flex-direction: column; min-width: 0; }
                .content-split { flex: 1; display: flex; min-height: 0; position: relative; }
                .monaco-container { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; }
                .editor-wrapper { display: flex; flex-direction: column; height: 100%; width: 100%; flex: 1; min-height: 0; }
                .file-header { height: 40px; display: flex; align-items: center; justify-content: space-between; padding: 0 15px; flex-shrink: 0; }
                .tab-pill { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; }
                .breadcrumb-path { font-size: 10px; opacity: 0.4; font-family: 'Inter', monospace; display: flex; align-items: center; }
                /* .bottom-panel rules now live in editor.css (handles desktop + mobile sheet) */
                .diag-list { padding: 15px 0; }
                .diag-row { display: flex; gap: 12px; padding: 8px 20px; font-family: 'Inter', monospace; font-size: 12px; border-bottom: 1px solid rgba(255,255,255,0.03); align-items: center; }
                .diag-row.error { color: #ff8888; }
                .diag-row.warning { color: #ffcc66; }
                .d-loc { opacity: 0.5; margin-left: auto; font-size: 11px; background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 4px; }
                .no-probs { padding: 50px; text-align: center; opacity: 0.4; font-size: 13px; display: flex; flex-direction: column; align-items: center; }
                .status-bar { height: 35px; flex-shrink: 0; display: flex; align-items: center; z-index: 200; position: sticky; bottom: 0; }
                .mobile-nav {
                    display: flex; width: 100%; height: 100%; justify-content: space-around; align-items: stretch;
                    padding-bottom: env(safe-area-inset-bottom, 0px);
                }
                .m-nav-btn {
                    background: none; border: none; color: inherit; opacity: 0.45;
                    padding: 6px 4px 8px 4px; flex: 1;
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    gap: 3px; transition: opacity 0.15s, color 0.15s; cursor: pointer;
                    touch-action: manipulation;
                    -webkit-tap-highlight-color: transparent;
                    min-height: 52px;
                }
                .m-nav-btn:active { opacity: 0.7; transform: scale(0.95); }
                .m-nav-btn.active { opacity: 1; color: ${active.accent}; }
                .m-nav-label { font-size: 9px; font-weight: 700; letter-spacing: 0.3px; }
                @media (max-width: 768px) { .status-bar { height: 56px; } }
                .mobile-clipboard-bar {
                    display: flex; align-items: center; gap: 0;
                    background: rgba(0,0,0,0.35); border-bottom: 1px solid rgba(255,255,255,0.08);
                    flex-shrink: 0; overflow-x: auto; flex-wrap: nowrap;
                }
                .mcb-btn {
                    background: none; border: none; color: inherit;
                    padding: 7px 14px; font-size: 12px; font-weight: 600;
                    cursor: pointer; opacity: 0.75; white-space: nowrap;
                    display: flex; align-items: center; gap: 5px;
                    touch-action: manipulation; -webkit-tap-highlight-color: transparent;
                    border-right: 1px solid rgba(255,255,255,0.06);
                    transition: background 0.1s, opacity 0.1s;
                }
                .mcb-btn:active { background: rgba(255,255,255,0.08); opacity: 1; }
                .desktop-status { display: flex; width: 100%; justify-content: space-between; padding: 0 15px; }
                .status-left, .status-right { display: flex; gap: 15px; }
                .status-btn { background: none; border: none; color: inherit; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.5; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: 0.1s; font-family: 'IBM Plex Sans', sans-serif; }
                .status-btn:hover { opacity: 1; }
                .status-btn.active { color: ${active.accent}; opacity: 1; }
                .status-btn.has-error { color: #ff5555; opacity: 1; font-weight: bold; }
                .icon-btn { background: none; border: none; color: inherit; cursor: pointer; padding: 8px; border-radius: 4px; opacity: 0.6; transition: 0.2s; }
                .icon-btn:hover { opacity: 1; background: rgba(255,255,255,0.1); }
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { 100% { transform: rotate(360deg); } }
                .custom-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 10px; }
                .empty-state { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; }
                .resizer { width: 4px; cursor: col-resize; z-index: 150; transition: 0.1s; }
                .resizer:hover { background: ${active.accent}; }
                `}</style>
                {showSettings && <Settings onClose={() => setShowSettings(false)} />}
                {showHistory && activeFile && (
                    <CodeHistoryModal
                        themeName={currentTheme}
                        theme={active}
                        fileName={activeFile.name}
                        entries={historyEntries}
                        onClose={() => setShowHistory(false)}
                        onRestore={restoreHistory}
                        onClear={wipeHistory}
                    />
                )}
                </div>
        );
};

interface CodeHistoryModalProps {
    theme: any;
    themeName: string;
    fileName: string;
    entries: HistoryEntry[];
    onClose: () => void;
    onRestore: (entry: HistoryEntry) => void;
    onClear: () => void;
}

/* "just now / 2m ago / 3h ago / 2d ago" — tight Replit-style label */
function timeAgo(ts: number): string {
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 5) return 'just now';
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
}

const CodeHistoryModal: React.FC<CodeHistoryModalProps> = ({
    theme, themeName, fileName, entries, onClose, onRestore, onClear,
}) => {
    // selectedIdx: 0 = newest entry, entries.length-1 = oldest.
    const [selectedIdx, setSelectedIdx] = useState(0);
    const [compareOn, setCompareOn] = useState(false);
    const [changesOnly, setChangesOnly] = useState(false);
    const [advancedMerge, setAdvancedMerge] = useState(false);

    // Used only by the (opt-in) Advanced merge sub-view.
    const [baseIdx, setBaseIdx] = useState<number>(Math.min(1, Math.max(0, entries.length - 1)));
    const [compareIdx, setCompareIdx] = useState<number>(0);
    const [hunkChoices, setHunkChoices] = useState<Record<number, HunkChoice>>({});

    const [isNarrow, setIsNarrow] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth < 720);
    const [playing, setPlaying] = useState(false);

    useEffect(() => {
        const onResize = () => setIsNarrow(window.innerWidth < 720);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    useEffect(() => {
        if (entries.length === 0) return;
        if (selectedIdx >= entries.length) setSelectedIdx(0);
        if (baseIdx >= entries.length) setBaseIdx(Math.min(1, entries.length - 1));
        if (compareIdx >= entries.length) setCompareIdx(0);
    }, [entries.length, selectedIdx, baseIdx, compareIdx]);

    // Reset per-hunk picks whenever the snapshot pair changes (advanced merge).
    useEffect(() => { setHunkChoices({}); }, [baseIdx, compareIdx]);

    // Auto-advance from oldest → newest while playing.
    useEffect(() => {
        if (!playing || entries.length < 2) return;
        const id = window.setInterval(() => {
            setSelectedIdx(prev => {
                if (prev <= 0) { setPlaying(false); return 0; }
                return prev - 1;
            });
        }, 700);
        return () => window.clearInterval(id);
    }, [playing, entries.length]);

    const max = Math.max(0, entries.length - 1);
    // Slider value: oldest on the left (0), newest on the right (max).
    const sliderVal = max - selectedIdx;
    const onSliderChange = (val: number) => {
        const v = Math.min(max, Math.max(0, val));
        setSelectedIdx(max - v);
        if (playing) setPlaying(false);
    };
    const goPrev = () => { if (selectedIdx < max) setSelectedIdx(selectedIdx + 1); };
    const goNext = () => { if (selectedIdx > 0) setSelectedIdx(selectedIdx - 1); };

    const selected = entries[selectedIdx];
    const latest = entries[0];
    const base = entries[baseIdx];
    const compare = entries[compareIdx];

    // In the simple Compare toggle, we always diff (selected) vs (latest).
    // The advanced merge view picks its own (base, compare) pair.
    const diffPair = advancedMerge
        ? (base && compare ? { left: base, right: compare } : null)
        : (compareOn && selected && latest && selectedIdx > 0
            ? { left: selected, right: latest }
            : null);
    const diff = diffPair ? diffLines(diffPair.left.content, diffPair.right.content) : null;

    let addCount = 0, delCount = 0;
    if (diff) for (const op of diff.ops) {
        if (op.type === 'add') addCount++;
        else if (op.type === 'del') delCount++;
    }
    const hunkItems: HunkOrEq[] = (advancedMerge && diff) ? groupHunks(diff.ops) : [];
    const hunkCount = hunkItems.reduce((n, it) => n + (it.kind === 'hunk' ? 1 : 0), 0);
    const setHunkPick = (id: number, choice: HunkChoice) =>
        setHunkChoices(prev => ({ ...prev, [id]: choice }));
    const setAllHunkPicks = (choice: HunkChoice) => {
        const next: Record<number, HunkChoice> = {};
        for (const it of hunkItems) if (it.kind === 'hunk') next[it.id] = choice;
        setHunkChoices(next);
    };
    const resetHunkPicks = () => setHunkChoices({});
    const mergedContent = (advancedMerge && diff) ? buildMerged(hunkItems, hunkChoices) : '';
    const restoreMerged = () => {
        if (!diff) return;
        onRestore({ ts: Date.now(), size: mergedContent.length, content: mergedContent });
    };

    // Group equal runs into collapsible spacers when the user wants
    // "Changes only". We keep up to 2 lines of context around each
    // change for readability, and replace longer runs with a divider.
    type DiffRow =
        | { kind: 'op'; op: DiffOp }
        | { kind: 'gap'; count: number };
    const diffRows: DiffRow[] = (() => {
        if (!diff) return [];
        if (!changesOnly) return diff.ops.map(op => ({ kind: 'op' as const, op }));
        const out: DiffRow[] = [];
        const ops = diff.ops;
        const CTX = 2;
        let i = 0;
        while (i < ops.length) {
            if (ops[i].type !== 'eq') { out.push({ kind: 'op', op: ops[i] }); i++; continue; }
            let j = i;
            while (j < ops.length && ops[j].type === 'eq') j++;
            const runLen = j - i;
            const isFirst = i === 0;
            const isLast = j === ops.length;
            const headCtx = isFirst ? 0 : Math.min(CTX, runLen);
            const tailCtx = isLast ? 0 : Math.min(CTX, runLen - headCtx);
            const middle = runLen - headCtx - tailCtx;
            for (let k = i; k < i + headCtx; k++) out.push({ kind: 'op', op: ops[k] });
            if (middle > 0) out.push({ kind: 'gap', count: middle });
            for (let k = j - tailCtx; k < j; k++) out.push({ kind: 'op', op: ops[k] });
            i = j;
        }
        return out;
    })();

    const isLight = !!theme && (theme.bg === '#ffffff' || /^#f|^#e/i.test(theme.bg || ''));
    const addBg = 'rgba(34,197,94,0.18)';
    const delBg = 'rgba(239,68,68,0.18)';
    const fadedBg = isLight ? '#f4f5f7' : '#161b22';
    const gutterMuted = isLight ? '#9aa4b2' : '#5b6679';

    const tabBtn = (active: boolean): React.CSSProperties => ({
        padding: '6px 12px', fontSize: 11, fontWeight: 700,
        background: active ? theme.accent : 'transparent',
        color: active ? '#000' : theme.textMain,
        border: `1px solid ${active ? theme.accent : theme.border}`,
        borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
    });

    // Side-by-side row (desktop) — two columns, deletions left, additions right.
    const renderDiffRowSplit = (op: DiffOp, idx: number) => {
        const baseEmpty = op.type === 'add';
        const cmpEmpty = op.type === 'del';
        const leftBg = op.type === 'del' ? delBg : (op.type === 'add' ? fadedBg : 'transparent');
        const rightBg = op.type === 'add' ? addBg : (op.type === 'del' ? fadedBg : 'transparent');
        const leftSign = op.type === 'del' ? '-' : ' ';
        const rightSign = op.type === 'add' ? '+' : ' ';
        return (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                <div style={{
                    display: 'grid', gridTemplateColumns: '18px 1fr', background: leftBg,
                    borderRight: `1px solid ${theme.border}`,
                }}>
                    <span style={{ color: gutterMuted, textAlign: 'center', userSelect: 'none' }}>{leftSign}</span>
                    <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', paddingRight: 8 }}>
                        {baseEmpty ? '' : (op.left ?? '')}
                    </span>
                </div>
                <div style={{
                    display: 'grid', gridTemplateColumns: '18px 1fr', background: rightBg,
                }}>
                    <span style={{ color: gutterMuted, textAlign: 'center', userSelect: 'none' }}>{rightSign}</span>
                    <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', paddingRight: 8 }}>
                        {cmpEmpty ? '' : (op.right ?? '')}
                    </span>
                </div>
            </div>
        );
    };

    // Unified row (mobile) — single column with +/- prefix and bg color.
    const renderDiffRowUnified = (op: DiffOp, idx: number) => {
        const bg = op.type === 'add' ? addBg : op.type === 'del' ? delBg : 'transparent';
        const sign = op.type === 'add' ? '+' : op.type === 'del' ? '-' : ' ';
        const text = op.type === 'add' ? (op.right ?? '') : (op.left ?? '');
        const color = op.type === 'add' ? '#16a34a' : op.type === 'del' ? '#ef4444' : theme.textMain;
        return (
            <div key={idx} style={{
                display: 'grid', gridTemplateColumns: '18px 1fr', background: bg,
            }}>
                <span style={{ color, textAlign: 'center', userSelect: 'none', fontWeight: 700 }}>{sign}</span>
                <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', paddingRight: 8 }}>
                    {text}
                </span>
            </div>
        );
    };

    const renderGap = (count: number, key: string) => (
        <div key={key} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '6px 10px', fontSize: 10, fontStyle: 'italic',
            color: theme.textMuted, background: fadedBg,
            borderTop: `1px dashed ${theme.border}`,
            borderBottom: `1px dashed ${theme.border}`,
        }}>
            ··· {count.toLocaleString()} unchanged line{count === 1 ? '' : 's'} ···
        </div>
    );

    const snapshotLabel = (i: number) => {
        const e = entries[i]; if (!e) return '';
        const d = new Date(e.ts);
        const stamp = isNarrow
            ? `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : d.toLocaleString();
        return `${stamp} · ${e.size.toLocaleString()}c${i === 0 ? ' · latest' : ''}`;
    };

    const desktopMaxWidth = (compareOn || advancedMerge) ? 1180 : 820;
    const restoreBtnStyle = (primary: boolean): React.CSSProperties => ({
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '7px 12px',
        background: primary ? theme.accent : 'transparent',
        color: primary ? '#000' : theme.textMain,
        border: primary ? 'none' : `1px solid ${theme.border}`,
        borderRadius: 6, cursor: 'pointer',
        fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
    });

    const onLatest = selectedIdx === 0;
    const isEmpty = entries.length === 0;
    const initial = (fileName?.[0] || 'C').toUpperCase();
    const previewContent = selected?.content || '';

    const ghostBtn: React.CSSProperties = {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '7px 12px', background: 'transparent', color: theme.textMain,
        border: `1px solid ${theme.border}`, borderRadius: 6,
        cursor: 'pointer', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
    };
    const iconBtn: React.CSSProperties = {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 30, height: 30, padding: 0,
        background: 'transparent', color: theme.textMain,
        border: `1px solid ${theme.border}`, borderRadius: 6, cursor: 'pointer',
    };
    const playBtnStyle: React.CSSProperties = {
        ...iconBtn, background: theme.bg, borderColor: theme.border,
    };
    const toggleLabelStyle: React.CSSProperties = {
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 10px', borderRadius: 6,
        border: `1px solid ${theme.border}`,
        cursor: 'pointer', userSelect: 'none', fontSize: 11, fontWeight: 600,
    };

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
                zIndex: 10001, display: 'flex',
                alignItems: isNarrow ? 'stretch' : 'center',
                justifyContent: 'center',
                padding: isNarrow ? 0 : '1rem',
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: theme.surface, color: theme.textMain,
                    border: isNarrow ? 'none' : `1px solid ${theme.border}`,
                    borderRadius: isNarrow ? 0 : 12,
                    width: '100%',
                    maxWidth: isNarrow ? '100%' : desktopMaxWidth,
                    height: isNarrow ? '100%' : 'auto',
                    maxHeight: isNarrow ? '100%' : '85vh',
                    display: 'flex', flexDirection: 'column', overflow: 'hidden',
                }}
            >
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: isNarrow ? '10px 12px' : '12px 16px',
                    borderBottom: `1px solid ${theme.border}`,
                }}>
                    <HistoryIconLg size={16} />
                    <div style={{
                        fontWeight: 700, fontSize: 13,
                        flex: 1, minWidth: 0,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                        {advancedMerge ? 'Advanced merge' : 'Code history'}
                        {' — '}<span style={{ color: theme.textMuted, fontWeight: 500 }}>{fileName}</span>
                    </div>
                    {advancedMerge && (
                        <button onClick={() => setAdvancedMerge(false)} style={ghostBtn} title="Back to history">
                            <ChevronLeft size={12} /> {!isNarrow && 'Back'}
                        </button>
                    )}
                    <button
                        onClick={onClear}
                        disabled={isEmpty}
                        title="Clear all snapshots for this file"
                        style={{
                            ...ghostBtn,
                            color: '#ef4444',
                            cursor: isEmpty ? 'not-allowed' : 'pointer',
                            opacity: isEmpty ? 0.4 : 1,
                        }}
                    >
                        <Trash2 size={12} /> {!isNarrow && 'Clear'}
                    </button>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        style={{
                            background: 'transparent', color: theme.textMain,
                            border: 'none', cursor: 'pointer', padding: 6,
                        }}
                    >
                        <X size={18} />
                    </button>
                </div>
                {isEmpty ? (
                    <div style={{
                        padding: '40px 20px', textAlign: 'center',
                        color: theme.textMuted, fontSize: 13,
                    }}>
                        Wala pang history snapshot para sa file na ito.<br />
                        Magtatabi ng kopya kada auto-save sa <code style={{ background: theme.bg, padding: '1px 5px', borderRadius: 3 }}>.history/</code> ng project.
                    </div>
                ) : advancedMerge ? (
                    <MergeBody
                        theme={theme}
                        isNarrow={isNarrow}
                        entries={entries}
                        baseIdx={baseIdx}
                        setBaseIdx={setBaseIdx}
                        compareIdx={compareIdx}
                        setCompareIdx={setCompareIdx}
                        snapshotLabel={snapshotLabel}
                        addCount={addCount}
                        delCount={delCount}
                        diff={diff}
                        hunkItems={hunkItems}
                        hunkCount={hunkCount}
                        hunkChoices={hunkChoices}
                        setHunkPick={setHunkPick}
                        setAllHunkPicks={setAllHunkPicks}
                        resetHunkPicks={resetHunkPicks}
                        mergedContent={mergedContent}
                        restoreMerged={restoreMerged}
                        addBg={addBg}
                        delBg={delBg}
                        fadedBg={fadedBg}
                        gutterMuted={gutterMuted}
                        restoreBtnStyle={restoreBtnStyle}
                    />
                ) : (
                    <div style={{
                        display: 'flex', flexDirection: 'column',
                        flex: 1, minHeight: 0,
                    }}>
                        {/* SCRUBBER — slider + transport controls */}
                        <div style={{
                            padding: isNarrow ? '12px 12px 8px' : '14px 16px 10px',
                            borderBottom: `1px solid ${theme.border}`,
                            background: theme.bg,
                        }}>
                            <input
                                type="range"
                                min={0}
                                max={max}
                                step={1}
                                value={sliderVal}
                                onChange={e => onSliderChange(Number(e.target.value))}
                                disabled={entries.length < 2}
                                style={{
                                    width: '100%', accentColor: theme.accent,
                                    cursor: entries.length < 2 ? 'not-allowed' : 'pointer',
                                    margin: 0,
                                }}
                            />
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                marginTop: 8,
                            }}>
                                <button
                                    onClick={() => setPlaying(p => !p)}
                                    disabled={entries.length < 2 || onLatest && !playing}
                                    title={playing ? 'Pause playback' : 'Play through history (oldest → newest)'}
                                    style={{
                                        ...playBtnStyle,
                                        opacity: entries.length < 2 ? 0.4 : 1,
                                        cursor: entries.length < 2 ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    {playing ? <Pause size={14} /> : <Play size={14} />}
                                </button>
                                <button
                                    onClick={goPrev}
                                    disabled={selectedIdx >= max}
                                    title="Older snapshot"
                                    style={{
                                        ...iconBtn,
                                        opacity: selectedIdx >= max ? 0.4 : 1,
                                        cursor: selectedIdx >= max ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    <ChevronLeft size={14} />
                                </button>
                                <span style={{
                                    fontSize: 13, fontWeight: 700, color: theme.textMain,
                                    minWidth: 56, textAlign: 'center',
                                    fontFamily: "'IBM Plex Mono', monospace",
                                }}>
                                    {entries.length - selectedIdx} / {entries.length}
                                </span>
                                <button
                                    onClick={goNext}
                                    disabled={selectedIdx <= 0}
                                    title="Newer snapshot"
                                    style={{
                                        ...iconBtn,
                                        opacity: selectedIdx <= 0 ? 0.4 : 1,
                                        cursor: selectedIdx <= 0 ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    <ChevronRight size={14} />
                                </button>
                                <div style={{ flex: 1 }} />
                                <span style={{ fontSize: 12, color: theme.textMuted, whiteSpace: 'nowrap' }}>
                                    {selected ? timeAgo(selected.ts) : ''}
                                </span>
                                <div
                                    title={selected ? new Date(selected.ts).toLocaleString() : ''}
                                    style={{
                                        width: 26, height: 26, borderRadius: '50%',
                                        background: theme.accent, color: '#000',
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 11, fontWeight: 800, flexShrink: 0,
                                    }}
                                >
                                    {initial}
                                </div>
                            </div>
                        </div>

                        {/* PREVIEW or DIFF */}
                        {compareOn && diff ? (
                            <>
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: isNarrow ? '1fr' : '1fr 1fr',
                                    background: theme.bg, borderBottom: `1px solid ${theme.border}`,
                                    fontSize: 10, fontWeight: 700,
                                }}>
                                    <div style={{
                                        padding: '6px 14px',
                                        borderRight: isNarrow ? 'none' : `1px solid ${theme.border}`,
                                        color: '#ef4444',
                                    }}>
                                        BASE · {selected ? new Date(selected.ts).toLocaleString() : ''}
                                    </div>
                                    {!isNarrow && (
                                        <div style={{ padding: '6px 14px', color: '#22c55e' }}>
                                            LATEST · {latest ? new Date(latest.ts).toLocaleString() : ''}
                                        </div>
                                    )}
                                    {isNarrow && (
                                        <div style={{ padding: '0 14px 6px', color: '#22c55e' }}>
                                            LATEST · {latest ? new Date(latest.ts).toLocaleString() : ''}
                                        </div>
                                    )}
                                </div>
                                {diff.truncated && (
                                    <div style={{
                                        padding: '6px 14px', fontSize: 10, color: theme.textMuted,
                                        background: theme.bg, borderBottom: `1px solid ${theme.border}`,
                                    }}>
                                        Diff truncated — file is too long for a precise line-up. Showing line-by-line.
                                    </div>
                                )}
                                <div style={{
                                    flex: 1, overflow: 'auto', background: theme.bg,
                                    color: theme.textMain, fontSize: 12,
                                    fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.55,
                                    WebkitOverflowScrolling: 'touch',
                                }}>
                                    {diff.ops.length === 0 ? (
                                        <div style={{ padding: '24px 14px', textAlign: 'center', color: theme.textMuted, fontSize: 12 }}>
                                            Walang pagbabago sa pagitan ng dalawang snapshot na ito.
                                        </div>
                                    ) : changesOnly && addCount === 0 && delCount === 0 ? (
                                        <div style={{ padding: '24px 14px', textAlign: 'center', color: theme.textMuted, fontSize: 12 }}>
                                            Walang pagbabago. I-off ang "Changes only" para makita ang buong file.
                                        </div>
                                    ) : (
                                        diffRows.map((row, idx) => {
                                            if (row.kind === 'gap') return renderGap(row.count, 'gap-' + idx);
                                            return isNarrow
                                                ? renderDiffRowUnified(row.op, idx)
                                                : renderDiffRowSplit(row.op, idx);
                                        })
                                    )}
                                </div>
                            </>
                        ) : compareOn && onLatest ? (
                            <div style={{
                                flex: 1, padding: '36px 20px', textAlign: 'center',
                                color: theme.textMuted, fontSize: 12, background: theme.bg,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                Naka-latest ka — i-slide o pindutin ang ◄ para makita ang diff vs older snapshot.
                            </div>
                        ) : (
                            <HistoryCodePreview
                                code={previewContent}
                                filePath={fileName}
                                theme={theme}
                                themeName={themeName}
                                isNarrow={isNarrow}
                            />
                        )}

                        {/* BOTTOM TOOLBAR */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                            padding: isNarrow ? '10px 12px' : '12px 16px',
                            borderTop: `1px solid ${theme.border}`,
                            background: theme.surface,
                        }}>
                            <label
                                title={entries.length < 2 ? 'Need at least 2 snapshots' : 'Compare this snapshot vs the latest'}
                                style={{
                                    ...toggleLabelStyle,
                                    background: compareOn ? theme.bg : 'transparent',
                                    opacity: entries.length < 2 ? 0.4 : 1,
                                    cursor: entries.length < 2 ? 'not-allowed' : 'pointer',
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={compareOn}
                                    onChange={e => setCompareOn(e.target.checked)}
                                    disabled={entries.length < 2}
                                    style={{ accentColor: theme.accent, margin: 0 }}
                                />
                                <span>Compare</span>
                            </label>
                            {compareOn && diff && (
                                <>
                                    <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 700 }}>+{addCount}</span>
                                    <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 700 }}>-{delCount}</span>
                                    <label style={{
                                        ...toggleLabelStyle,
                                        background: changesOnly ? theme.bg : 'transparent',
                                    }}>
                                        <input
                                            type="checkbox"
                                            checked={changesOnly}
                                            onChange={e => setChangesOnly(e.target.checked)}
                                            style={{ accentColor: theme.accent, margin: 0 }}
                                        />
                                        <span>Changes only</span>
                                    </label>
                                    <button
                                        onClick={() => { setAdvancedMerge(true); setBaseIdx(selectedIdx); setCompareIdx(0); }}
                                        title="Pick lines per hunk and restore a merged version"
                                        style={ghostBtn}
                                    >
                                        Advanced merge…
                                    </button>
                                </>
                            )}
                            <div style={{ flex: 1 }} />
                            <button onClick={onClose} style={ghostBtn}>Cancel</button>
                            <button
                                onClick={() => selected && onRestore(selected)}
                                disabled={isEmpty || onLatest}
                                title={onLatest ? 'Already viewing latest snapshot' : 'Restore this snapshot to the editor'}
                                style={{
                                    ...restoreBtnStyle(true),
                                    opacity: (isEmpty || onLatest) ? 0.55 : 1,
                                    cursor: (isEmpty || onLatest) ? 'not-allowed' : 'pointer',
                                    background: onLatest ? 'transparent' : theme.accent,
                                    color: onLatest ? theme.textMuted : '#000',
                                    border: onLatest ? `1px solid ${theme.border}` : 'none',
                                }}
                            >
                                <RotateCcw size={12} />
                                {onLatest ? 'Viewing latest' : 'Restore'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

interface MergeBodyProps {
    theme: any;
    isNarrow: boolean;
    entries: HistoryEntry[];
    baseIdx: number;
    setBaseIdx: (n: number) => void;
    compareIdx: number;
    setCompareIdx: (n: number) => void;
    snapshotLabel: (i: number) => string;
    addCount: number;
    delCount: number;
    diff: { ops: DiffOp[]; truncated: boolean } | null;
    hunkItems: HunkOrEq[];
    hunkCount: number;
    hunkChoices: Record<number, HunkChoice>;
    setHunkPick: (id: number, choice: HunkChoice) => void;
    setAllHunkPicks: (choice: HunkChoice) => void;
    resetHunkPicks: () => void;
    mergedContent: string;
    restoreMerged: () => void;
    addBg: string;
    delBg: string;
    fadedBg: string;
    gutterMuted: string;
    restoreBtnStyle: (primary: boolean) => React.CSSProperties;
}

const MergeBody: React.FC<MergeBodyProps> = ({
    theme, isNarrow, entries, baseIdx, setBaseIdx, compareIdx, setCompareIdx,
    snapshotLabel, addCount, delCount, diff, hunkItems, hunkCount,
    hunkChoices, setHunkPick, setAllHunkPicks, resetHunkPicks,
    mergedContent, restoreMerged,
    addBg, delBg, fadedBg, gutterMuted, restoreBtnStyle,
}) => {
    const [showPreview, setShowPreview] = useState(false);

    const choiceColor = (c: HunkChoice) =>
        c === 'base' ? '#ef4444' :
        c === 'compare' ? '#22c55e' :
        c === 'both' ? '#a855f7' :
        '#94a3b8'; // skip

    const pickerBtn = (active: boolean, color: string): React.CSSProperties => ({
        padding: '4px 9px',
        fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
        background: active ? color : 'transparent',
        color: active ? '#000' : theme.textMain,
        border: `1px solid ${active ? color : theme.border}`,
        borderRadius: 5, cursor: 'pointer',
    });

    const renderEqLine = (op: DiffOp, idx: number) => (
        <div key={'eq-' + idx} style={{
            display: 'grid', gridTemplateColumns: '18px 1fr',
            background: 'transparent', opacity: 0.65,
        }}>
            <span style={{ color: gutterMuted, textAlign: 'center', userSelect: 'none' }}> </span>
            <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', paddingRight: 8 }}>
                {op.left ?? ''}
            </span>
        </div>
    );

    const renderHunk = (h: Extract<HunkOrEq, { kind: 'hunk' }>) => {
        const choice = hunkChoices[h.id] ?? 'compare';
        const baseLines = h.dels.map(d => d.left ?? '');
        const cmpLines = h.adds.map(a => a.right ?? '');

        const sideBlock = (
            kind: 'base' | 'compare',
            lines: string[],
            chosen: boolean,
        ) => {
            const bg = kind === 'base' ? delBg : addBg;
            const sign = kind === 'base' ? '-' : '+';
            const dim = !chosen;
            return (
                <div style={{
                    background: lines.length === 0 ? fadedBg : bg,
                    opacity: dim ? 0.45 : 1,
                    minHeight: 22,
                    transition: 'opacity 0.12s',
                }}>
                    {lines.length === 0 ? (
                        <div style={{
                            padding: '4px 14px', fontSize: 10, fontStyle: 'italic',
                            color: theme.textMuted,
                        }}>
                            (no {kind === 'base' ? 'base' : 'compare'} lines)
                        </div>
                    ) : lines.map((ln, i) => (
                        <div key={i} style={{
                            display: 'grid', gridTemplateColumns: '18px 1fr',
                        }}>
                            <span style={{ color: gutterMuted, textAlign: 'center', userSelect: 'none' }}>{sign}</span>
                            <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', paddingRight: 8 }}>{ln}</span>
                        </div>
                    ))}
                </div>
            );
        };

        const useBase = choice === 'base' || choice === 'both';
        const useCmp = choice === 'compare' || choice === 'both';

        return (
            <div key={'hunk-' + h.id} style={{
                border: `1px solid ${theme.border}`,
                borderRadius: 6, margin: '8px 10px',
                overflow: 'hidden', background: theme.surface,
            }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                    padding: '6px 10px', background: theme.bg,
                    borderBottom: `1px solid ${theme.border}`,
                    fontSize: 10, fontWeight: 700, color: theme.textMuted,
                }}>
                    <span>HUNK #{h.id + 1}</span>
                    <span style={{ color: '#ef4444' }}>-{baseLines.length}</span>
                    <span style={{ color: '#22c55e' }}>+{cmpLines.length}</span>
                    <div style={{ flex: 1 }} />
                    <span style={{ color: choiceColor(choice), fontSize: 9 }}>
                        ▸ {choice.toUpperCase()}
                    </span>
                    <button onClick={() => setHunkPick(h.id, 'base')} style={pickerBtn(choice === 'base', '#ef4444')}>Use base</button>
                    <button onClick={() => setHunkPick(h.id, 'compare')} style={pickerBtn(choice === 'compare', '#22c55e')}>Use compare</button>
                    <button onClick={() => setHunkPick(h.id, 'both')} style={pickerBtn(choice === 'both', '#a855f7')}>Both</button>
                    <button onClick={() => setHunkPick(h.id, 'skip')} style={pickerBtn(choice === 'skip', '#94a3b8')}>Skip</button>
                </div>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: isNarrow ? '1fr' : '1fr 1fr',
                    fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
                    lineHeight: 1.55, color: theme.textMain,
                }}>
                    <div style={{
                        borderRight: isNarrow ? 'none' : `1px solid ${theme.border}`,
                        borderBottom: isNarrow ? `1px solid ${theme.border}` : 'none',
                    }}>
                        {sideBlock('base', baseLines, useBase)}
                    </div>
                    <div>
                        {sideBlock('compare', cmpLines, useCmp)}
                    </div>
                </div>
            </div>
        );
    };

    const samePair = baseIdx === compareIdx;
    const noChanges = !samePair && diff && diff.ops.length === 0;
    const noHunks = !samePair && hunkCount === 0;

    return (
        <div style={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column' }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                padding: '10px 14px', borderBottom: `1px solid ${theme.border}`,
                fontSize: 11, color: theme.textMuted,
            }}>
                <label style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    flex: isNarrow ? '1 1 100%' : '0 0 auto',
                }}>
                    <span style={{ fontWeight: 700, color: '#ef4444', minWidth: 50 }}>BASE</span>
                    <select
                        value={baseIdx}
                        onChange={e => setBaseIdx(Number(e.target.value))}
                        style={{
                            flex: 1,
                            background: theme.bg, color: theme.textMain,
                            border: `1px solid ${theme.border}`, borderRadius: 6,
                            padding: '6px 8px', fontSize: 11,
                            maxWidth: isNarrow ? '100%' : 280,
                        }}
                    >
                        {entries.map((_, i) => (
                            <option key={i} value={i}>{snapshotLabel(i)}</option>
                        ))}
                    </select>
                </label>
                <label style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    flex: isNarrow ? '1 1 100%' : '0 0 auto',
                }}>
                    <span style={{ fontWeight: 700, color: '#22c55e', minWidth: 50 }}>COMPARE</span>
                    <select
                        value={compareIdx}
                        onChange={e => setCompareIdx(Number(e.target.value))}
                        style={{
                            flex: 1,
                            background: theme.bg, color: theme.textMain,
                            border: `1px solid ${theme.border}`, borderRadius: 6,
                            padding: '6px 8px', fontSize: 11,
                            maxWidth: isNarrow ? '100%' : 280,
                        }}
                    >
                        {entries.map((_, i) => (
                            <option key={i} value={i}>{snapshotLabel(i)}</option>
                        ))}
                    </select>
                </label>
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    flexWrap: 'wrap',
                    flex: isNarrow ? '1 1 100%' : undefined,
                }}>
                    <span style={{ color: '#22c55e', fontWeight: 700 }}>+{addCount}</span>
                    <span style={{ color: '#ef4444', fontWeight: 700 }}>-{delCount}</span>
                    <span style={{ color: theme.textMuted }}>· {hunkCount} hunk{hunkCount === 1 ? '' : 's'}</span>
                    <button
                        onClick={() => setAllHunkPicks('base')}
                        disabled={hunkCount === 0}
                        title="Use BASE for every hunk"
                        style={pickerBtn(false, '#ef4444')}
                    >All base</button>
                    <button
                        onClick={() => setAllHunkPicks('compare')}
                        disabled={hunkCount === 0}
                        title="Use COMPARE for every hunk"
                        style={pickerBtn(false, '#22c55e')}
                    >All compare</button>
                    <button
                        onClick={resetHunkPicks}
                        disabled={Object.keys(hunkChoices).length === 0}
                        style={{
                            padding: '6px 10px', background: 'transparent',
                            color: theme.textMain, border: `1px solid ${theme.border}`,
                            borderRadius: 6,
                            cursor: Object.keys(hunkChoices).length === 0 ? 'not-allowed' : 'pointer',
                            opacity: Object.keys(hunkChoices).length === 0 ? 0.4 : 1,
                            fontSize: 11, fontWeight: 600,
                        }}
                    >Reset picks</button>
                    <button
                        onClick={() => setShowPreview(s => !s)}
                        disabled={hunkCount === 0}
                        style={{
                            padding: '6px 10px', background: showPreview ? theme.bg : 'transparent',
                            color: theme.textMain, border: `1px solid ${theme.border}`,
                            borderRadius: 6,
                            cursor: hunkCount === 0 ? 'not-allowed' : 'pointer',
                            opacity: hunkCount === 0 ? 0.4 : 1,
                            fontSize: 11, fontWeight: 600,
                        }}
                    >{showPreview ? 'Hide preview' : 'Preview merged'}</button>
                    {!isNarrow && <div style={{ flex: 1 }} />}
                    <button
                        onClick={restoreMerged}
                        disabled={hunkCount === 0 || samePair}
                        title="Save the merged result as the editor's current content"
                        style={{
                            ...restoreBtnStyle(true),
                            opacity: (hunkCount === 0 || samePair) ? 0.4 : 1,
                            cursor: (hunkCount === 0 || samePair) ? 'not-allowed' : 'pointer',
                        }}
                    >
                        <RotateCcw size={12} /> Restore merged
                    </button>
                </div>
            </div>
            {diff?.truncated && (
                <div style={{
                    padding: '6px 14px', fontSize: 10, color: theme.textMuted,
                    background: theme.bg, borderBottom: `1px solid ${theme.border}`,
                }}>
                    Diff truncated — file is too long for a precise line-up. Hunks may be coarser.
                </div>
            )}
            <div style={{
                flex: 1, overflow: 'auto', background: theme.bg,
                color: theme.textMain, fontSize: 12,
                fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.55,
                WebkitOverflowScrolling: 'touch',
            }}>
                {samePair ? (
                    <div style={{ padding: '24px 14px', textAlign: 'center', color: theme.textMuted, fontSize: 12 }}>
                        Pareho ang base at compare snapshot. Pumili ng ibang version para makapag-merge.
                    </div>
                ) : noChanges || noHunks ? (
                    <div style={{ padding: '24px 14px', textAlign: 'center', color: theme.textMuted, fontSize: 12 }}>
                        Walang hunks na ipi-pick — pareho ang nilalaman ng dalawang snapshot.
                    </div>
                ) : showPreview ? (
                    <pre style={{
                        margin: 0, padding: 14, whiteSpace: isNarrow ? 'pre-wrap' : 'pre',
                        wordBreak: isNarrow ? 'break-word' : 'normal', tabSize: 4,
                    }}>
                        {mergedContent}
                    </pre>
                ) : (
                    hunkItems.map((it, idx) =>
                        it.kind === 'eq' ? renderEqLine(it.op, idx) : renderHunk(it)
                    )
                )}
            </div>
        </div>
    );
};

/**
 * Syntax-highlighted code preview used inside the history modal.
 * Reuses the editor's existing Prism grammar registry + theme palette
 * so the colors track whichever theme the user picked in Settings.
 */
function HistoryCodePreview({
    code, filePath, theme, themeName, isNarrow,
}: {
    code: string;
    filePath: string;
    theme: any;
    themeName: string;
    isNarrow: boolean;
}) {
    const lang = langForFile(filePath || '');
    const grammar = (Prism.languages as any)[lang] || Prism.languages.markup;
    let html = '';
    try {
        html = Prism.highlight(code, grammar, lang);
    } catch {
        // Fallback: escape and show plain — better than crashing the modal.
        html = code
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
    // The flat THEMES map in coding.tsx doesn't carry a syntax palette,
    // so resolve the proper SyntaxPalette via ALL_THEMES by id, with a
    // safe fallback so the modal never crashes mid-render.
    const themed = ALL_THEMES.find(t => t.id === themeName) ?? ALL_THEMES[0];
    const syntax = themed.syntax;
    const css = buildPrismCss({ syntax, text: theme?.textMain || themed.text });
    return (
        <div className="sce-wrap" style={{
            flex: 1, overflow: 'auto', background: theme.bg, minHeight: 0,
        }}>
            <style>{css}</style>
            <pre style={{
                margin: 0, padding: 14,
                background: theme.bg, color: theme.textMain,
                fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
                whiteSpace: isNarrow ? 'pre-wrap' : 'pre',
                wordBreak: isNarrow ? 'break-word' : 'normal',
                tabSize: 4,
            }}>
                <code
                    className={`language-${lang}`}
                    dangerouslySetInnerHTML={{ __html: html }}
                />
            </pre>
        </div>
    );
}

export default CodingPage;
