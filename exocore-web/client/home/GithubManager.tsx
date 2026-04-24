import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { get, set, del } from 'idb-keyval';
import type { ProjectData } from './ProjectNodeCard';

interface GithubManagerProps {
    token: string | null;
    projects: ProjectData[];
    showAlert: (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
    onClose: () => void;
}

interface DeviceCodeData {
    device_code: string;
    user_code: string;
    verification_uri: string;
}

interface ProjectGitStatus {
    isGit: boolean;
    remote: string;
    changedCount: number;
    loading: boolean;
}

const GithubManager: React.FC<GithubManagerProps> = ({ token, projects, showAlert, onClose }) => {
    const [isChecking, setIsChecking] = useState(true);
    const [ghToken, setGhToken] = useState('');
    const [ghUser, setGhUser] = useState('');
    const [ghEmail, setGhEmail] = useState('');

    const [deviceData, setDeviceData] = useState<DeviceCodeData | null>(null);
    const [isPolling, setIsPolling] = useState(false);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const [statuses, setStatuses] = useState<Record<string, ProjectGitStatus>>({});
    const [busy, setBusy] = useState<string | null>(null);

    const [showManual, setShowManual] = useState(false);
    const [manualToken, setManualToken] = useState('');
    const [manualUser, setManualUser] = useState('');
    const [manualEmail, setManualEmail] = useState('');
    const [showToken, setShowToken] = useState(false);

    const activeProjects = projects.filter(p => p.status !== 'Archived');

    useEffect(() => {
        (async () => {
            try {
                const t = (await get('exo_gh_token')) as string || '';
                const u = (await get('exo_gh_user')) as string || '';
                const e = (await get('exo_gh_email')) as string || '';
                setGhToken(t);
                setGhUser(u);
                setGhEmail(e);
            } catch (err) {
                console.error(err);
            } finally {
                setIsChecking(false);
            }
        })();
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, []);

    useEffect(() => {
        if (ghToken && activeProjects.length > 0) {
            activeProjects.forEach(p => loadStatus(p.id));
        }
    }, [ghToken, projects]);

    const loadStatus = async (projectId: string) => {
        setStatuses(prev => ({ ...prev, [projectId]: { ...(prev[projectId] || { isGit: false, remote: '', changedCount: 0 }), loading: true } }));
        try {
            const [statusRes, filesRes] = await Promise.all([
                axios.get('/exocore/api/editor/github/status', { params: { projectId } }),
                axios.get('/exocore/api/editor/github/files', { params: { projectId } }).catch(() => null),
            ]);
            const changedCount = filesRes?.data?.success ? (filesRes.data.files?.length || 0) : 0;
            setStatuses(prev => ({
                ...prev,
                [projectId]: {
                    isGit: !!statusRes.data.isGit,
                    remote: statusRes.data.remote || '',
                    changedCount,
                    loading: false,
                },
            }));
        } catch {
            setStatuses(prev => ({ ...prev, [projectId]: { isGit: false, remote: '', changedCount: 0, loading: false } }));
        }
    };

    const startDeviceAuth = async () => {
        try {
            const res = await axios.post('/exocore/api/editor/github/auth/device', null, { params: { token } });
            if (res.data.success) {
                setDeviceData(res.data.data);
                setIsPolling(true);
                pollRef.current = setInterval(async () => {
                    try {
                        const pollRes = await axios.post('/exocore/api/editor/github/auth/poll',
                            { device_code: res.data.data.device_code },
                            { params: { token } }
                        );
                        if (pollRes.data.success) {
                            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
                            const { token: newToken, username, email } = pollRes.data;
                            await set('exo_gh_token', newToken);
                            await set('exo_gh_user', username);
                            await set('exo_gh_email', email || '');
                            setGhToken(newToken);
                            setGhUser(username);
                            setGhEmail(email || '');
                            setDeviceData(null);
                            setIsPolling(false);
                            showAlert('Connected', `GitHub connected as @${username}`, 'success');
                        } else if (pollRes.data.error === 'access_denied' || pollRes.data.error === 'expired_token') {
                            cancelAuth();
                            showAlert('Auth Failed', pollRes.data.error, 'error');
                        }
                    } catch {}
                }, 6000);
            }
        } catch {
            showAlert('Error', 'Failed to start GitHub authentication', 'error');
        }
    };

    const cancelAuth = () => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        setIsPolling(false);
        setDeviceData(null);
    };

    const saveManual = async () => {
        if (!manualToken || !manualUser) {
            showAlert('Missing', 'Username and token are required', 'warning');
            return;
        }
        await set('exo_gh_token', manualToken);
        await set('exo_gh_user', manualUser);
        await set('exo_gh_email', manualEmail || '');
        setGhToken(manualToken);
        setGhUser(manualUser);
        setGhEmail(manualEmail || '');
        setShowManual(false);
        setManualToken(''); setManualUser(''); setManualEmail('');
        showAlert('Saved', 'GitHub credentials saved', 'success');
    };

    const disconnect = async () => {
        if (!window.confirm('Disconnect GitHub? Credentials will be cleared from this browser.')) return;
        await del('exo_gh_token');
        await del('exo_gh_user');
        await del('exo_gh_email');
        setGhToken(''); setGhUser(''); setGhEmail('');
        setStatuses({});
        showAlert('Disconnected', 'GitHub disconnected', 'info');
    };

    const doPull = async (projectId: string) => {
        setBusy(`pull-${projectId}`);
        try {
            await axios.post('/exocore/api/editor/github/pull',
                { projectId, token: ghToken },
                { params: { token } }
            );
            showAlert('Pulled', `Latest code pulled into '${projectId}'`, 'success');
            await loadStatus(projectId);
        } catch (err: any) {
            showAlert('Pull failed', err.response?.data?.error || `Failed to pull '${projectId}'`, 'error');
        } finally {
            setBusy(null);
        }
    };

    const doPush = async (projectId: string) => {
        const msg = window.prompt('Commit message:', 'Update via Exocore Dashboard');
        if (msg === null) return;
        setBusy(`push-${projectId}`);
        try {
            await axios.post('/exocore/api/editor/github/push',
                { projectId, token: ghToken, username: ghUser, files: [], commitMsg: msg, commitDesc: '' },
                { params: { token } }
            );
            showAlert('Pushed', `Changes pushed for '${projectId}'`, 'success');
            await loadStatus(projectId);
        } catch (err: any) {
            showAlert('Push failed', err.response?.data?.error || `Failed to push '${projectId}'`, 'error');
        } finally {
            setBusy(null);
        }
    };

    if (isChecking) return null;

    return (
        <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 11000 }}>
            <div
                className="modal-box"
                onClick={e => e.stopPropagation()}
                style={{ maxWidth: 580, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
            >
                <div className="modal-header">
                    <span className="modal-title">🐙 GitHub Storage</span>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
                </div>

                <div className="modal-body" style={{ overflowY: 'auto', flex: 1 }}>
                    {!ghToken ? (
                        <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🐙</div>
                            <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>Connect GitHub</h3>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem', lineHeight: 1.6 }}>
                                Pull and push your projects to GitHub directly from the dashboard.
                            </p>

                            {deviceData ? (
                                <div style={{
                                    background: 'rgba(139,233,253,0.08)', padding: '1.25rem',
                                    borderRadius: '10px', border: '1px solid rgba(139,233,253,0.25)'
                                }}>
                                    <p style={{ marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                        1. Open GitHub:
                                    </p>
                                    <a
                                        href={deviceData.verification_uri}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ color: '#8be9fd', fontWeight: 600, fontSize: '0.9rem' }}
                                    >
                                        {deviceData.verification_uri}
                                    </a>
                                    <p style={{ marginTop: '1rem', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                        2. Enter this code:
                                    </p>
                                    <div style={{
                                        fontSize: '1.6rem', fontWeight: 800, letterSpacing: '4px',
                                        background: '#000', padding: '0.75rem 1.5rem', borderRadius: '6px',
                                        display: 'inline-block', color: '#fff', fontFamily: 'monospace'
                                    }}>
                                        {deviceData.user_code}
                                    </div>
                                    <p style={{ marginTop: '1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                        {isPolling ? '⏳ Waiting for authorization...' : ''}
                                    </p>
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={cancelAuth}
                                        style={{ marginTop: '0.5rem' }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            ) : showManual ? (
                                <div style={{
                                    background: 'rgba(255,255,255,0.04)', padding: '1.25rem',
                                    borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)',
                                    textAlign: 'left'
                                }}>
                                    <h4 style={{ marginTop: 0, marginBottom: '0.75rem', fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                                        Manual Personal Access Token
                                    </h4>
                                    <input
                                        placeholder="GitHub username"
                                        value={manualUser}
                                        onChange={e => setManualUser(e.target.value)}
                                        style={inputStyle}
                                    />
                                    <input
                                        placeholder="Email (optional)"
                                        value={manualEmail}
                                        onChange={e => setManualEmail(e.target.value)}
                                        style={inputStyle}
                                    />
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type={showToken ? 'text' : 'password'}
                                            placeholder="ghp_xxxxxxxxxxxxxxx"
                                            value={manualToken}
                                            onChange={e => setManualToken(e.target.value)}
                                            style={{ ...inputStyle, paddingRight: '2.5rem' }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowToken(s => !s)}
                                            aria-label={showToken ? 'Hide token' : 'Show token'}
                                            style={{
                                                position: 'absolute', right: 8, top: '50%',
                                                transform: 'translateY(-50%)',
                                                background: 'transparent', border: 'none',
                                                color: 'var(--text-secondary)', cursor: 'pointer',
                                                padding: 4
                                            }}
                                        >
                                            {showToken ? '🙈' : '👁'}
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                        <button className="btn btn-primary btn-sm" onClick={saveManual} style={{ flex: 1 }}>Save</button>
                                        <button className="btn btn-secondary btn-sm" onClick={() => setShowManual(false)} style={{ flex: 1 }}>Back</button>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
                                    <button
                                        className="btn btn-primary"
                                        onClick={startDeviceAuth}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                                    >
                                        🔑 Login with GitHub
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => setShowManual(true)}
                                        style={{ fontSize: '0.8rem' }}
                                    >
                                        Use Personal Access Token instead
                                    </button>
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
                                <div>
                                    <div style={{ color: '#22c55e', fontWeight: 700, fontSize: '0.9rem' }}>
                                        ● Connected
                                    </div>
                                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                        @{ghUser}
                                    </div>
                                </div>
                                <button className="btn btn-secondary btn-sm" onClick={disconnect}>
                                    Disconnect
                                </button>
                            </div>

                            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                                Your Projects
                            </h4>

                            {activeProjects.length === 0 ? (
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                    No active projects found.
                                </p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {activeProjects.map(p => {
                                        const s = statuses[p.id];
                                        const linked = s?.isGit && s?.remote;
                                        const pullBusy = busy === `pull-${p.id}`;
                                        const pushBusy = busy === `push-${p.id}`;
                                        return (
                                            <div key={p.id} style={{
                                                background: 'rgba(255,255,255,0.03)',
                                                border: '1px solid rgba(255,255,255,0.06)',
                                                borderRadius: '8px',
                                                padding: '0.75rem',
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem', gap: '0.5rem' }}>
                                                    <div style={{ minWidth: 0, flex: 1 }}>
                                                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
                                                            {p.name || p.id}
                                                        </div>
                                                        {s?.loading ? (
                                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Checking...</div>
                                                        ) : linked ? (
                                                            <div style={{
                                                                fontSize: '0.7rem',
                                                                color: '#8be9fd',
                                                                whiteSpace: 'nowrap',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                            }} title={s.remote}>
                                                                {s.remote.replace(/^https:\/\/[^@]*@?/, 'https://')}
                                                            </div>
                                                        ) : (
                                                            <div style={{ fontSize: '0.7rem', color: '#ef4444' }}>
                                                                Not linked to GitHub yet — open in editor to connect
                                                            </div>
                                                        )}
                                                        {linked && s.changedCount > 0 && (
                                                            <div style={{
                                                                fontSize: '0.65rem', marginTop: '4px',
                                                                color: '#f59e0b', fontWeight: 'bold'
                                                            }}>
                                                                {s.changedCount} uncommitted change{s.changedCount === 1 ? '' : 's'}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                    <button
                                                        className="btn btn-xs"
                                                        style={{
                                                            flex: 1,
                                                            background: linked ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.04)',
                                                            color: linked ? '#818cf8' : 'var(--text-secondary)',
                                                            border: `1px solid ${linked ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.06)'}`,
                                                            borderRadius: '6px',
                                                            padding: '0.35rem 0.6rem',
                                                            fontSize: '0.75rem',
                                                            cursor: linked && !pullBusy ? 'pointer' : 'not-allowed',
                                                        }}
                                                        onClick={() => doPull(p.id)}
                                                        disabled={!linked || pullBusy || pushBusy}
                                                    >
                                                        {pullBusy ? '⏳' : '⬇'} Pull
                                                    </button>
                                                    <button
                                                        className="btn btn-xs"
                                                        style={{
                                                            flex: 1,
                                                            background: linked ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)',
                                                            color: linked ? '#22c55e' : 'var(--text-secondary)',
                                                            border: `1px solid ${linked ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)'}`,
                                                            borderRadius: '6px',
                                                            padding: '0.35rem 0.6rem',
                                                            fontSize: '0.75rem',
                                                            cursor: linked && !pushBusy ? 'pointer' : 'not-allowed',
                                                        }}
                                                        onClick={() => doPush(p.id)}
                                                        disabled={!linked || pullBusy || pushBusy}
                                                    >
                                                        {pushBusy ? '⏳' : '⬆'} Push
                                                    </button>
                                                    <button
                                                        className="btn btn-xs"
                                                        style={{
                                                            background: 'rgba(255,255,255,0.04)',
                                                            color: 'var(--text-secondary)',
                                                            border: '1px solid rgba(255,255,255,0.06)',
                                                            borderRadius: '6px',
                                                            padding: '0.35rem 0.6rem',
                                                            fontSize: '0.75rem',
                                                            cursor: 'pointer',
                                                        }}
                                                        onClick={() => loadStatus(p.id)}
                                                        title="Refresh"
                                                    >
                                                        ↻
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '1rem', lineHeight: 1.5 }}>
                                Tip: To link a project to a GitHub repo for the first time, open it in the editor and use the Git tab.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(0,0,0,0.3)',
    color: 'var(--text-primary)',
    border: '1px solid rgba(255,255,255,0.1)',
    padding: '0.5rem 0.65rem',
    borderRadius: '6px',
    fontSize: '0.85rem',
    marginBottom: '0.5rem',
    boxSizing: 'border-box',
};

export default GithubManager;
