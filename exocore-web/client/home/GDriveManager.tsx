import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { get, set, del } from 'idb-keyval';

interface GDriveManagerProps {
    token: string | null;
    projects: { id: string; name: string; status?: string }[];
    showAlert: (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
    onClose: () => void;
}

interface DeviceAuth {
    device_code: string;
    user_code: string;
    verification_url: string;
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

const GDriveManager: React.FC<GDriveManagerProps> = ({ token, projects, showAlert, onClose }) => {
    const [isChecking, setIsChecking] = useState(true);
    const [gDriveTokens, setGDriveTokens] = useState<GDriveTokens | null>(null);
    const [authData, setAuthData] = useState<DeviceAuth | null>(null);
    const [isPolling, setIsPolling] = useState(false);
    const [backups, setBackups] = useState<BackupFile[]>([]);
    const [autoImportList, setAutoImportList] = useState<string[]>([]);
    const [loadingBackups, setLoadingBackups] = useState(false);
    const [backingUp, setBackingUp] = useState<string | null>(null);
    const [restoring, setRestoring] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);

    const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const tokensRef = useRef<GDriveTokens | null>(null);

    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const storedTokens = await get<GDriveTokens>('gdrive_tokens');
                const storedAutoImports = await get<string[]>('exo_auto_imports') || [];
                if (storedTokens) {
                    tokensRef.current = storedTokens;
                    setGDriveTokens(storedTokens);
                    fetchBackups(storedTokens);
                }
                setAutoImportList(storedAutoImports);
            } catch (err) {
                console.error("Failed to load DB:", err);
            } finally {
                setIsChecking(false);
            }
        };
        loadInitialData();

        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, []);

    const getValidAccessToken = async (tokens: GDriveTokens): Promise<string> => {
        if (!tokens.refresh_token) return tokens.access_token;
        try {
            const res = await axios.post('/exocore/api/editor/gdrive/refresh-token', {
                refresh_token: tokens.refresh_token,
            }, { params: { token } });
            if (res.data.success) {
                const updated: GDriveTokens = { ...tokens, ...res.data.tokens };
                await set('gdrive_tokens', updated);
                tokensRef.current = updated;
                setGDriveTokens(updated);
                return updated.access_token;
            }
        } catch {
        }
        return tokens.access_token;
    };

    const connectGDrive = async () => {
        try {
            const res = await axios.get('/exocore/api/editor/gdrive/device-code', { params: { token } });
            setAuthData(res.data);
            startPolling(res.data.device_code);
        } catch {
            showAlert('Error', 'Failed to initialize Google Drive connection.', 'error');
        }
    };

    const startPolling = (deviceCode: string) => {
        setIsPolling(true);
        pollIntervalRef.current = setInterval(async () => {
            try {
                const res = await axios.post('/exocore/api/editor/gdrive/poll-token',
                    { device_code: deviceCode },
                    { params: { token } }
                );
                if (res.status === 200 && res.data.success) {
                    if (pollIntervalRef.current) {
                        clearInterval(pollIntervalRef.current);
                        pollIntervalRef.current = null;
                    }
                    const newTokens: GDriveTokens = res.data.tokens;
                    await set('gdrive_tokens', newTokens);
                    tokensRef.current = newTokens;
                    setGDriveTokens(newTokens);
                    setAuthData(null);
                    setIsPolling(false);
                    showAlert('Success', 'Google Drive connected!', 'success');
                    fetchBackups(newTokens);
                }
            } catch (error: any) {
                if (error.response?.status !== 202) {
                    if (pollIntervalRef.current) {
                        clearInterval(pollIntervalRef.current);
                        pollIntervalRef.current = null;
                    }
                    setIsPolling(false);
                    setAuthData(null);
                    showAlert('Error', 'Authentication timed out or failed.', 'error');
                }
            }
        }, 5000);
    };

    const disconnectGDrive = async () => {
        await del('gdrive_tokens');
        await del('exo_auto_imports');
        tokensRef.current = null;
        setGDriveTokens(null);
        setBackups([]);
        setAutoImportList([]);
        showAlert('Disconnected', 'Google Drive unlinked.', 'info');
    };

    const fetchBackups = async (tokens: GDriveTokens) => {
        setLoadingBackups(true);
        try {
            const accessToken = await getValidAccessToken(tokens);
            const res = await axios.get('/exocore/api/editor/gdrive/list-backups', {
                params: { token, access_token: accessToken },
            });
            if (res.data.success) {
                setBackups(res.data.backups || []);
            }
        } catch {
            showAlert('Error', 'Could not list backups from Google Drive.', 'error');
        } finally {
            setLoadingBackups(false);
        }
    };

    const handleRefresh = () => {
        const t = tokensRef.current;
        if (t) fetchBackups(t);
    };

    const handleBackup = async (projectName: string) => {
        const t = tokensRef.current;
        if (!t) return;
        setBackingUp(projectName);
        try {
            const accessToken = await getValidAccessToken(t);
            await axios.post('/exocore/api/editor/gdrive/backup', {
                access_token: accessToken,
                refresh_token: t.refresh_token,
                project_name: projectName,
            }, { params: { token } });
            showAlert('Backup Done', `'${projectName}' backed up to Google Drive.`, 'success');
            const updated = tokensRef.current || t;
            await fetchBackups(updated);
        } catch {
            showAlert('Error', `Failed to backup '${projectName}'.`, 'error');
        } finally {
            setBackingUp(null);
        }
    };

    const handleRestore = async (backup: BackupFile) => {
        const t = tokensRef.current;
        if (!t) return;
        setRestoring(backup.id);
        try {
            const accessToken = await getValidAccessToken(t);
            await axios.post('/exocore/api/editor/gdrive/restore', {
                access_token: accessToken,
                file_id: backup.id,
                project_name: backup.name,
            }, { params: { token } });
            showAlert('Restored', `'${backup.name}' has been restored.`, 'success');
        } catch {
            showAlert('Error', `Failed to restore '${backup.name}'.`, 'error');
        } finally {
            setRestoring(null);
        }
    };

    const handleDelete = async (backup: BackupFile) => {
        const t = tokensRef.current;
        if (!t) return;
        setDeleting(backup.id);
        try {
            const accessToken = await getValidAccessToken(t);
            await axios.delete('/exocore/api/editor/gdrive/delete-backup', {
                data: { access_token: accessToken, file_id: backup.id },
                params: { token },
            });
            showAlert('Deleted', `Backup for '${backup.name}' deleted.`, 'success');
            setBackups(prev => prev.filter(b => b.id !== backup.id));
            if (autoImportList.includes(backup.name)) {
                await toggleAutoImport(backup.name);
            }
        } catch {
            showAlert('Error', `Failed to delete backup.`, 'error');
        } finally {
            setDeleting(null);
        }
    };

    const handleBackupAll = async () => {
        const t = tokensRef.current;
        if (!t) return;
        const activeProjects = projects.filter(p => p.status !== 'Archived');
        if (activeProjects.length === 0) {
            showAlert('Info', 'No projects to backup.', 'info');
            return;
        }
        showAlert('Info', `Backing up ${activeProjects.length} project(s)...`, 'info');
        for (const proj of activeProjects) {
            await handleBackup(proj.name || proj.id);
        }
        showAlert('Done', 'All projects backed up!', 'success');
    };

    const toggleAutoImport = async (projectName: string) => {
        const newList = autoImportList.includes(projectName)
            ? autoImportList.filter(p => p !== projectName)
            : [...autoImportList, projectName];
        setAutoImportList(newList);
        await set('exo_auto_imports', newList);
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
        return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    };

    if (isChecking) return null;

    return (
        <div
            className="modal-backdrop"
            onClick={onClose}
            style={{ zIndex: 11000 }}
        >
            <div
                className="modal-box"
                onClick={e => e.stopPropagation()}
                style={{ maxWidth: 540, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
            >
                <div className="modal-header">
                    <span className="modal-title">☁️ Cloud Backups — Google Drive</span>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
                </div>

                <div className="modal-body" style={{ overflowY: 'auto', flex: 1 }}>
                    {!gDriveTokens ? (
                        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📁</div>
                            <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>Secure your workspace</h3>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem', lineHeight: 1.6 }}>
                                Connect your Google Drive account to backup and restore your projects — even after server restarts on Render, Railway, or Hugging Face.
                            </p>

                            {!authData ? (
                                <button
                                    className="btn btn-primary"
                                    onClick={connectGDrive}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    <span>🔑</span> Connect Google Drive
                                </button>
                            ) : (
                                <div style={{ background: 'rgba(255,255,255,0.04)', padding: '1.25rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <p style={{ marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                        1. Open this link in your browser:
                                    </p>
                                    <a
                                        href={authData.verification_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ color: 'var(--indigo-light)', fontWeight: 600, fontSize: '0.9rem' }}
                                    >
                                        {authData.verification_url}
                                    </a>
                                    <p style={{ marginTop: '1rem', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                        2. Enter this code:
                                    </p>
                                    <div style={{
                                        fontSize: '1.6rem', fontWeight: 800, letterSpacing: '4px',
                                        background: '#000', padding: '0.75rem 1.5rem', borderRadius: '6px',
                                        display: 'inline-block', color: '#fff', fontFamily: 'monospace'
                                    }}>
                                        {authData.user_code}
                                    </div>
                                    <p style={{ marginTop: '1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                        {isPolling ? '⏳ Waiting for authorization...' : ''}
                                    </p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div>
                            <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                marginBottom: '1rem', paddingBottom: '1rem',
                                borderBottom: '1px solid rgba(255,255,255,0.08)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ color: '#22c55e', fontWeight: 700 }}>● Connected</span>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Google Drive</span>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                        className="btn btn-primary btn-sm"
                                        onClick={handleBackupAll}
                                        disabled={!!backingUp}
                                    >
                                        {backingUp ? '⏳ Backing up...' : '⬆ Backup All'}
                                    </button>
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={disconnectGDrive}
                                    >
                                        Unlink
                                    </button>
                                </div>
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                                        Your Projects
                                    </h4>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Backup individual projects</span>
                                </div>
                                {projects.filter(p => p.status !== 'Archived').length === 0 ? (
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No active projects found.</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                        {projects.filter(p => p.status !== 'Archived').map(p => {
                                            const projName = p.name || p.id;
                                            const hasBackup = backups.some(b => b.name === projName);
                                            return (
                                                <div key={p.id} style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    padding: '0.5rem 0.75rem',
                                                    background: 'rgba(255,255,255,0.03)',
                                                    borderRadius: '8px',
                                                    border: '1px solid rgba(255,255,255,0.06)'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{projName}</span>
                                                        {hasBackup && (
                                                            <span style={{
                                                                fontSize: '0.65rem', padding: '1px 6px',
                                                                borderRadius: '10px', background: 'rgba(34,197,94,0.12)',
                                                                color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)'
                                                            }}>backed up</span>
                                                        )}
                                                    </div>
                                                    <button
                                                        className="btn btn-xs"
                                                        style={{
                                                            background: 'rgba(99,102,241,0.12)', color: '#818cf8',
                                                            border: '1px solid rgba(99,102,241,0.2)',
                                                            borderRadius: '6px', padding: '0.25rem 0.6rem',
                                                            fontSize: '0.75rem', cursor: 'pointer'
                                                        }}
                                                        onClick={() => handleBackup(projName)}
                                                        disabled={backingUp === projName}
                                                    >
                                                        {backingUp === projName ? '⏳' : '⬆ Backup'}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                                        Saved Backups on Drive
                                    </h4>
                                    <button
                                        className="btn btn-xs"
                                        style={{
                                            background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            borderRadius: '6px', padding: '0.2rem 0.6rem', fontSize: '0.75rem',
                                            cursor: loadingBackups ? 'not-allowed' : 'pointer',
                                            display: 'flex', alignItems: 'center', gap: '4px'
                                        }}
                                        onClick={handleRefresh}
                                        disabled={loadingBackups}
                                    >
                                        {loadingBackups ? '⏳' : '↻'} Refresh
                                    </button>
                                </div>

                                <div style={{
                                    background: 'rgba(0,0,0,0.2)', borderRadius: '8px',
                                    border: '1px solid rgba(255,255,255,0.06)', minHeight: '120px'
                                }}>
                                    {loadingBackups ? (
                                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                            Loading backups...
                                        </div>
                                    ) : backups.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                            No backups found in Google Drive.
                                        </div>
                                    ) : (
                                        backups.map(backup => (
                                            <div key={backup.id} style={{
                                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                padding: '0.6rem 0.75rem',
                                                borderBottom: '1px solid rgba(255,255,255,0.04)'
                                            }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 500, marginBottom: '2px' }}>
                                                        {backup.name}
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.5rem' }}>
                                                        {backup.size && <span>{formatSize(backup.size)}</span>}
                                                        {backup.modifiedTime && <span>· {formatDate(backup.modifiedTime)}</span>}
                                                    </div>
                                                </div>

                                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', cursor: 'pointer', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={autoImportList.includes(backup.name)}
                                                        onChange={() => toggleAutoImport(backup.name)}
                                                        style={{ cursor: 'pointer' }}
                                                    />
                                                    Auto-import
                                                </label>

                                                <button
                                                    className="btn btn-xs"
                                                    style={{
                                                        background: 'rgba(34,197,94,0.1)', color: '#22c55e',
                                                        border: '1px solid rgba(34,197,94,0.2)',
                                                        borderRadius: '6px', padding: '0.2rem 0.5rem',
                                                        fontSize: '0.7rem', cursor: 'pointer', whiteSpace: 'nowrap'
                                                    }}
                                                    onClick={() => handleRestore(backup)}
                                                    disabled={restoring === backup.id}
                                                >
                                                    {restoring === backup.id ? '⏳' : '⬇ Restore'}
                                                </button>

                                                <button
                                                    className="btn btn-xs"
                                                    style={{
                                                        background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                                                        border: '1px solid rgba(239,68,68,0.2)',
                                                        borderRadius: '6px', padding: '0.2rem 0.5rem',
                                                        fontSize: '0.7rem', cursor: 'pointer'
                                                    }}
                                                    onClick={() => handleDelete(backup)}
                                                    disabled={deleting === backup.id}
                                                >
                                                    {deleting === backup.id ? '⏳' : '🗑'}
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {autoImportList.length > 0 && (
                                    <div style={{
                                        marginTop: '0.75rem', padding: '0.5rem 0.75rem',
                                        background: 'rgba(99,102,241,0.08)',
                                        border: '1px solid rgba(99,102,241,0.2)',
                                        borderRadius: '8px', fontSize: '0.78rem', color: 'var(--indigo-light)'
                                    }}>
                                        ✅ Auto-import enabled for: {autoImportList.join(', ')}. These will be restored automatically when not found on the server.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GDriveManager;
