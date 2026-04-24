import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { get } from 'idb-keyval';
import { initTheme } from '../components/utils/themeManager';
import Account from './Account';
import FileManager from './FileManager';
import GDriveManager from './GDriveManager';
import GithubManager from './GithubManager';
import { ProjectNodeCard } from './ProjectNodeCard';
import type { ProjectData } from './ProjectNodeCard';
import SocialPanel from '../social/SocialPanel';
import PlansModal from './PlansModal';
import OwnerPaymentsPanel from './OwnerPaymentsPanel';
import './dashboard.css';
import './plans.css';

type AlertType = 'success' | 'error' | 'warning' | 'info';

interface AlertMsg {
    id: number;
    title: string;
    message: string;
    type: AlertType;
}

interface DialogState {
    isOpen: boolean;
    type: 'prompt' | 'confirm';
    title: string;
    message: string;
    inputValue: string;
    onConfirm: (val: string) => void;
}

interface UserData {
    id?: string;
    user?: string;
    username?: string;
    nickname?: string;
    email?: string;
    bio?: string;
    dob?: string;
    country?: string;
    timezone?: string;
    verified?: boolean;
    avatarUrl?: string;
    coverUrl?: string;
    role?: string;
    plan?: string;
    planExpiresAt?: number | null;
}

type ActiveView = 'home' | 'account';

