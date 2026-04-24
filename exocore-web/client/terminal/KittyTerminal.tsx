import React, { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { AttachAddon } from '@xterm/addon-attach';
import { muxCarrier } from '../access/wsMux';
import { useSearchParams } from 'react-router-dom';
import {
    ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
    ZoomIn, ZoomOut, RotateCw, Send
} from 'lucide-react';
import 'xterm/css/xterm.css';

interface KittyTerminalProps {
    theme: any;
    onClose: () => void;
}

const isMobileDevice = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth <= 768;

export const KittyTerminal: React.FC<KittyTerminalProps> = ({ theme }) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const termInstance = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const socketRef = useRef<WebSocket | null>(null);
    const [searchParams] = useSearchParams();
    const projectId = searchParams.get('project');
    // One-shot: when the editor was opened with ?autoinstall=1, the terminal
    // pty should automatically chmod + bash the project's install.sh as soon
    // as the WebSocket connects. We use a ref-guard so React StrictMode's
    // double-mount in dev doesn't fire the install command twice.
    const autoInstallPending = useRef(searchParams.get('autoinstall') === '1');
    const [isMobile] = useState(isMobileDevice);
    const [fontSize, setFontSize] = useState(isMobileDevice() ? 15 : 13);
    const [connected, setConnected] = useState(false);

    // Mobile stable input bar
    const [mobileCmd, setMobileCmd] = useState('');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_cmdHistory, setCmdHistory] = useState<string[]>([]);
    const [historyIdx, setHistoryIdx] = useState(-1);
    const mobileCmdRef = useRef<HTMLInputElement>(null);

    const pinchRef = useRef({ active: false, startDist: 0, startSize: 13 });

    const changeFontSize = useCallback((newSize: number) => {
        const clamped = Math.max(8, Math.min(32, newSize));
        setFontSize(clamped);
        if (termInstance.current) {
            termInstance.current.options.fontSize = clamped;
            fitAddonRef.current?.fit();
        }
    }, []);

    const [username, setUsername] = useState<string>('');
    useEffect(() => {
        const tok = localStorage.getItem('exo_token');
        if (!tok) return;
        (async () => {
            try {
                const { rpc } = await import('../access/rpcClient');
                const r = await rpc.call<any>('auth.userinfo.get', { source: 'pv', token: tok });
                const u = r?.data?.username || r?.username || r?.data?.user || r?.user;
                if (u) setUsername(String(u));
            } catch {}
        })();
    }, []);

    useEffect(() => {
        if (!terminalRef.current || !projectId || !username) return;

        const term = new Terminal({
            theme: {
                background: 'transparent',
                foreground: theme.textMain || '#f8f8f2',
                cursor: theme.accent || '#00a1ff',
                cursorAccent: theme.bg || '#000',
                selectionBackground: 'rgba(255, 255, 255, 0.25)',
                black: '#21222c',
                red: '#ff5555',
                green: '#50fa7b',
                yellow: '#f1fa8c',
                blue: '#bd93f9',
                magenta: '#ff79c6',
                cyan: '#8be9fd',
                white: '#f8f8f2',
                brightBlack: '#6272a4',
                brightRed: '#ff6e6e',
                brightGreen: '#69ff94',
                brightYellow: '#ffffa5',
                brightBlue: '#d6acff',
                brightMagenta: '#ff92df',
                brightCyan: '#a4ffff',
                brightWhite: '#ffffff',
            },
            fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace",
            fontSize: fontSize,
            lineHeight: 1.35,
            letterSpacing: 0.5,
            cursorBlink: true,
            cursorStyle: 'block',
            convertEol: true,
            scrollback: 5000,
            allowProposedApi: true,
            macOptionIsMeta: true,
            rightClickSelectsWord: true,
            smoothScrollDuration: 80,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);

        setTimeout(() => fitAddon.fit(), 50);

        termInstance.current = term;
        fitAddonRef.current = fitAddon;

        const wsPath = `/exocore/terminal?projectId=${projectId}&user=${encodeURIComponent(username)}`;
        const socket = muxCarrier.openChannelInstance("terminal", wsPath) as unknown as WebSocket;
        socketRef.current = socket;

        socket.onopen = () => {
            const attachAddon = new AttachAddon(socket);
            term.loadAddon(attachAddon);
            term.focus();
            setConnected(true);

            // Auto-run the project's install.sh once on first connect when
            // navigating in from the "Create from template" flow.
            if (autoInstallPending.current) {
                autoInstallPending.current = false;
                // Give the shell a beat to print its prompt before we type.
                setTimeout(() => {
                    if (socket.readyState !== WebSocket.OPEN) return;
                    socket.send('clear && [ -f install.sh ] && chmod +x install.sh && bash install.sh\r');
                }, 600);
            }
        };

        socket.onclose = () => setConnected(false);
        socket.onerror = () => setConnected(false);

        const handleResize = () => {
            requestAnimationFrame(() => fitAddon.fit());
        };

        window.addEventListener('resize', handleResize);

        const resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(() => fitAddon.fit());
        });

        if (terminalRef.current) resizeObserver.observe(terminalRef.current);

        return () => {
            window.removeEventListener('resize', handleResize);
            resizeObserver.disconnect();
            if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
                socket.close();
            }
            term.dispose();
            termInstance.current = null;
            fitAddonRef.current = null;
        };
    }, [projectId, theme, username]);

    useEffect(() => {
        if (termInstance.current) {
            termInstance.current.options.fontSize = fontSize;
            fitAddonRef.current?.fit();
        }
    }, [fontSize]);

    // Mobile input bar execute — send straight to the pty so the shell actually runs it.
    // (xterm's t.paste uses bracketed-paste mode which shells refuse to auto-execute,
    // and t.write only updates the display, not the underlying process.)
    const executeCmd = useCallback(() => {
        const cmd = mobileCmd.trim();
        if (!cmd) return;
        const sock = socketRef.current;
        if (!sock || sock.readyState !== WebSocket.OPEN) return;
        sock.send(cmd + '\r');
        setCmdHistory(prev => [cmd, ...prev.slice(0, 49)]);
        setHistoryIdx(-1);
        setMobileCmd('');
        mobileCmdRef.current?.focus();
    }, [mobileCmd]);

    const navHistory = useCallback((dir: 'up' | 'down') => {
        setCmdHistory(hist => {
            const newIdx = dir === 'up'
                ? Math.min(historyIdx + 1, hist.length - 1)
                : Math.max(historyIdx - 1, -1);
            setHistoryIdx(newIdx);
            setMobileCmd(newIdx >= 0 ? hist[newIdx] : '');
            return hist;
        });
    }, [historyIdx]);

    const sendKey = (key: string) => {
        const t = termInstance.current;
        const sock = socketRef.current;
        if (!t || !sock || sock.readyState !== WebSocket.OPEN) return;
        const map: Record<string, string> = {
            'ctrl-c': '\x03',
            'ctrl-z': '\x1a',
            'ctrl-d': '\x04',
            'tab':    '\t',
            'up':     '\x1b[A',
            'down':   '\x1b[B',
            'left':   '\x1b[D',
            'right':  '\x1b[C',
            'esc':    '\x1b',
            'home':   '\x1b[H',
            'end':    '\x1b[F',
        };
        const seq = map[key];
        if (seq) sock.send(seq);
        t.focus();
    };

    const handleWrapperTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            pinchRef.current = { active: true, startDist: dist, startSize: fontSize };
            e.preventDefault();
        }
    };

    const handleWrapperTouchMove = (e: React.TouchEvent) => {
        const p = pinchRef.current;
        if (!p.active || e.touches.length !== 2) return;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const scale = dist / p.startDist;
        const newSize = Math.round(p.startSize * scale);
        changeFontSize(newSize);
        e.preventDefault();
    };

    const handleWrapperTouchEnd = (e: React.TouchEvent) => {
        if (e.touches.length < 2) {
            pinchRef.current.active = false;
        }
    };

    const reconnect = () => {
        if (socketRef.current) {
            socketRef.current.close();
        }
        if (termInstance.current) termInstance.current.clear();
    };

    return (
        <div
            className={`kitty-wrapper ${isMobile ? 'mobile-mode' : ''}`}
            style={{ background: 'transparent' }}
            onTouchStart={handleWrapperTouchStart}
            onTouchMove={handleWrapperTouchMove}
            onTouchEnd={handleWrapperTouchEnd}
        >
            <div className="terminal-header" style={{ borderBottom: `1px solid ${theme.border}` }}>
                <div className="btn-group">
                    <button onClick={() => changeFontSize(fontSize + 1)} title="Zoom In" className="term-btn">
                        <ZoomIn size={15} />
                    </button>
                    <span className="font-indicator">{fontSize}px</span>
                    <button onClick={() => changeFontSize(fontSize - 1)} title="Zoom Out" className="term-btn">
                        <ZoomOut size={15} />
                    </button>
                    <div className="status-dot" style={{ background: connected ? '#50fa7b' : '#ff5555' }} title={connected ? 'Connected' : 'Disconnected'} />
                </div>

                {isMobile && (
                    <div className="special-keys">
                        <button onClick={() => sendKey('esc')}    className="key-btn">ESC</button>
                        <button onClick={() => sendKey('tab')}    className="key-btn">TAB</button>
                        <button onClick={() => sendKey('ctrl-c')} className="key-btn ctrl-btn">C-C</button>
                        <button onClick={() => sendKey('ctrl-d')} className="key-btn">C-D</button>
                        <button onClick={() => navHistory('up')}  className="key-btn arrow-btn"><ChevronUp size={12} /></button>
                        <button onClick={() => navHistory('down')} className="key-btn arrow-btn"><ChevronDown size={12} /></button>
                        <button onClick={() => sendKey('left')}   className="key-btn arrow-btn"><ChevronLeft size={12} /></button>
                        <button onClick={() => sendKey('right')}  className="key-btn arrow-btn"><ChevronRight size={12} /></button>
                    </div>
                )}

                <button onClick={reconnect} className="term-btn" title="Reconnect" style={{ marginLeft: 'auto' }}>
                    <RotateCw size={14} />
                </button>
            </div>

            {/* Mobile stable command input bar */}
            {isMobile && (
                <div className="mobile-input-bar">
                    <input
                        ref={mobileCmdRef}
                        className="mobile-cmd-input"
                        type="text"
                        value={mobileCmd}
                        onChange={e => setMobileCmd(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); executeCmd(); }
                            if (e.key === 'ArrowUp') { e.preventDefault(); navHistory('up'); }
                            if (e.key === 'ArrowDown') { e.preventDefault(); navHistory('down'); }
                        }}
                        placeholder="Type command here → press ▶ to run"
                        autoCapitalize="none"
                        autoCorrect="off"
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <button
                        className="mobile-cmd-send"
                        onClick={executeCmd}
                        disabled={!mobileCmd.trim()}
                    >
                        <Send size={15} />
                    </button>
                </div>
            )}

            <div ref={terminalRef} className="xterm-container" />

            <style>{`
                .kitty-wrapper {
                    display: flex;
                    flex-direction: column;
                    width: 100%;
                    height: 100%;
                    overflow: hidden;
                    touch-action: pan-y;
                }

                .terminal-header {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 5px 10px;
                    background: rgba(0,0,0,0.15);
                    flex-shrink: 0;
                    flex-wrap: wrap;
                    min-height: 38px;
                }

                .btn-group {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .term-btn {
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.1);
                    color: rgba(255,255,255,0.7);
                    padding: 4px 7px;
                    border-radius: 5px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    transition: 0.15s;
                    font-size: 11px;
                }
                .term-btn:hover { background: rgba(255,255,255,0.12); color: #fff; }
                .term-btn:active { background: #00a1ff; color: #fff; }

                .font-indicator {
                    font-size: 10px;
                    color: rgba(255,255,255,0.4);
                    font-family: monospace;
                    min-width: 28px;
                    text-align: center;
                }

                .status-dot {
                    width: 7px;
                    height: 7px;
                    border-radius: 50%;
                    flex-shrink: 0;
                }

                .special-keys {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    flex-wrap: wrap;
                }

                .key-btn {
                    background: rgba(255,255,255,0.08);
                    border: 1px solid rgba(255,255,255,0.15);
                    color: rgba(255,255,255,0.85);
                    font-size: 10px;
                    font-weight: 700;
                    padding: 6px 10px;
                    border-radius: 5px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 36px;
                    min-height: 32px;
                    touch-action: manipulation;
                    -webkit-tap-highlight-color: transparent;
                    user-select: none;
                }
                .key-btn:active { background: #00a1ff !important; color: #fff !important; transform: scale(0.93); }

                .ctrl-btn { color: #ff5555 !important; border-color: rgba(255,85,85,0.3) !important; }

                .arrow-cluster { display: flex; flex-direction: column; align-items: center; gap: 2px; }
                .arrow-btn { padding: 4px 6px; min-width: 30px; min-height: 28px; }

                .xterm-container {
                    flex: 1;
                    padding: 4px 6px;
                    overflow: hidden;
                    min-height: 0;
                }

                .xterm-container .xterm {
                    height: 100%;
                }

                /* Mobile input bar */
                .mobile-input-bar {
                    display: flex;
                    align-items: center;
                    background: #0d0d0d;
                    border-bottom: 2px solid #1e1e1e;
                    flex-shrink: 0;
                }
                .mobile-cmd-input {
                    flex: 1;
                    background: transparent;
                    border: none;
                    padding: 9px 12px;
                    font-family: 'IBM Plex Mono', 'JetBrains Mono', monospace;
                    font-size: 13px;
                    color: #f0f0f0;
                    outline: none;
                    caret-color: #FFE500;
                    min-width: 0;
                }
                .mobile-cmd-input::placeholder { color: #3a3a3a; }
                .mobile-cmd-send {
                    background: #FFE500;
                    border: none;
                    border-left: 2px solid #333;
                    color: #000;
                    padding: 9px 15px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    font-weight: 900;
                    min-height: 42px;
                    touch-action: manipulation;
                    -webkit-tap-highlight-color: transparent;
                    flex-shrink: 0;
                }
                .mobile-cmd-send:disabled { opacity: 0.25; background: #222; color: #555; }
                .mobile-cmd-send:not(:disabled):active { background: #fff200; transform: scale(0.96); }

                .xterm-viewport::-webkit-scrollbar { width: 4px; }
                .xterm-viewport::-webkit-scrollbar-track { background: transparent; }
                .xterm-viewport::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }

                @media (max-width: 480px) {
                    .key-btn { padding: 6px 8px; font-size: 9px; }
                    .xterm-container { padding: 2px 4px; }
                }
            `}</style>
        </div>
    );
};
