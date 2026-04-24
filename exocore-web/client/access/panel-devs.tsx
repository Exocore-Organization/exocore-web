import React, { useState, useEffect, useCallback } from 'react';
import { set as idbSet, del as idbDel } from 'idb-keyval';
import { setPanelToken, getPanelToken } from './panelAuth';
import { rpc } from './rpcClient';

// Re-export the IDB getter under the legacy name used inside this file.
async function idbGet<T = string>(_key?: string): Promise<T | null> {
    return (await getPanelToken()) as unknown as T | null;
}

const TOKEN_KEY = 'exocore_panel_token';

type GateStatus = 'loading' | 'setup' | 'login' | 'authenticated';

// Token bootstrap + axios auth wiring lives in `panelAuth.ts` and runs at
// app boot via main.tsx, so all we do here is delegate to it.
const setAxiosAuth = (token: string | null) => setPanelToken(token);

function getErrMsg(err: unknown, fallback: string): string {
    if (err && typeof err === 'object' && 'message' in err) {
        const m = (err as { message?: unknown }).message;
        if (typeof m === 'string' && m.trim()) return m;
    }
    return fallback;
}

export default function PanelDevsGuard({ children }: { children: React.ReactNode }) {
    const [status, setStatus] = useState<GateStatus>('loading');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 720);

    const [user, setUser] = useState('');
    const [pass, setPass] = useState('');
    const [confirmPass, setConfirmPass] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    // Brute-force lockout countdown — set when the server returns 429.
    const [lockedUntil, setLockedUntil] = useState<number>(0);
    const [, setNowTick] = useState(0);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 720);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Re-render every second while the lockout countdown is active so the
    // displayed seconds tick down and the button re-enables on expiry.
    useEffect(() => {
        if (lockedUntil <= Date.now()) return;
        const id = window.setInterval(() => {
            if (Date.now() >= lockedUntil) {
                setLockedUntil(0);
                setError('');
            }
            setNowTick(t => t + 1);
        }, 500);
        return () => window.clearInterval(id);
    }, [lockedUntil]);

    const lockSecondsLeft = lockedUntil > 0
        ? Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000))
        : 0;
    const isLocked = lockSecondsLeft > 0;

    const probe = useCallback(async () => {
        try {
            const token = await idbGet<string>(TOKEN_KEY);
            const statusRes = await rpc.call<{ initialized: boolean }>('devAccess.status');
            if (!statusRes.initialized) {
                setStatus('setup');
                return;
            }
            if (token) {
                setAxiosAuth(token);
                const meRes = await rpc.call<{ authenticated: boolean }>('devAccess.me', { token });
                if (meRes.authenticated) {
                    setStatus('authenticated');
                    return;
                }
                await idbDel(TOKEN_KEY);
                setAxiosAuth(null);
            }
            setStatus('login');
        } catch (err) {
            setError(getErrMsg(err, 'Cannot reach the developer-gate backend. Retrying…'));
            setTimeout(probe, 2000);
        }
    }, []);

    useEffect(() => {
        probe();
    }, [probe]);

    const handleSetup = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (user.trim().length < 3) { setError('Username must be at least 3 characters.'); return; }
        if (pass.length < 4) { setError('Password must be at least 4 characters.'); return; }
        if (pass !== confirmPass) { setError('Passwords do not match.'); return; }

        setSubmitting(true);
        try {
            const res = await rpc.call<{ success: true; token: string }>('devAccess.setup', {
                user: user.trim(), pass,
            });
            await idbSet(TOKEN_KEY, res.token);
            setAxiosAuth(res.token);
            // First-time creation → take them straight to the dashboard.
            window.location.href = '/exocore/dashboard';
        } catch (err) {
            setError(getErrMsg(err, 'Could not create panel account.'));
            setSubmitting(false);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (isLocked) return;
        if (!user.trim() || !pass) { setError('Enter your username and password.'); return; }

        setSubmitting(true);
        try {
            const res = await rpc.call<{ success: true; token: string }>('devAccess.login', {
                user: user.trim(), pass,
            });
            await idbSet(TOKEN_KEY, res.token);
            setAxiosAuth(res.token);
            setStatus('authenticated');
        } catch (err) {
            // The server returns a 429 with { lockedUntil } when the IP has
            // tripped the brute-force threshold. Surface a live countdown so
            // the user knows exactly when the form will re-enable.
            const data = (err as { data?: { lockedUntil?: number } })?.data;
            if (data && typeof data.lockedUntil === 'number' && data.lockedUntil > Date.now()) {
                setLockedUntil(data.lockedUntil);
            }
            setError(getErrMsg(err, 'Invalid credentials.'));
            setSubmitting(false);
        }
    };

    if (status === 'loading') {
        return (
            <div style={loadingStyle}>
                <div style={spinnerStyle} />
                <div style={loadingTextStyle}>Booting Exocore…</div>
                <style>{`@keyframes exo-gate-spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }
    if (status === 'authenticated') return <><PanelIpAlarm />{children}</>;

    const isSetup = status === 'setup';

    return (
        <div style={overlayStyle}>
            <div style={{ ...cardStyle, flexDirection: isMobile ? 'column' : 'row' }}>
                {/* Left — info */}
                <div style={{
                    ...leftPaneStyle,
                    width: isMobile ? '100%' : '46%',
                    borderRight: isMobile ? 'none' : '2px solid #222',
                    borderBottom: isMobile ? '2px solid #222' : 'none',
                }}>
                    <div style={{
                        ...badgeStyle,
                        borderColor: isSetup ? '#FFE500' : '#00FF94',
                        boxShadow: `3px 3px 0 ${isSetup ? '#FFE500' : '#00FF94'}`,
                        color: isSetup ? '#FFE500' : '#00FF94',
                    }}>
                        <span style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: isSetup ? '#FFE500' : '#00FF94',
                        }} />
                        {isSetup ? 'FIRST RUN' : 'READY'}
                    </div>

                    <div style={brandRowStyle}>
                        <div style={brandMarkStyle}>EX</div>
                        <div>
                            <div style={brandNameStyle}>EXOCORE</div>
                            <div style={brandSubStyle}>Developer Gate</div>
                        </div>
                    </div>

                    <h1 style={titleStyle}>
                        {isSetup ? 'Create your panel account' : 'Welcome back'}
                    </h1>
                    <p style={leadStyle}>
                        {isSetup
                            ? 'This is the first time the developer panel is being opened on this server. Create the master account that unlocks Exocore. Your credentials are stored locally in '
                            : 'Sign in with your panel credentials to unlock the Exocore workspace. Forgotten the password? Delete '}
                        <code style={inlineCodeStyle}>devs.json</code>
                        {isSetup
                            ? ' so only this server can authenticate you.'
                            : ' on the server to start over.'}
                    </p>

                    <ul style={listStyle}>
                        <li>Server APIs are sealed behind this gate.</li>
                        <li>Direct API calls without a session token are rejected.</li>
                        <li>One account per server, stored as a salted SHA-256 hash.</li>
                    </ul>
                </div>

                {/* Right — form */}
                <div style={{
                    ...rightPaneStyle,
                    width: isMobile ? '100%' : '54%',
                    padding: isMobile ? '24px' : '40px',
                }}>
                    <form onSubmit={isSetup ? handleSetup : handleLogin} style={formStyle}>
                        <div style={formTitleStyle}>
                            {isSetup ? 'Create user & password' : 'Panel sign in'}
                        </div>

                        {error && (
                            <div style={errorBoxStyle}>{error}</div>
                        )}

                        <label style={fieldLabelStyle}>Username</label>
                        <input
                            type="text"
                            placeholder="e.g. admin"
                            value={user}
                            onChange={e => setUser(e.target.value)}
                            autoFocus
                            autoComplete="username"
                            style={inputStyle}
                            onFocus={focusOn}
                            onBlur={focusOff}
                        />

                        <label style={fieldLabelStyle}>Password</label>
                        <div style={passWrapStyle}>
                            <input
                                type={showPass ? 'text' : 'password'}
                                placeholder={isSetup ? 'Choose a strong password' : 'Enter your password'}
                                value={pass}
                                onChange={e => setPass(e.target.value)}
                                autoComplete={isSetup ? 'new-password' : 'current-password'}
                                style={{ ...inputStyle, paddingRight: 44, width: '100%', boxSizing: 'border-box' }}
                                onFocus={focusOn}
                                onBlur={focusOff}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPass(s => !s)}
                                aria-label={showPass ? 'Hide password' : 'Show password'}
                                style={eyeBtnStyle}
                            >
                                {showPass ? EyeOffIcon : EyeIcon}
                            </button>
                        </div>

                        {isSetup && (
                            <>
                                <label style={fieldLabelStyle}>Confirm Password</label>
                                <div style={passWrapStyle}>
                                    <input
                                        type={showConfirm ? 'text' : 'password'}
                                        placeholder="Repeat password"
                                        value={confirmPass}
                                        onChange={e => setConfirmPass(e.target.value)}
                                        autoComplete="new-password"
                                        style={{ ...inputStyle, paddingRight: 44, width: '100%', boxSizing: 'border-box' }}
                                        onFocus={focusOn}
                                        onBlur={focusOff}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirm(s => !s)}
                                        aria-label={showConfirm ? 'Hide password' : 'Show password'}
                                        style={eyeBtnStyle}
                                    >
                                        {showConfirm ? EyeOffIcon : EyeIcon}
                                    </button>
                                </div>
                            </>
                        )}

                        <button
                            type="submit"
                            disabled={submitting || isLocked}
                            style={{
                                ...submitStyle,
                                opacity: (submitting || isLocked) ? 0.55 : 1,
                                cursor: (submitting || isLocked) ? 'not-allowed' : 'pointer',
                                background: isLocked ? '#3a2a2a' : submitStyle.background,
                                color: isLocked ? '#FF6B6B' : submitStyle.color,
                                borderColor: isLocked ? '#FF3B3B' : submitStyle.borderColor,
                                boxShadow: isLocked ? '4px 4px 0 #FF3B3B' : submitStyle.boxShadow,
                            }}
                        >
                            {isLocked
                                ? `Locked — retry in ${lockSecondsLeft}s`
                                : submitting
                                    ? (isSetup ? 'Creating account…' : 'Signing in…')
                                    : (isSetup ? 'Create & Enter Dashboard' : 'Unlock Panel')}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}

/* ---------- IP-change alarm banner (shown across all panel pages) ---------- */
interface PanelMeta {
    issuedAt: string;
    lastSeenAt: string;
    ip: string | null;
    ua: string | null;
    previousIp: string | null;
    lastIpChangeAt: string | null;
}

function PanelIpAlarm() {
    const [meta, setMeta] = useState<PanelMeta | null>(null);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const tok = await getPanelToken();
                if (!tok) return;
                const res = await rpc.call<{ success?: boolean; meta?: PanelMeta }>('devAccess.session', { token: tok });
                if (!alive || !res?.success || !res.meta) return;
                setMeta(res.meta);
                if (res.meta.lastIpChangeAt) {
                    const seenKey = `exocore_panel_ipalarm_seen:${res.meta.lastIpChangeAt}`;
                    if (sessionStorage.getItem(seenKey) === '1') setDismissed(true);
                }
            } catch { /* not authed yet — nothing to alarm about */ }
        })();
        return () => { alive = false; };
    }, []);

    if (!meta || !meta.lastIpChangeAt || !meta.previousIp) return null;
    // Only alarm if the change happened in the last 24h.
    const ageMs = Date.now() - new Date(meta.lastIpChangeAt).getTime();
    if (ageMs > 24 * 3600 * 1000) return null;
    if (dismissed) return null;

    const dismiss = () => {
        sessionStorage.setItem(`exocore_panel_ipalarm_seen:${meta.lastIpChangeAt}`, '1');
        setDismissed(true);
    };

    const revoke = async () => {
        try {
            const tok = await getPanelToken();
            if (tok) await rpc.call('devAccess.logout', { token: tok }).catch(() => null);
        } catch { /* ignore */ }
        try { await idbDel(TOKEN_KEY); } catch { /* ignore */ }
        setPanelToken(null);
        window.location.href = '/exocore';
    };

    return (
        <div style={alarmBarStyle}>
            <div style={alarmInnerStyle}>
                <span style={alarmTagStyle}>SECURITY</span>
                <span style={alarmTextStyle}>
                    Panel token used from a new IP&nbsp;
                    <code style={alarmCodeStyle}>{meta.ip || 'unknown'}</code>
                    &nbsp;(was&nbsp;
                    <code style={alarmCodeStyle}>{meta.previousIp}</code>
                    ). If this wasn't you, revoke now.
                </span>
                <button onClick={revoke} style={alarmRevokeStyle}>Revoke</button>
                <button onClick={dismiss} style={alarmDismissStyle}>Dismiss</button>
            </div>
        </div>
    );
}

const alarmBarStyle: React.CSSProperties = {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10000,
    background: '#FFE500', borderBottom: '2px solid #000',
    boxShadow: '0 3px 0 #000', fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
};
const alarmInnerStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    padding: '8px 16px', color: '#000', fontSize: 12, fontWeight: 600,
};
const alarmTagStyle: React.CSSProperties = {
    background: '#000', color: '#FFE500', padding: '2px 8px',
    fontSize: 10, fontWeight: 900, letterSpacing: '0.18em',
};
const alarmTextStyle: React.CSSProperties = { flex: 1, minWidth: 220, lineHeight: 1.4 };
const alarmCodeStyle: React.CSSProperties = {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
    background: '#000', color: '#FFE500', padding: '1px 6px',
};
const alarmRevokeStyle: React.CSSProperties = {
    background: '#000', color: '#FFE500', border: '2px solid #000',
    padding: '4px 12px', fontWeight: 900, fontSize: 10, letterSpacing: '0.16em',
    textTransform: 'uppercase', cursor: 'pointer',
};
const alarmDismissStyle: React.CSSProperties = {
    background: 'transparent', color: '#000', border: '2px solid #000',
    padding: '4px 12px', fontWeight: 900, fontSize: 10, letterSpacing: '0.16em',
    textTransform: 'uppercase', cursor: 'pointer',
};

/* ---------- styles ---------- */
const loadingStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: '#0a0a0a', color: '#FFE500',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 14, fontFamily: "'IBM Plex Sans', system-ui, sans-serif", zIndex: 9999,
};
const spinnerStyle: React.CSSProperties = {
    width: 38, height: 38, border: '3px solid #2a2a2a',
    borderTopColor: '#FFE500', borderRadius: '50%',
    animation: 'exo-gate-spin 0.9s linear infinite',
};
const loadingTextStyle: React.CSSProperties = {
    fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#888', fontWeight: 700,
};
const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, backgroundColor: '#0a0a0a', zIndex: 9999,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
};
const cardStyle: React.CSSProperties = {
    display: 'flex', width: '100%', maxWidth: 1060,
    minHeight: 520, border: '2px solid #2a2a2a',
    boxShadow: '6px 6px 0 0 #FFE500', overflow: 'hidden', background: '#111',
};
const leftPaneStyle: React.CSSProperties = {
    background: '#0d0d0d', padding: 28,
    display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto',
};
const badgeStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '5px 12px', border: '2px solid', fontSize: 10,
    fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase',
    alignSelf: 'flex-start',
};
const brandRowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, marginTop: 6,
};
const brandMarkStyle: React.CSSProperties = {
    width: 34, height: 34, background: '#FFE500',
    border: '2px solid #000', boxShadow: '3px 3px 0 #000',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 900, fontSize: 12, color: '#000',
};
const brandNameStyle: React.CSSProperties = {
    fontWeight: 900, fontSize: 11, letterSpacing: '0.22em',
    textTransform: 'uppercase', color: '#f0f0f0',
};
const brandSubStyle: React.CSSProperties = {
    fontSize: 9, color: '#555', letterSpacing: '0.14em',
    textTransform: 'uppercase', fontWeight: 700, marginTop: 1,
};
const titleStyle: React.CSSProperties = {
    fontSize: 22, fontWeight: 800, color: '#f0f0f0',
    margin: '4px 0 0', lineHeight: 1.2, letterSpacing: '-0.01em',
};
const leadStyle: React.CSSProperties = {
    fontSize: 13, lineHeight: 1.7, color: '#888', margin: 0,
};
const inlineCodeStyle: React.CSSProperties = {
    color: '#FFE500', fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12, padding: '0 4px',
};
const listStyle: React.CSSProperties = {
    margin: '4px 0 0', padding: '0 0 0 18px',
    color: '#666', fontSize: 12, lineHeight: 1.8,
};
const rightPaneStyle: React.CSSProperties = {
    background: '#111', display: 'flex', flexDirection: 'column',
    justifyContent: 'center', overflowY: 'auto',
};
const formStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: 10,
};
const formTitleStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 900, letterSpacing: '0.04em',
    color: '#f0f0f0', marginBottom: 6,
};
const fieldLabelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 800, letterSpacing: '0.14em',
    textTransform: 'uppercase', color: '#666', marginTop: 4,
};
const inputStyle: React.CSSProperties = {
    padding: '12px 14px', background: '#0d0d0d',
    border: '2px solid #2a2a2a', color: '#f0f0f0',
    fontSize: 14, fontFamily: "'IBM Plex Sans', sans-serif",
    outline: 'none', borderRadius: 0,
};
const submitStyle: React.CSSProperties = {
    marginTop: 14, padding: 14, background: '#FFE500',
    border: '2px solid #000', boxShadow: '4px 4px 0 #000',
    color: '#000', fontWeight: 900, fontSize: 11,
    letterSpacing: '0.18em', textTransform: 'uppercase',
    fontFamily: "'IBM Plex Sans', sans-serif", borderRadius: 0,
    transition: '0.1s ease',
};
const errorBoxStyle: React.CSSProperties = {
    padding: '10px 14px', background: 'rgba(255,59,59,0.08)',
    border: '2px solid #FF3B3B', color: '#FF3B3B',
    fontSize: 12, fontWeight: 600, boxShadow: '3px 3px 0 #FF3B3B',
};

function focusOn(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = '#FFE500';
    e.currentTarget.style.boxShadow = '3px 3px 0 #FFE500';
}
function focusOff(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = '#2a2a2a';
    e.currentTarget.style.boxShadow = 'none';
}

const passWrapStyle: React.CSSProperties = { position: 'relative', display: 'block' };
const eyeBtnStyle: React.CSSProperties = {
    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
    background: 'transparent', border: 'none', color: '#888',
    cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center',
    justifyContent: 'center', borderRadius: 0,
};

const EyeIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
    </svg>
);
const EyeOffIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
        <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
);
