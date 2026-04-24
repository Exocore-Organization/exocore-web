import React from 'react';
import {
    FilePlus, FileMinus, CheckCircle2, Terminal, Sparkles, Cpu, Loader2,
    ChevronDown, ChevronRight, Webhook, Image as ImageIcon, ExternalLink, Wrench,
    HelpCircle,
} from 'lucide-react';
import type { Message, AgentAction } from './types';

interface ChatMessageProps {
    msg: Message;
    onToggleActionOutput: (msgId: string, actionIndex: number) => void;
    onOpenFile?: (filePath: string) => void;
    onConfirmOverwrite?: (msgId: string, actionIndex: number, accept: boolean) => void;
}

function actionIcon(a: AgentAction) {
    if (a.type === 'terminal') return <Terminal size={14} color="#bd93f9" />;
    if (a.type === 'file_delete') return <FileMinus size={14} color="#ff6b6b" />;
    if (a.type === 'file_edit') return <Wrench size={14} color="#fbbf24" />;
    return <FilePlus size={14} color="#58a6ff" />;
}

/* Turn a raw shell command into a friendly humanized title.
 * Examples:
 *   "npm i lodash"        -> "Installing package"
 *   "npm run build"       -> "Building project"
 *   "node index.js"       -> "Running script"
 *   "ls -la"              -> "Listing files"
 *   "mkdir src"           -> "Creating folder"
 *   "tsc --init"          -> "Setting up TypeScript"
 * Falls back to a generic "Running command" so the user always sees a label. */
function commandTitle(cmd: string): string {
    const c = cmd.trim().toLowerCase();
    if (/^(npm|pnpm|yarn)\s+(i|install|add)\b/.test(c)) return 'Installing package';
    if (/^(npm|pnpm|yarn)\s+run\s+build\b/.test(c) || /^tsc(\s|$)/.test(c)) return 'Building project';
    if (/^(npm|pnpm|yarn)\s+run\s+dev\b/.test(c) || /\bnodemon\b/.test(c)) return 'Starting dev server';
    if (/^(npm|pnpm|yarn)\s+run\s+test\b/.test(c) || /^jest(\s|$)/.test(c) || /^vitest(\s|$)/.test(c)) return 'Running tests';
    if (/^(npm|pnpm|yarn)\s+(start|run\s+start)\b/.test(c)) return 'Starting app';
    if (/^(npm|pnpm|yarn)\s+(init|create)\b/.test(c)) return 'Initializing project';
    if (/^(npm|pnpm|yarn)\s+(uninstall|remove|rm)\b/.test(c)) return 'Removing package';
    if (/^(npm|pnpm|yarn)\b/.test(c)) return 'Running package manager';
    if (/^pip\s+install\b/.test(c)) return 'Installing Python package';
    if (/^pip\b/.test(c)) return 'Running pip';
    if (/^node\b/.test(c)) return 'Running script';
    if (/^python\b/.test(c)) return 'Running Python script';
    if (/^git\b/.test(c)) return 'Running git';
    if (/^mkdir\b/.test(c)) return 'Creating folder';
    if (/^rm\b/.test(c)) return 'Removing file';
    if (/^touch\b/.test(c)) return 'Creating file';
    if (/^(ls|dir)\b/.test(c)) return 'Listing files';
    if (/^find\b/.test(c)) return 'Searching files';
    if (/^cat\b/.test(c)) return 'Reading file';
    if (/^cd\b/.test(c)) return 'Changing directory';
    if (/^echo\b/.test(c)) return 'Printing message';
    if (/^pwd\b/.test(c)) return 'Showing path';
    if (/^grep\b/.test(c)) return 'Searching contents';
    return 'Running command';
}

function actionTitle(a: AgentAction): string {
    if (a.type === 'terminal') return commandTitle(a.target);
    if (a.type === 'file_delete') return `Deleting ${a.target}`;
    if (a.type === 'file_edit') return `Editing ${a.target}`;
    return `Writing ${a.target}`;
}

/* Render a tiny unified-diff view for a `file_edit` action. We split the
 * old/new texts on lines and prefix removals with `-`, additions with `+`,
 * so the user sees only the changed slice instead of a wall of code. */
function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
    const oldLines = (oldText || '').split('\n');
    const newLines = (newText || '').split('\n');
    return (
        <div className="diff-view">
            {oldLines.map((l, i) => (
                <div key={`o-${i}`} className="diff-line del">
                    <span className="diff-marker">-</span>
                    <span className="diff-text">{l || ' '}</span>
                </div>
            ))}
            {newLines.map((l, i) => (
                <div key={`n-${i}`} className="diff-line add">
                    <span className="diff-marker">+</span>
                    <span className="diff-text">{l || ' '}</span>
                </div>
            ))}
        </div>
    );
}