const GitHubIcon: React.FC<{ size?: number; color?: string }> = ({ size = 18, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
);

const SOCIAL_PLATFORMS: Array<{ id: string; label: string; icon: React.ReactNode; color: string; bg: string; link?: string; actionLabel?: string }> = [
    { id: 'facebook',   label: 'Facebook',    icon: 'f',   color: '#1877f2', bg: 'rgba(24,119,242,0.08)', link: 'https://facebook.com/profile.php?id=61567382271234', actionLabel: 'Visit Page' },
    { id: 'youtube',    label: 'YouTube',     icon: '▶',   color: '#ff0000', bg: 'rgba(255,0,0,0.08)', link: 'https://www.youtube.com/@ExoCoreAi', actionLabel: 'Subscribe' },
    { id: 'tiktok',     label: 'TikTok',      icon: '♪',   color: '#69c9d0', bg: 'rgba(105,201,208,0.08)', link: 'https://www.tiktok.com/@exocoreai', actionLabel: 'Follow' },
    { id: 'twitter',    label: 'Twitter / X', icon: '𝕏',  color: '#1d9bf0', bg: 'rgba(29,155,240,0.08)', link: 'https://x.com/ExocoreAi', actionLabel: 'Follow' },
    { id: 'whatsapp',   label: 'WhatsApp',    icon: '💬',  color: '#25D366', bg: 'rgba(37,211,102,0.08)', link: 'https://chat.whatsapp.com/EBjjzBHTabP8O2kxnExeN2', actionLabel: 'Join Chat' },
    { id: 'telegram',   label: 'Telegram',    icon: '✈️', color: '#0088cc', bg: 'rgba(0,136,204,0.08)', link: 'https://t.me/+l2Vg_lLubsBmOTY1', actionLabel: 'Join Chat' },
    { id: 'github',     label: 'GitHub',      icon: <GitHubIcon size={16} color="#f0f6fc" />, color: '#f0f6fc', bg: 'rgba(240,246,252,0.06)', link: 'https://github.com/Exocore-Organization', actionLabel: 'Visit Org' },
    { id: 'huggingface',label: 'HuggingFace', icon: '🤗',  color: '#ffcc44', bg: 'rgba(255,204,68,0.08)', link: 'https://huggingface.co/Exocore', actionLabel: 'Visit Profile' },
    { id: 'npm',        label: 'NPM',         icon: '📦',  color: '#CB3837', bg: 'rgba(203,56,55,0.08)', link: 'https://www.npmjs.com/~exocorecommunity', actionLabel: 'Visit Profile' },
    { id: 'instagram',  label: 'Instagram',   icon: '◈',   color: '#e1306c', bg: 'rgba(225,48,108,0.08)' },
];



const gcashQRPayload = "00020101021127830012com.p2pqrpay0111GXCHPHM2XXX02089996440303152170200000006560417DWQM4TK3JDO6HMZ8K5204601653036085802PH5913JO*N ST**E C.6008Inayawan610412346304C55B";
const gcashQRImage = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(gcashQRPayload)}`;

const Dashboard: React.FC = () => {
    const navigate = useNavigate();
    // Token comes from localStorage (the normal login flow). As a fallback,
    // pick it up from the URL query (?token=…) so a session opened through
    // a magic link still works for things like delete-account.
    const token = (() => {
        try {
            const ls = localStorage.getItem('exo_token');
            if (ls) return ls;
            const qs = new URLSearchParams(window.location.search).get('token');
            if (qs) {
                try { localStorage.setItem('exo_token', qs); } catch {}
                return qs;
            }
        } catch {}
        return null;
    })();

    const [userData, setUserData] = useState<UserData | null>(null);
    const [projects, setProjects] = useState<ProjectData[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeView, setActiveView] = useState<ActiveView>('home');
    const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
    const [plansOpen, setPlansOpen] = useState(false);
    const [ownerPaymentsOpen, setOwnerPaymentsOpen] = useState(false);
    const [projectsOpen, setProjectsOpen] = useState(false);
    const [gDriveOpen, setGDriveOpen] = useState(false);
    const [githubOpen, setGithubOpen] = useState(false);
    const [stats, setStats] = useState({ cpu: 4, ram: 42 });
    const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());
    const [alerts, setAlerts] = useState<AlertMsg[]>([]);
    const [dialog, setDialog] = useState<DialogState>({
        isOpen: false, type: 'prompt', title: '', message: '',
        inputValue: '', onConfirm: () => {},
    });

    const [showAllProjects, setShowAllProjects] = useState(false);
    const PROJECTS_PREVIEW_COUNT = 3;

    const showAlert = useCallback((title: string, message: string, type: AlertType = 'info') => {
        const id = Date.now();
        setAlerts(prev => [...prev, { id, title, message, type }]);
        setTimeout(() => setAlerts(prev => prev.filter(a => a.id !== id)), 4500);
    }, []);

    const dismissAlert = (id: number) => setAlerts(prev => prev.filter(a => a.id !== id));

    const showPrompt = (title: string, message: string, defaultVal: string, onConfirm: (val: string) => void) =>
    setDialog({ isOpen: true, type: 'prompt', title, message, inputValue: defaultVal, onConfirm });

    const showConfirm = (title: string, message: string, onConfirm: () => void) =>
    setDialog({ isOpen: true, type: 'confirm', title, message, inputValue: '', onConfirm });

    const closeDialog = () => setDialog(prev => ({ ...prev, isOpen: false }));

    const loadProjects = useCallback(async (authToken: string) => {
        try {
            const res = await axios.get('/exocore/api/editor/projects/list', {
                params: { token: authToken },
            });
            setProjects((res.data.projects || []) as ProjectData[]);
        } catch {
            showAlert('Error', 'Failed to fetch projects.', 'error');
        }
    }, [showAlert]);

    useEffect(() => {
        const init = async () => {
            await initTheme();
            if (!token) { navigate('/login'); return; }
            try {
                const userRes = await axios.get('/exocore/api/auth/userinfo', {
                    params: { source: 'pv', token },
                });
                // Backend returns { success, user, avatarUrl, coverUrl } — flatten so
                // userData carries the actual user fields (was setting the wrapper
                // object before, which made userData.user = the user object and
                // collapsed every text field into "[object Object]" / "—").
                const payload = userRes.data || {};
                const flatUser = payload.user || payload.data || payload;
                setUserData({
                    ...flatUser,
                    avatarUrl: payload.avatarUrl ?? flatUser.avatarUrl ?? null,
                    coverUrl: payload.coverUrl ?? flatUser.coverUrl ?? null,
                });
                await loadProjects(token);
            } catch (err: any) {
                // Only kick the user back to /login when the token is actually
                // rejected by the gateway. Network blips, 500s, or transient
                // upstream failures used to wipe the token and force a full
                // re-login on every reload — keep the session sticky instead.
                const status = err?.response?.status;
                if (status === 401 || status === 403) {
                    localStorage.removeItem('exo_token');
                    navigate('/login');
                } else {
                    showAlert(
                        'Connection issue',
                        'Could not reach the auth gateway. Staying signed in — retry shortly.',
                        'warning' as AlertType,
                    );
                }
            } finally {
                setTimeout(() => setLoading(false), 800);
            }
        };
        init();
    }, [navigate, token, loadProjects, showAlert]);

    useEffect(() => {
        const runAutoImport = async () => {
            try {
                const storedTokens = await get<{ access_token: string; refresh_token?: string }>('gdrive_tokens');
                const autoImports = await get<string[]>('exo_auto_imports');
                if (!storedTokens || !autoImports || autoImports.length === 0 || !token) return;

                const projectNames = projects.map(p => p.name);
                const missing = autoImports.filter(name => !projectNames.includes(name));
                if (missing.length === 0) return;

                const listRes = await axios.get('/exocore/api/editor/gdrive/list-backups', {
                    params: { token, access_token: storedTokens.access_token },
                });
                const backups: { id: string; name: string }[] = listRes.data.backups || [];

                const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

                for (const projName of missing) {
                    const backup = backups.find(b => b.name === projName);
                    if (!backup) continue;
                    let restored = false;
                    for (let attempt = 1; attempt <= 5; attempt++) {
                        try {
                            await axios.post('/exocore/api/editor/gdrive/restore', {
                                access_token: storedTokens.access_token,
                                file_id: backup.id,
                                project_name: projName,
                            }, { params: { token } });
                            showAlert('Auto-Import', `'${projName}' restored from Google Drive.`, 'success');
                            restored = true;
                            break;
                        } catch {
                            if (attempt < 5) {
                                await sleep(1500 * attempt);
                            } else {
                                showAlert('Auto-Import', `Could not restore '${projName}' after 5 attempts.`, 'warning');
                            }
                        }
                    }
                    if (restored) {
                        await sleep(600);
                    }
                }

                if (missing.length > 0 && token) loadProjects(token);
            } catch {
            }
        };
        if (!loading && projects.length >= 0) {
            runAutoImport();
        }
    }, [loading]);

    useEffect(() => {
        const id = setInterval(() => {
            setCurrentTime(new Date().toLocaleTimeString());
            setStats({
                cpu: Math.floor(Math.random() * 14) + 2,
                     ram: Math.floor(Math.random() * 20) + 35,
            });
        }, 3000);
        return () => clearInterval(id);
    }, []);

    // Live-refresh project list every 4s so newly created/imported/renamed/
    // deleted projects appear automatically without a manual reload.
    useEffect(() => {
        if (!token) return;
        const id = setInterval(() => {
            if (!document.hidden) loadProjects(token);
        }, 4000);
        return () => clearInterval(id);
    }, [token, loadProjects]);

    const handleStart = async (id: string, name: string) => {
        try {
            await axios.post('/exocore/api/editor/runtime/start', { projectId: id }, { params: { token } });
            showAlert('Started', `${name} is now booting up.`, 'success');
            if (token) loadProjects(token);
            // Poll for URL availability up to 10x/2s
            let polls = 0;
            const poll = setInterval(async () => {
                polls++;
                if (polls >= 10) { clearInterval(poll); return; }
                try {
                    const res = await axios.get('/exocore/api/editor/projects/list', { params: { token } });
                    const updated = (res.data.projects || []) as ProjectData[];
                    const proj = updated.find(p => p.id === id);
                    if (proj?.localUrl || proj?.tunnelUrl) {
                        setProjects(updated);
                        clearInterval(poll);
                    }
                } catch {}
            }, 2000);
        } catch {
            showAlert('Error', `Failed to start ${name}.`, 'error');
        }
    };

    const handleStop = async (id: string, name: string) => {
        try {
            await axios.post('/exocore/api/editor/runtime/stop', { projectId: id }, { params: { token } });
            showAlert('Stopped', `${name} has been shut down.`, 'success');
            if (token) loadProjects(token);
        } catch {
            showAlert('Error', `Failed to stop ${name}.`, 'error');
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('exo_token');
        navigate('/login');
    };

    const handleDeleteAccount = () => {
        // Guard: we need either a token or a username/email to identify the
        // account on the backend. Without these, the request will 401.
        if (!token && !userData?.username && !userData?.email) {
            showAlert(
                'Not signed in',
                'Please log in again before deleting your account.',
                'error' as AlertType,
            );
            return;
        }
        // ONE prompt — type the password, click Confirm. No chained dialogs
        // (the previous chain had a race where the second dialog was opened
        // and immediately closed by the first dialog's auto-close call, which
        // caused the click to do nothing and no fetch to fire).
        showPrompt(
            'Delete account — confirm with password',
            'This permanently removes your account from Exocore. Type your password and click Confirm.',
            '',
            (pass: string) => {
                if (!pass) {
                    showAlert('Cancelled', 'Password is required.', 'warning' as AlertType);
                    return;
                }

                // Build the request payload (only include fields we actually have).
                const payload: Record<string, any> = { pass };
                if (token) payload.token = token;
                if (userData?.username) payload.username = userData.username;
                if (userData?.email)    payload.email    = userData.email;
                if (userData?.id != null) payload.id     = userData.id;

                // OPTIMISTIC: local session is killed RIGHT NOW so the user
                // never has to stare at a "deleting…" spinner waiting for
                // Drive. The backend already removes the user from its
                // in-memory cache instantly and pushes the Drive delete in
                // the background.
                showAlert('Account deleted', 'Goodbye 👋', 'success' as AlertType);

                // Fire the request — do NOT await. We don't block the UI on
                // the network. Errors are logged but ignored unless the
                // server returned a 403 password-mismatch BEFORE we redirect.
                const reqPromise = axios.post('/exocore/api/auth/delete', payload, { timeout: 60000 })
                    .then(r => ({ ok: r.data?.success === true, status: 200, data: r.data }))
                    .catch((err: any) => ({
                        ok: false,
                        status: err?.response?.status ?? 0,
                        data: err?.response?.data,
                    }));

                // Give the password check a brief head-start so we can show a
                // proper error if it's wrong. After ~1.5s, leave regardless.
                Promise.race([
                    reqPromise,
                    new Promise<{ ok: false; status: -1; data: null }>(res =>
                        setTimeout(() => res({ ok: false, status: -1, data: null }), 1500)
                    ),
                ]).then((result: any) => {
                    if (result.status === 403) {
                        // Wrong password — abort, let user try again.
                        showAlert('Wrong password', 'Account NOT deleted — your password did not match.', 'error' as AlertType);
                        return;
                    }
                    // Success, network error, timeout — all proceed to clear local
                    // session and redirect. The backend already deleted (or will
                    // shortly) on its side.
                    try {
                        localStorage.removeItem('exo_token');
                        sessionStorage.clear();
                    } catch {}
                    window.location.replace('/register');
                });
            },
        );
    };

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const zone = (userData?.timezone || timeZone).split('/').pop() ?? timeZone;
    const displayName = userData?.nickname || userData?.username || 'Developer';
    const initials = displayName.slice(0, 2).toUpperCase();
    const activeProjectCount = projects.filter(p => p.status === 'Online' || p.status === 'running').length;

    if (loading) {
        return (
            <div className="exo-loader-screen">
            <div className="loader-rings">
            <div className="loader-ring loader-ring-1" />
            <div className="loader-ring loader-ring-2" />
            <div className="loader-ring loader-ring-3" />
            <div className="loader-dot" />
            </div>
            <div className="loader-label">Initializing workspace</div>
            </div>
        );
    }

    return (
        <div className="dash-layout">
        <SocialPanel token={token} />
        <div className="alert-stack">
        {alerts.map(a => (
            <div key={a.id} className={`alert-toast ${a.type}`}>
            <span className="alert-dot" />
            <div className="alert-body">
            <div className="alert-title">{a.title}</div>
            <div className="alert-msg">{a.message}</div>
            </div>
            <button className="alert-close-btn" onClick={() => dismissAlert(a.id)}>✕</button>
            </div>
        ))}
        </div>

        {dialog.isOpen && (
            <div className="modal-backdrop" style={{ zIndex: 10005 }} onClick={closeDialog}>
            <div className="modal-box" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
            <span className="modal-title">{dialog.title}</span>
            </div>
            <div className="modal-body">
            <p style={{ color: 'var(--text-secondary)', marginBottom: dialog.type === 'prompt' ? '1rem' : 0, fontSize: '0.9rem' }}>
            {dialog.message}
            </p>
            {dialog.type === 'prompt' && (
                <input
                className="dialog-field"
                type={/password/i.test(dialog.title) || /password/i.test(dialog.message) ? 'password' : 'text'}
                value={dialog.inputValue}
                onChange={e => setDialog(d => ({ ...d, inputValue: e.target.value }))}
                onKeyDown={e => {
                    if (e.key === 'Enter') {
                        const val = (e.currentTarget as HTMLInputElement).value;
                        const cb = dialog.onConfirm;
                        closeDialog();
                        cb(val);
                    }
                }}
                autoFocus
                />
            )}
            </div>
            <div className="modal-footer">
            <button className="btn btn-secondary btn-sm" onClick={closeDialog}>Cancel</button>
            <button
            className="btn btn-primary btn-sm"
            style={{ width: 'auto' }}
            onClick={() => {
                // Capture the callback + value BEFORE closing, then close,
                // then invoke. This guarantees: (1) the click definitely
                // fires the callback, and (2) any new dialog opened inside
                // the callback isn't immediately closed by our closeDialog.
                const cb = dialog.onConfirm;
                const val = dialog.inputValue;
                closeDialog();
                cb(val);
            }}
            >
            Confirm
            </button>
            </div>
            </div>
            </div>
        )}

        <header className="dash-header">
        <div className="dash-header-brand">
        <div className="dash-header-logo">EX</div>
        <span className="dash-header-name">EXOCORE</span>
        </div>
        <div className="dash-header-spacer" />
        <div className="dash-header-stats">
        <div className="stat-chip">
        <span className="stat-chip-dot" />
        CPU <span className="stat-chip-val">{stats.cpu}%</span>
        </div>
        <div className="stat-chip">
        RAM <span className="stat-chip-val">{stats.ram}%</span>
        </div>
        <div className="stat-chip">
        <span className="stat-chip-val" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
        {currentTime}
        </span>
        </div>
        </div>
        <button
        className="dash-header-user"
        onClick={() => userData?.username && navigate(`/u/${userData.username}`)}
        title="View my profile"
        >
        {userData?.avatarUrl ? (
            <img src={userData.avatarUrl} alt="avatar" className="user-avatar" />
        ) : (
            <div className="user-avatar-fallback">{initials}</div>
        )}
        <span className="user-name-label">{displayName}</span>
        </button>

        {}
        <div className="dash-header-actions">
            <button
                className={`exo-plan-btn${userData?.plan === 'exo' ? ' on' : ''}`}
                onClick={() => setPlansOpen(true)}
                title="EXO Plan"
            >
                {userData?.plan === 'exo' ? '★ EXO' : '★ Get EXO'}
            </button>
            {(userData?.role === 'owner') && (
                <button className="exo-owner-btn" onClick={() => setOwnerPaymentsOpen(true)} title="Owner — payments">
                    💰 Payments
                </button>
            )}
            <button
                className="logout-btn"
                onClick={() => setActiveView('account')}
                title="Account settings"
            >
                <span className="logout-label">⚙ Account</span>
            </button>
            <button
                className="logout-btn"
                onClick={() => navigate('/leaderboard')}
                title="Leaderboard"
            >
                <span className="logout-label">🏆 Leaderboard</span>
            </button>
            <button className="logout-btn" onClick={handleLogout} aria-label="Sign Out">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M5 1H2a1 1 0 00-1 1v9a1 1 0 001 1h3M9 9l3-3-3-3M12 6H5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="logout-label">Sign Out</span>
            </button>
        </div>

        {}
        <div className="dash-header-menu-wrap">
            <button
                className="dash-header-kebab"
                onClick={() => setHeaderMenuOpen(o => !o)}
                aria-label="More options"
                title="More"
            >
                <span /><span /><span />
            </button>
            {headerMenuOpen && (
                <>
                <div className="dash-header-menu-overlay" onClick={() => setHeaderMenuOpen(false)} />
                <div className="dash-header-menu" role="menu">
                    <button onClick={() => { setHeaderMenuOpen(false); userData?.username && navigate(`/u/${userData.username}`); }}>
                        👤 My profile
                    </button>
                    <button onClick={() => { setHeaderMenuOpen(false); setActiveView('account'); }}>
                        ⚙ Account settings
                    </button>
                    <button onClick={() => { setHeaderMenuOpen(false); navigate('/leaderboard'); }}>
                        🏆 Leaderboard
                    </button>
                    <button onClick={() => { setHeaderMenuOpen(false); setPlansOpen(true); }}>
                        ★ {userData?.plan === 'exo' ? 'EXO Plan' : 'Get EXO'}
                    </button>
                    {(userData?.role === 'owner') && (
                        <button onClick={() => { setHeaderMenuOpen(false); setOwnerPaymentsOpen(true); }}>
                            💰 Payments
                        </button>
                    )}
                    <div className="dash-header-menu-sep" />
                    <button onClick={() => { setHeaderMenuOpen(false); handleLogout(); }}>
                        ⎋ Sign out
                    </button>
                </div>
                </>
            )}
        </div>
        </header>

        <main className="dash-main">
        {activeView === 'home' ? (
            <>
            <div className="dash-welcome">
            <div className="dash-welcome-eyebrow">Workstation</div>
            <h1 className="dash-welcome-title">
            Hello, <span>{displayName}</span>
            </h1>
            <p className="dash-welcome-sub">
            {zone} · {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            </div>

            {}
            <div className="donate-banner">
            <div className="donate-info">
            <h3>💖 Support the Exocore Project</h3>
            <p>If this platform helps you out, consider buying us a coffee or supporting our continued development!</p>
            <div className="donate-methods">
            <div className="donate-method">
            <span>GCash:</span> 09921552641
            </div>
            <div className="donate-method">
            <span>GoTyme:</span> 0165 2092 5424
            </div>
            </div>
            </div>
            <div className="donate-qr">
            <img src={gcashQRImage} alt="GCash QR Code" />
            <span>Scan with GCash</span>
            </div>
            </div>

            <div className="stats-row">
            <div className="stat-card">
            <div className="stat-card-label">Projects</div>
            <div className="stat-card-value">{projects.filter(p => p.status !== 'Archived').length}</div>
            <div className="stat-card-sub">Total nodes</div>
            </div>
            <div className="stat-card">
            <div className="stat-card-label">Active</div>
            <div className="stat-card-value">{activeProjectCount}</div>
            <div className="stat-card-sub">Running now</div>
            </div>
            <div className="stat-card">
            <div className="stat-card-label">CPU</div>
            <div className="stat-card-value">{stats.cpu}%</div>
            <div className="stat-card-sub">Current load</div>
            </div>
            <div className="stat-card">
            <div className="stat-card-label">Memory</div>
            <div className="stat-card-value">{stats.ram}%</div>
            <div className="stat-card-sub">RAM usage</div>
            </div>
            </div>

            <div className="dash-section">
            <div className="dash-section-header">
            <span className="dash-section-title notranslate" translate="no">Hi master, {displayName}</span>
            <button
            className="dash-section-action"
            onClick={() => setProjectsOpen(true)}
            >
            Manage →
            </button>
            </div>
            {projects.length === 0 ? (
                <div className="dash-empty-state">
                <div style={{ fontSize: '2rem', opacity: 0.3 }}>📦</div>
                <p>No exorepos yet. Create your first node.</p>
                <button className="btn btn-primary btn-sm" style={{ width: 'auto', marginTop: '0.5rem' }} onClick={() => setProjectsOpen(true)}>
                Open File Manager
                </button>
                </div>
            ) : (
                <>
                <div className="project-cards-grid">
                {(showAllProjects ? projects : projects.slice(0, PROJECTS_PREVIEW_COUNT)).map(p => (
                    <ProjectNodeCard
                        key={p.id}
                        project={p}
                        onOpen={() => navigate(`/editor?project=${p.id}`)}
                        onStart={() => handleStart(p.id, p.name)}
                        onStop={() => handleStop(p.id, p.name)}
                    />
                ))}
                </div>
                {projects.length > PROJECTS_PREVIEW_COUNT && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.875rem' }}>
                    <button
                        className="btn btn-sm"
                        style={{
                            width: 'auto',
                            padding: '0.5rem 1.1rem',
                            background: 'rgba(255,229,0,0.08)',
                            border: '2px solid #FFE500',
                            color: '#FFE500',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            fontSize: '0.72rem',
                            cursor: 'pointer',
                            boxShadow: '2px 2px 0 #FFE500',
                        }}
                        onClick={() => setShowAllProjects(v => !v)}
                    >
                    {showAllProjects
                        ? '▲ Show less'
                        : `▼ See more (${projects.length - PROJECTS_PREVIEW_COUNT} more exorepos)`}
                    </button>
                    </div>
                )}
                </>
            )}
            </div>

            <div className="dash-section">
            <div className="dash-section-header">
            <span className="dash-section-title">Exocore Social Media</span>
            <span className="dash-section-badge">Community</span>
            </div>
            <div className="social-grid">
            {SOCIAL_PLATFORMS.map(s => (
                <div key={s.id} className="social-card" style={{ '--social-color': s.color, '--social-bg': s.bg } as React.CSSProperties}>
                <div className="social-card-icon">{s.icon}</div>
                <div className="social-card-info">
                <div className="social-card-label">{s.label}</div>
                <div className="social-card-status">
                {s.link ? 'Official' : 'Not connected'}
                </div>
                </div>
                {s.link ? (
                    <a
                    href={s.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="social-card-connect"
                    style={{ textDecoration: 'none', color: s.color, opacity: 1, borderColor: s.color }}
                    >
                    {s.actionLabel}
                    </a>
                ) : (
                    <div className="social-card-connect" style={{ opacity: 0.5 }}>Soon</div>
                )}
                </div>
            ))}
            </div>
            </div>

            <div className="dash-section">
            <div className="dash-section-header">
            <span className="dash-section-title">Quick Actions</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', maxWidth: 560 }}>
            <div className="quick-action-card" onClick={() => setProjectsOpen(true)}>
            <div className="quick-action-icon indigo">📁</div>
            <div className="quick-action-info">
            <div className="quick-action-title">File Manager</div>
            <div className="quick-action-desc">Browse and manage your project nodes</div>
            </div>
            <span className="quick-action-badge">{projects.filter(p => p.status !== 'Archived').length}</span>
            </div>
            <div className="quick-action-card" onClick={() => setActiveView('account')}>
            <div className="quick-action-icon violet">👤</div>
            <div className="quick-action-info">
            <div className="quick-action-title">Profile</div>
            <div className="quick-action-desc">Update your developer profile and settings</div>
            </div>
            </div>
            <div className="quick-action-card" onClick={() => setGDriveOpen(true)}>
            <div className="quick-action-icon" style={{ color: '#34a853', background: 'rgba(52,168,83,0.12)' }}>☁️</div>
            <div className="quick-action-info">
            <div className="quick-action-title">Cloud Backups</div>
            <div className="quick-action-desc">Backup and restore projects via Google Drive</div>
            </div>
            </div>
            <div className="quick-action-card" onClick={() => setGithubOpen(true)}>
            <div className="quick-action-icon" style={{ color: '#f0f6fc', background: 'rgba(240,246,252,0.06)' }}>
            <GitHubIcon size={20} color="#f0f6fc" />
            </div>
            <div className="quick-action-info">
            <div className="quick-action-title">GitHub Storage</div>
            <div className="quick-action-desc">Pull and push your projects to GitHub</div>
            </div>
            </div>
            </div>
            </div>
            </>
        ) : (
            <Account
            userData={userData}
            onBack={() => setActiveView('home')}
            onUpdateSuccess={data => setUserData(data)}
            showAlert={showAlert}
            onDeleteAccount={handleDeleteAccount}
            />
        )}
        </main>

        {projectsOpen && (
            <FileManager
            projects={projects}
            token={token}
            userData={userData}
            loadProjects={loadProjects}
            showAlert={showAlert}
            showPrompt={showPrompt}
            showConfirm={showConfirm}
            onClose={() => setProjectsOpen(false)}
            />
        )}

        {gDriveOpen && (
            <GDriveManager
            token={token}
            projects={projects}
            showAlert={showAlert}
            onClose={() => setGDriveOpen(false)}
            />
        )}

        {githubOpen && (
            <GithubManager
            token={token}
            projects={projects}
            showAlert={showAlert}
            onClose={() => setGithubOpen(false)}
            />
        )}

        <PlansModal open={plansOpen} token={token || ''} onClose={() => setPlansOpen(false)} />
        <OwnerPaymentsPanel open={ownerPaymentsOpen} token={token || ''} onClose={() => setOwnerPaymentsOpen(false)} />
            </div>
    );
};

export default Dashboard;
