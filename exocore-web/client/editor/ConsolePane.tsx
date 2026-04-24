import React, { useEffect, useRef, useCallback, useState } from 'react';
import { PlayCircle, Square, RotateCw, Wifi, WifiOff } from 'lucide-react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { muxCarrier } from '../access/wsMux';
import { panelAuthHeaders } from '../access/panelAuth';

interface ConsolePaneProps {
    projectId: string;
    theme: any;
    onClose: () => void;
    onRunningChange: (isRunning: boolean) => void;
    onUrlDetect: (url: string) => void;
    onTunnelDetect?: (url: string) => void;
}

type ProcessStatus = 'running' | 'stopped' | 'killing';

export const ConsolePane: React.FC<ConsolePaneProps> = ({
    projectId,
    theme,
    onRunningChange,
    onUrlDetect,
    onTunnelDetect
}) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const termInstance = useRef<Terminal | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const manuallyStoppedRef = useRef(false);
    const [connected, setConnected] = useState(false);
    const [reconnecting, setReconnecting] = useState(false);
    const [processStatus, setProcessStatus] = useState<ProcessStatus>('stopped');

    const onRunningRef = useRef(onRunningChange);
    const onUrlDetectRef = useRef(onUrlDetect);
    const onTunnelDetectRef = useRef(onTunnelDetect);

    useEffect(() => {
        onRunningRef.current = onRunningChange;
        onUrlDetectRef.current = onUrlDetect;
        onTunnelDetectRef.current = onTunnelDetect;
    }, [onRunningChange, onUrlDetect, onTunnelDetect]);

    const clearReconnectTimer = () => {
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }
    };

    const connectWs = useCallback((forceRestart = false) => {
        const term = termInstance.current;
        if (!term) return;

        clearReconnectTimer();
        manuallyStoppedRef.current = false;

        if (wsRef.current) {
            wsRef.current.onclose = null;
            wsRef.current.close();
        }

        setConnected(false);
        setReconnecting(false);

        if (forceRestart) term.clear();
        term.writeln('\x1b[33mConnecting to Exocore Console...\x1b[0m');

        const restartParam = forceRestart ? '&forceRestart=true' : '';
        const wsPath = `/exocore/terminal?projectId=${projectId}&type=console${restartParam}`;

        const ws = muxCarrier.openChannelInstance("terminal", wsPath) as unknown as WebSocket;
        wsRef.current = ws;

        ws.onopen = () => {
            setConnected(true);
            setReconnecting(false);
            setProcessStatus('running');
            onRunningRef.current(true);
        };

        ws.onmessage = (e) => {
            const rawData = typeof e.data === 'string' ? e.data : new TextDecoder().decode(e.data);

            const localMatch = rawData.match(/\[EXOCORE_LOCAL_URL:(.+?)\]/);
            const tunnelMatch = rawData.match(/\[EXOCORE_TUNNEL_URL:(.+?)\]/);

            if (localMatch) {
                onUrlDetectRef.current(localMatch[1].trim());
            } else if (tunnelMatch) {
                onTunnelDetectRef.current?.(tunnelMatch[1].trim());
            } else {
                termInstance.current?.write(rawData);
            }
        };

        ws.onclose = () => {
            setConnected(false);
            setProcessStatus('stopped');
            onRunningRef.current(false);

            if (manuallyStoppedRef.current) {
                termInstance.current?.writeln('\r\n\x1b[31m[Console Stopped]\x1b[0m');
                setReconnecting(false);
                return;
            }

            termInstance.current?.writeln('\r\n\x1b[33m[Disconnected — reconnecting in 3s...]\x1b[0m');
            setReconnecting(true);

            reconnectTimerRef.current = setTimeout(() => {
                if (!manuallyStoppedRef.current) {
                    connectWs(false);
                }
            }, 3000);
        };
    }, [projectId]);

    const handleStop = useCallback(async () => {
        if (processStatus === 'stopped' || processStatus === 'killing') return;

        setProcessStatus('killing');
        manuallyStoppedRef.current = true;
        clearReconnectTimer();
        setReconnecting(false);

        termInstance.current?.writeln('\r\n\x1b[33m[Killing process...]\x1b[0m');

        try {
            const { rpc } = await import('../access/rpcClient');
            const { getPanelToken } = await import('../access/panelAuth');
            const token = await getPanelToken();
            await rpc.call('runtime.kill', { token, projectId });
        } catch (_e) {}

        wsRef.current?.send('\x03');
        if (wsRef.current) {
            wsRef.current.onclose = null;
            wsRef.current.close();
        }

        setConnected(false);
        setProcessStatus('stopped');
        onRunningRef.current(false);
        termInstance.current?.writeln('\x1b[31m[Process terminated]\x1b[0m');
    }, [projectId, processStatus]);

    useEffect(() => {
        if (!terminalRef.current) return;

        const term = new Terminal({
            theme: { background: theme.surface, foreground: theme.textMain },
            fontFamily: 'monospace',
            fontSize: 13,
            cursorBlink: true,
            convertEol: true
        });

        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(terminalRef.current);
        fit.fit();
        termInstance.current = term;

        term.onData((data) => {
            if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(data);
        });

        const handleResize = () => { try { fit.fit(); } catch (e) {} };
        window.addEventListener('resize', handleResize);
        connectWs(false);

        return () => {
            window.removeEventListener('resize', handleResize);
            clearReconnectTimer();
            term.dispose();
            if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
        };
    }, [theme.surface, theme.textMain, connectWs]);

    const statusLabel = processStatus === 'killing' ? 'KILLING...' : connected ? 'LIVE' : reconnecting ? 'RECONNECTING' : 'OFF';
    const statusColor = processStatus === 'killing' ? '#f1fa8c' : connected ? '#50fa7b' : reconnecting ? '#f1fa8c' : '#ff5555';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: theme.surface }}>
            <div style={{
                display: 'flex',
                gap: '10px',
                padding: '8px 16px',
                borderBottom: `1px solid ${theme.border}`,
                alignItems: 'center',
                background: theme.bg
            }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: theme.textMuted, letterSpacing: '1px' }}>
                    CONSOLE
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginRight: '6px' }}>
                    {connected
                        ? <Wifi size={12} color="#50fa7b" />
                        : <WifiOff size={12} color={reconnecting ? '#f1fa8c' : '#ff5555'} />}
                    <span style={{ fontSize: '10px', color: statusColor, fontWeight: 600 }}>
                        {statusLabel}
                    </span>
                </div>

                <button
                    onClick={() => connectWs(false)}
                    disabled={processStatus === 'running' || processStatus === 'killing'}
                    style={{
                        color: processStatus === 'running' || processStatus === 'killing' ? theme.textMuted : '#50fa7b',
                        display: 'flex', alignItems: 'center', gap: '5px',
                        background: 'transparent', border: 'none',
                        cursor: processStatus === 'running' || processStatus === 'killing' ? 'not-allowed' : 'pointer',
                        fontWeight: '600', fontSize: '12px', opacity: processStatus === 'running' || processStatus === 'killing' ? 0.4 : 1
                    }}
                >
                    <PlayCircle size={14} /> Start
                </button>

                <button
                    onClick={() => connectWs(true)}
                    disabled={processStatus === 'killing'}
                    style={{
                        color: processStatus === 'killing' ? theme.textMuted : '#8be9fd',
                        display: 'flex', alignItems: 'center', gap: '5px',
                        background: 'transparent', border: 'none',
                        cursor: processStatus === 'killing' ? 'not-allowed' : 'pointer',
                        fontWeight: '600', fontSize: '12px', opacity: processStatus === 'killing' ? 0.4 : 1
                    }}
                >
                    <RotateCw size={14} /> Restart
                </button>

                <button
                    onClick={handleStop}
                    disabled={processStatus === 'stopped' || processStatus === 'killing'}
                    style={{
                        color: processStatus === 'killing' ? '#f1fa8c' : '#ff5555',
                        display: 'flex', alignItems: 'center', gap: '5px',
                        background: 'transparent', border: 'none',
                        cursor: processStatus === 'stopped' || processStatus === 'killing' ? 'not-allowed' : 'pointer',
                        fontWeight: '600', fontSize: '12px',
                        opacity: processStatus === 'stopped' ? 0.4 : 1
                    }}
                >
                    <Square size={14} />
                    {processStatus === 'killing' ? 'Killing...' : 'Stop'}
                </button>

                <div style={{ flex: 1 }} />
            </div>

            <div ref={terminalRef} style={{ flex: 1, overflow: 'hidden', padding: '8px' }} />
        </div>
    );
};