function actionStatusIcon(a: AgentAction) {
    if (a.status === 'pending' || a.status === 'executing') return <Loader2 size={13} className="spin" color="#bd93f9" />;
    if (a.status === 'failed') return <span className="del-badge">Failed</span>;
    if (a.status === 'awaiting_confirm') return <HelpCircle size={13} color="#ffb86c" />;
    if (a.status === 'skipped') return <span className="del-badge" style={{ background: 'rgba(150,150,150,0.15)', color: '#aaa', borderColor: 'rgba(150,150,150,0.3)' }}>Skipped</span>;
    return <CheckCircle2 size={13} color="#00e676" />;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ msg, onToggleActionOutput, onOpenFile, onConfirmOverwrite }) => (
    <div className={`chat-bubble-wrapper ${msg.role}`}>
        {msg.role === 'ai' && (
            <div className={`avatar ai ${msg.provider}`}>
                {msg.provider === 'exocore' ? <Cpu size={14}/> : msg.provider === 'rest' ? <Webhook size={14}/> : <Sparkles size={14}/>}
            </div>
        )}
        <div className={`chat-bubble ${msg.provider || ''}`}>
            {msg.role === 'user' && <div className="text-content">{msg.text}</div>}
            {msg.role === 'ai' && msg.text && <div className="text-content ai-text">{msg.text}</div>}
            {msg.role === 'ai' && msg.isGenerating && !msg.text && (
                <div className="text-content ai-text loading-text">
                    <Loader2 size={12} className="spin" /> {msg.kind === 'image' ? 'Generating images…' : msg.kind === 'agent' ? 'Planning multi-step actions…' : 'Thinking…'}
                </div>
            )}

            {msg.role === 'ai' && msg.images && msg.images.length > 0 && (
                <div className="generated-image-grid">
                    {msg.images.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noreferrer" className="img-tile">
                            <img src={url} alt={`generated-${i}`} loading="lazy" />
                            <span className="img-badge"><ImageIcon size={10} /> #{i + 1}</span>
                        </a>
                    ))}
                </div>
            )}

            {msg.role === 'ai' && msg.steps && msg.steps.length > 0 && (
                <div className="agent-steps">
                    {msg.steps.map((step, idx) => (
                        <div key={idx} className="agent-step-line">
                            <Wrench size={11} /> <span>{step}</span>
                        </div>
                    ))}
                </div>
            )}

            {msg.role === 'ai' && msg.actions && msg.actions.length > 0 && (
                <div className="agent-action-list">
                    {msg.actions.map((action, idx) => {
                        const expandable = action.type === 'terminal' || (action.type === 'file_create' && !!action.content);
                        const canOpen = action.type === 'file_create' && !!onOpenFile;
                        return (
                            <div key={idx} className={`agent-action-card ${action.status}`}>
                                <div
                                    className="agent-action-head"
                                    onClick={() => (expandable || action.type === 'file_edit') && onToggleActionOutput(msg.id, idx)}
                                    style={{ cursor: (expandable || action.type === 'file_edit') ? 'pointer' : 'default' }}
                                >
                                    <div className="head-left">
                                        <span className="head-icon">{actionIcon(action)}</span>
                                        <span className="head-title">{actionTitle(action)}</span>
                                    </div>
                                    <div className="head-right">
                                        {canOpen && (
                                            <button
                                                className="open-file-btn"
                                                onClick={(e) => { e.stopPropagation(); onOpenFile!(action.target); }}
                                                title="Open in editor"
                                            >
                                                Open <ExternalLink size={11} />
                                            </button>
                                        )}
                                        <span className="head-status">{actionStatusIcon(action)}</span>
                                        {expandable && (
                                            <span className="chevron">
                                                {action.showOutput ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {action.type === 'terminal' && (
                                    <div className="agent-action-cmdline">
                                        <span className="cmd-label">cmd:</span>
                                        <code>{action.target}</code>
                                    </div>
                                )}

                                {action.type === 'file_edit' && (action.oldText || action.newText) && (
                                    <div className="agent-action-body file-preview custom-scrollbar">
                                        <DiffView oldText={action.oldText || ''} newText={action.newText || ''} />
                                    </div>
                                )}

                                {action.status === 'awaiting_confirm' && action.type === 'file_create' && (
                                    <div className="agent-confirm-box">
                                        <div className="confirm-msg">
                                            <strong>{action.target}</strong> already has content. Overwrite it?
                                        </div>
                                        <div className="confirm-actions">
                                            <button
                                                className="confirm-btn yes"
                                                onClick={(e) => { e.stopPropagation(); onConfirmOverwrite?.(msg.id, idx, true); }}
                                            >Yes, overwrite</button>
                                            <button
                                                className="confirm-btn no"
                                                onClick={(e) => { e.stopPropagation(); onConfirmOverwrite?.(msg.id, idx, false); }}
                                            >Keep current</button>
                                        </div>
                                    </div>
                                )}

                                {action.showOutput && action.type === 'terminal' && (
                                    <div className="agent-action-body terminal-out custom-scrollbar">
                                        <div className="logs-divider">logs ────</div>
                                        <pre>{action.output || (action.status === 'executing' ? 'Executing…' : '(no output)')}</pre>
                                    </div>
                                )}
                                {action.showOutput && action.type === 'file_create' && action.content && (
                                    <div className="agent-action-body file-preview custom-scrollbar">
                                        <pre>{action.content.slice(0, 4000)}{action.content.length > 4000 ? '\n…(truncated)' : ''}</pre>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    </div>
);
