import React, { useState } from 'react';
import { RotateCw, ExternalLink, X, Globe, ShieldCheck, Monitor, Wifi, Loader } from 'lucide-react';
import type { EditorTheme } from '../editor/types';

interface WebviewProps {
    url: string | null;
    tunnelUrl?: string | null;
    theme: EditorTheme;
    onClose: () => void;
}

type ViewMode = 'local' | 'public';

export const Webview: React.FC<WebviewProps> = ({ url, tunnelUrl, theme, onClose }) => {
    const [key, setKey] = useState(0);
    const [mode, setMode] = useState<ViewMode>('local');

    const activeUrl = mode === 'local' ? url : tunnelUrl;
    const serverRunning = !!url;
    const tunnelReady = !!tunnelUrl;
    const tunnelConnecting = serverRunning && !tunnelReady && mode === 'public';

    const handleReload = () => setKey(prev => prev + 1);
    const handleOpenExternal = () => {
        if (activeUrl) window.open(activeUrl, '_blank');
    };

    const handleSetMode = (m: ViewMode) => {
        setMode(m);
        setKey(prev => prev + 1);
    };

    const btnBase: React.CSSProperties = {
        padding: '4px 10px',
        borderRadius: '5px',
        border: 'none',
        fontSize: '11px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        fontWeight: 500,
        transition: 'all 0.15s ease',
    };

    const activeBtn: React.CSSProperties = {
        ...btnBase,
        background: theme.accent,
        color: '#fff',
        boxShadow: `0 0 8px ${theme.accent}55`,
    };

    const inactiveBtn: React.CSSProperties = {
        ...btnBase,
        background: 'rgba(255,255,255,0.06)',
        color: theme.textMuted,
        cursor: 'pointer',
    };

    const disabledBtn: React.CSSProperties = {
        ...btnBase,
        background: 'rgba(255,255,255,0.03)',
        color: 'rgba(255,255,255,0.2)',
        cursor: 'not-allowed',
    };

    const urlBarText = () => {
        if (mode === 'local') return activeUrl || 'Waiting for server...';
        if (tunnelConnecting) return 'Connecting Cloudflare tunnel...';
        if (!tunnelReady) return 'No tunnel available';
        return activeUrl || '';
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: theme.bg, borderLeft: `1px solid ${theme.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: theme.surface, borderBottom: `1px solid ${theme.border}` }}>
                <Globe size={14} color={theme.accent} />

                <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                        style={mode === 'local' ? activeBtn : inactiveBtn}
                        onClick={() => handleSetMode('local')}
                        title="Local preview"
                        aria-label="Switch to local preview"
                    >
                        <Monitor size={11} />
                        Local
                    </button>
                    <button
                        style={
                            mode === 'public'
                                ? activeBtn
                                : !serverRunning
                                    ? disabledBtn
                                    : inactiveBtn
                        }
                        onClick={() => serverRunning && handleSetMode('public')}
                        title={!serverRunning ? 'Start the server first' : tunnelReady ? 'Cloudflare public URL' : 'Connecting tunnel...'}
                        aria-label="Switch to public (Cloudflare) preview"
                        disabled={!serverRunning}
                    >
                        {tunnelConnecting
                            ? <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} />
                            : <Wifi size={11} />
                        }
                        {tunnelConnecting ? 'Connecting...' : 'Cloudflare'}
                    </button>
                </div>

                <div
                    className="notranslate"
                    translate="no"
                    style={{
                        flex: 1,
                        fontSize: '11px',
                        color: tunnelConnecting ? '#f1fa8c' : theme.textMuted,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        background: 'rgba(0,0,0,0.2)',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontStyle: tunnelConnecting ? 'italic' : 'normal',
                    }}
                >
                    {urlBarText()}
                </div>

                <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={handleReload} className="wv-btn" title="Reload"><RotateCw size={14} /></button>
                    <button onClick={handleOpenExternal} className="wv-btn" title="Open in new tab" disabled={!activeUrl}><ExternalLink size={14} /></button>
                    <button onClick={onClose} className="wv-btn" style={{ marginLeft: '4px' }} title="Close"><X size={14} /></button>
                </div>
            </div>

            <div style={{ flex: 1, position: 'relative', background: '#fff' }}>
                {activeUrl ? (
                    <iframe
                        key={`${mode}-${key}`}
                        src={activeUrl}
                        style={{ width: '100%', height: '100%', border: 'none' }}
                        title="Exocore Preview"
                        sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-presentation allow-same-origin allow-scripts"
                    />
                ) : (
                    <div style={{
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#888',
                        background: theme.bg,
                        gap: '12px',
                    }}>
                        {tunnelConnecting ? (
                            <>
                                <Loader size={36} style={{ opacity: 0.3, animation: 'spin 1s linear infinite' }} />
                                <p style={{ fontSize: '13px', margin: 0 }}>Connecting Cloudflare tunnel...</p>
                                <p style={{ fontSize: '11px', opacity: 0.5, margin: 0 }}>This may take a few seconds.</p>
                            </>
                        ) : mode === 'local' ? (
                            <>
                                <ShieldCheck size={48} style={{ opacity: 0.2 }} />
                                <p style={{ fontSize: '13px', margin: 0 }}>Server is not running.</p>
                                <p style={{ fontSize: '11px', opacity: 0.5, margin: 0 }}>
                                    Run <span className="notranslate" translate="no" style={{ color: theme.accent, fontWeight: 'bold' }}>"npm start"</span> in the console to begin.
                                </p>
                            </>
                        ) : (
                            <>
                                <ShieldCheck size={48} style={{ opacity: 0.2 }} />
                                <p style={{ fontSize: '13px', margin: 0 }}>No Cloudflare tunnel available.</p>
                                <p style={{ fontSize: '11px', opacity: 0.5, margin: 0 }}>
                                    Tunnel establishes automatically when your server starts.
                                </p>
                            </>
                        )}
                    </div>
                )}
            </div>

            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                .wv-btn {
                    background: none;
                    border: none;
                    color: ${theme.textMuted};
                    cursor: pointer;
                    padding: 4px;
                    border-radius: 4px;
                    transition: 0.15s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .wv-btn:hover {
                    background: rgba(255,255,255,0.05);
                    color: ${theme.textMain};
                }
                .wv-btn:disabled {
                    opacity: 0.3;
                    cursor: not-allowed;
                }
            `}</style>
        </div>
    );
};
