import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { rpc } from '../access/rpcClient';
import { get, set, del } from 'idb-keyval';
import toast from 'react-hot-toast';
import {
    Cloud, UploadCloud, DownloadCloud, RefreshCw, Loader2,
    CheckCircle2, LogOut, ExternalLink, Key, XCircle, HardDrive
} from 'lucide-react';

interface GDrivePaneProps {
    projectId: string;
    theme: any;
}

interface GDriveTokens {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
}

interface BackupFile {
    id: string;
    name: string;
    fileName: string;
    size?: string;
    modifiedTime?: string;
}

interface DeviceAuth {
    device_code: string;
    user_code: string;
    verification_url: string;
}

const PANEL_TOKEN_KEY = 'exocore_panel_token';

export const GDrivePane: React.FC<GDrivePaneProps> = ({ projectId, theme }) => {
    const [isChecking, setIsChecking] = useState(true);
    const [tokens, setTokens] = useState<GDriveTokens | null>(null);
    const [authData, setAuthData] = useState<DeviceAuth | null>(null);
    const [isPolling, setIsPolling] = useState(false);
    const [busy, setBusy] = useState<'backup' | 'restore' | 'refresh' | null>(null);
    const [backup, setBackup] = useState<BackupFile | null>(null);
    const [panelToken, setPanelToken] = useState<string | null>(null);

    const tokensRef = useRef<GDriveTokens | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const pt = (await get(PANEL_TOKEN_KEY)) as string | undefined;
                setPanelToken(pt || null);
                const stored = await get<GDriveTokens>('gdrive_tokens');
                if (stored) {
                    tokensRef.current = stored;
                    setTokens(stored);
                    fetchBackupForProject(stored, pt);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setIsChecking(false);
            }
        })();
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [projectId]);

    const refreshAccessToken = async (t: GDriveTokens, pt?: string | null): Promise<string> => {
        if (!t.refresh_token) return t.access_token;
        try {
            const res = await rpc.call<any>('gdrive.refreshToken',
                { refresh_token: t.refresh_token, panelToken: pt || panelToken }
            );
            if (res.success) {
                const updated: GDriveTokens = { ...t, ...res.tokens };
                await set('gdrive_tokens', updated);
                tokensRef.current = updated;
                setTokens(updated);
                return updated.access_token;
            }
        } catch {}
        return t.access_token;
    };

    const fetchBackupForProject = async (t: GDriveTokens, pt?: string | null) => {
        setBusy('refresh');
        try {
            const accessToken = await refreshAccessToken(t, pt);
            const res = await rpc.call<any>('gdrive.listBackups', {
                panelToken: pt || panelToken, access_token: accessToken,
            });
            if (res.success) {
                const found = (res.backups || []).find((b: BackupFile) => b.name === projectId);
                setBackup(found || null);
            }
        } catch {
            // silent
        } finally {
            setBusy(null);
        }
    };

    const connect = async () => {
        try {
            const res = await rpc.call<any>('gdrive.deviceCode', { panelToken });
            setAuthData(res);
            startPolling(res.device_code);
        } catch {
            toast.error('Failed to start Google Drive connection');
        }
    };

    const startPolling = (deviceCode: string) => {
        setIsPolling(true);
        pollRef.current = setInterval(async () => {
            try {
                const res = await rpc.call<any>('gdrive.pollToken',
                    { device_code: deviceCode, panelToken }
                );
                if (res && res.success) {
                    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
                    const newTokens: GDriveTokens = res.tokens;
                    await set('gdrive_tokens', newTokens);
                    tokensRef.current = newTokens;
                    setTokens(newTokens);
                    setAuthData(null);
                    setIsPolling(false);
                    toast.success('Google Drive connected!');
                    fetchBackupForProject(newTokens);
                }
            } catch (err: any) {
                if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
                setIsPolling(false);
                setAuthData(null);
                toast.error('Authentication timed out');
            }
        }, 5000);
    };

    const cancelAuth = () => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        setIsPolling(false);
        setAuthData(null);
    };

    const disconnect = async () => {
        if (!window.confirm('Disconnect Google Drive from this browser?')) return;
        await del('gdrive_tokens');
        tokensRef.current = null;
        setTokens(null);
        setBackup(null);
        toast.success('Google Drive disconnected');
    };

    const doBackup = async () => {
        const t = tokensRef.current;
        if (!t) return;
        setBusy('backup');
        const tid = toast.loading(backup ? 'Re-uploading project...' : 'Uploading project to Drive...');
        try {
            const accessToken = await refreshAccessToken(t);
            await rpc.call('gdrive.backup', {
                access_token: accessToken,
                refresh_token: t.refresh_token,
                project_name: projectId,
                panelToken,
            }, { timeoutMs: 180000 });
            toast.success(backup ? 'Cloud copy updated!' : 'Project backed up!', { id: tid });
            await fetchBackupForProject(tokensRef.current || t);
        } catch {
            toast.error('Backup failed', { id: tid });
        } finally {
            setBusy(null);
        }
    };

    const doRestore = async () => {
        const t = tokensRef.current;
        if (!t || !backup) return;
        if (!window.confirm(`Restore '${projectId}' from Drive? This will overwrite local files with the cloud copy.`)) return;
        setBusy('restore');
        const tid = toast.loading('Restoring from Drive...');
        try {
            const accessToken = await refreshAccessToken(t);
            await rpc.call('gdrive.restore', {
                access_token: accessToken,
                file_id: backup.id,
                project_name: projectId,
                panelToken,
            }, { timeoutMs: 180000 });
            toast.success('Project restored! Refresh to see changes.', { id: tid });
        } catch {
            toast.error('Restore failed', { id: tid });
        } finally {
            setBusy(null);
        }
    };

    const formatSize = (bytes?: string) => {
        if (!bytes) return '';
        const n = parseInt(bytes);
        if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
        if (n > 1024) return `${(n / 1024).toFixed(1)} KB`;
        return `${n} B`;
    };

    const formatDate = (iso?: string) => {
        if (!iso) return '';
        const d = new Date(iso);
        return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    if (isChecking) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '50px', color: theme.accent }}>
                <Loader2 className="spin-loader" />
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: theme.surface, color: theme.textMain, overflow: 'hidden' }}>
            <div style={{ padding: '15px 20px', borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Cloud size={16} color={theme.accent} />
                <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1px', opacity: 0.8 }}>GOOGLE DRIVE</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '15px' }} className="custom-scrollbar">
                {!tokens ? (
                    <div style={{ background: theme.bg, padding: '15px', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                        <div style={{ fontSize: '12px', fontWeight: 'bold', color: theme.accent, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Key size={14} /> Connect Google Drive
                        </div>
                        <p style={{ fontSize: '11px', color: theme.textMuted, lineHeight: 1.6, marginBottom: '15px' }}>
                            Save this project to your Google Drive as a zip backup. Re-upload anytime to keep the cloud copy in sync with your latest code.
                        </p>

                        {!authData ? (
                            <button
                                onClick={connect}
                                style={{
                                    width: '100%', background: theme.surface, color: '#fff',
                                    border: `1px solid ${theme.border}`, padding: '12px', borderRadius: '6px',
                                    cursor: 'pointer', display: 'flex', justifyContent: 'center',
                                    alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 'bold'
                                }}
                            >
                                <Cloud size={16} /> Connect Drive
                            </button>
                        ) : (
                            <div style={{ background: 'rgba(139, 233, 253, 0.08)', padding: '15px', borderRadius: '6px', border: '1px solid rgba(139, 233, 253, 0.25)', textAlign: 'center' }}>
                                <p style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '10px' }}>1. Open this link:</p>
                                <a href={authData.verification_url} target="_blank" rel="noreferrer"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 'bold', color: '#8be9fd', textDecoration: 'none', marginBottom: '15px', background: 'rgba(139, 233, 253, 0.15)', padding: '8px 12px', borderRadius: '4px' }}>
                                    <ExternalLink size={14} /> Open Google
                                </a>
                                <p style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '8px' }}>2. Enter this code:</p>
                                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff', letterSpacing: '4px', background: 'rgba(0,0,0,0.35)', padding: '10px', borderRadius: '6px', marginBottom: '12px', fontFamily: 'monospace' }}>
                                    {authData.user_code}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px' }}>
                                    {isPolling ? (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#50fa7b' }}>
                                            <Loader2 size={12} className="spin-loader" /> Waiting...
                                        </span>
                                    ) : <span />}
                                    <button onClick={cancelAuth} style={{ background: 'none', border: 'none', color: '#ff5555', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <XCircle size={12} /> Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <div style={{ background: 'rgba(80, 250, 123, 0.05)', padding: '12px 15px', borderRadius: '8px', border: '1px solid rgba(80, 250, 123, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <CheckCircle2 size={18} color="#50fa7b" />
                                <div>
                                    <div style={{ fontSize: '10px', color: theme.textMuted }}>Connected</div>
                                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#50fa7b' }}>Google Drive</div>
                                </div>
                            </div>
                            <button onClick={disconnect} title="Disconnect"
                                style={{ background: 'transparent', border: '1px solid rgba(255,85,85,0.3)', color: '#ff5555', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}>
                                <LogOut size={11} />
                            </button>
                        </div>

                        <div style={{ background: theme.bg, padding: '15px', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                            <div style={{ fontSize: '12px', fontWeight: 'bold', color: theme.accent, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <HardDrive size={14} /> This Project
                            </div>
                            <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>Project name</div>
                            <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff', marginBottom: '12px', wordBreak: 'break-all' }} className="notranslate" translate="no">
                                {projectId}
                            </div>

                            <div style={{
                                background: 'rgba(0,0,0,0.25)', padding: '10px 12px', borderRadius: '6px',
                                border: `1px solid ${theme.border}`, marginBottom: '12px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <span style={{ fontSize: '10px', color: theme.textMuted, fontWeight: 'bold', letterSpacing: '1px' }}>CLOUD STATUS</span>
                                    <button
                                        onClick={() => fetchBackupForProject(tokensRef.current!)}
                                        disabled={busy === 'refresh'}
                                        style={{ background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer' }}
                                        title="Refresh"
                                    >
                                        {busy === 'refresh' ? <Loader2 size={11} className="spin-loader" /> : <RefreshCw size={11} />}
                                    </button>
                                </div>
                                {backup ? (
                                    <>
                                        <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#50fa7b', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <CheckCircle2 size={12} /> Backed up
                                        </div>
                                        <div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '4px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            {backup.size && <span>{formatSize(backup.size)}</span>}
                                            {backup.modifiedTime && <span>· {formatDate(backup.modifiedTime)}</span>}
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ fontSize: '12px', color: theme.textMuted }}>
                                        Not backed up yet
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={doBackup}
                                disabled={busy !== null}
                                style={{
                                    width: '100%', background: busy === 'backup' ? theme.surface : '#50fa7b',
                                    color: busy === 'backup' ? theme.textMuted : '#000',
                                    border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 'bold',
                                    cursor: busy ? 'not-allowed' : 'pointer',
                                    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
                                    marginBottom: '8px'
                                }}
                            >
                                {busy === 'backup'
                                    ? <Loader2 size={14} className="spin-loader" />
                                    : <UploadCloud size={14} />}
                                {backup ? 'Re-upload to Drive' : 'Save to Drive'}
                            </button>

                            {backup && (
                                <button
                                    onClick={doRestore}
                                    disabled={busy !== null}
                                    style={{
                                        width: '100%', background: theme.surface, color: '#8be9fd',
                                        border: `1px solid ${theme.border}`, padding: '8px', borderRadius: '6px',
                                        cursor: busy ? 'not-allowed' : 'pointer',
                                        display: 'flex', justifyContent: 'center', alignItems: 'center',
                                        gap: '6px', fontSize: '11px', fontWeight: 'bold'
                                    }}
                                >
                                    {busy === 'restore'
                                        ? <Loader2 size={12} className="spin-loader" />
                                        : <DownloadCloud size={12} />}
                                    Restore from Drive
                                </button>
                            )}

                            <p style={{ fontSize: '10px', color: theme.textMuted, lineHeight: 1.5, marginTop: '12px', marginBottom: 0 }}>
                                Tip: Click <b>Re-upload</b> after editing to keep the Drive copy in sync with your latest code.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default GDrivePane;
