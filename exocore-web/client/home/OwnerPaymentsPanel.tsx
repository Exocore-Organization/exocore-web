import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface OwnerPayment {
    id: string; ts: number; username: string; email: string;
    plan: string; amount: number; currency: string; method: string;
    proofUrl?: string | null; note?: string;
    status: 'pending' | 'approved' | 'rejected';
    decidedAt?: number; decidedBy?: string; reason?: string;
}

interface AuditEntry {
    id: string; ts: number; by: string; action: string;
    target?: string; meta?: Record<string, unknown>;
}

type Tab = 'pending' | 'all' | 'audit' | 'mod';

const OwnerPaymentsPanel: React.FC<{ open: boolean; token: string; onClose: () => void }> = ({ open, token, onClose }) => {
    const [tab, setTab] = useState<Tab>('pending');
    const [items, setItems] = useState<OwnerPayment[]>([]);
    const [audit, setAudit] = useState<AuditEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    // Mod-action form state
    const [muteUser, setMuteUser] = useState('');
    const [muteMins, setMuteMins] = useState(15);
    const [muteReason, setMuteReason] = useState('');
    const [banUser, setBanUser] = useState('');
    const [banDays, setBanDays] = useState<string>('1');
    const [banReason, setBanReason] = useState('');

    const load = async () => {
        setLoading(true); setErr(null);
        try {
            if (tab === 'pending' || tab === 'all') {
                const r = await axios.get('/exocore/api/auth/plans/pending', { params: { token, status: tab } });
                if (r.data?.success) setItems(r.data.payments || []);
                else setErr(r.data?.message || 'failed');
            } else if (tab === 'audit') {
                const r = await axios.get('/exocore/api/auth/audit', { params: { token, limit: 200 } });
                if (r.data?.success) setAudit(r.data.entries || []);
                else setErr(r.data?.message || 'failed');
            }
        } catch (e: any) {
            setErr(e?.response?.data?.message || 'failed');
        } finally { setLoading(false); }
    };

    useEffect(() => { if (open && token) load(); /* eslint-disable-next-line */ }, [open, token, tab]);

    if (!open) return null;

    const decide = async (id: string, decision: 'approve' | 'reject') => {
        let reason: string | undefined;
        if (decision === 'reject') {
            reason = prompt('Reason for rejection?') || undefined;
            if (!reason) return;
        }
        setBusy(id);
        try {
            await axios.post('/exocore/api/auth/plans/decide', { token, paymentId: id, decision, reason });
            await load();
        } catch (e: any) { alert(e?.response?.data?.message || 'failed'); }
        finally { setBusy(null); }
    };

    const submitMute = async () => {
        if (!muteUser.trim()) return;
        setBusy('mute');
        try {
            const r = await axios.post('/exocore/api/admin/mute', {
                token, target: muteUser.trim(), minutes: muteMins, reason: muteReason.trim() || undefined,
            });
            if (r.data?.success) {
                alert(muteMins > 0 ? `Muted @${muteUser} for ${muteMins} min` : `Mute lifted on @${muteUser}`);
                setMuteUser(''); setMuteReason('');
            } else alert(r.data?.message || 'failed');
        } catch (e: any) { alert(e?.response?.data?.message || 'failed'); }
        finally { setBusy(null); }
    };

    const submitBan = async () => {
        if (!banUser.trim()) return;
        const days: number | string = banDays === 'perm' ? 'perm' : Number(banDays);
        setBusy('ban');
        try {
            const r = await axios.post('/exocore/api/admin/ban', {
                token, target: banUser.trim(), days, reason: banReason.trim() || undefined,
            });
            if (r.data?.success) {
                alert(days === 0 ? `Unbanned @${banUser}` : `Banned @${banUser} (${days})`);
                setBanUser(''); setBanReason('');
            } else alert(r.data?.message || 'failed');
        } catch (e: any) { alert(e?.response?.data?.message || 'failed'); }
        finally { setBusy(null); }
    };

    return (
        <div className="plans-overlay" onClick={onClose}>
            <div className="plans-modal owner" onClick={e => e.stopPropagation()}>
                <header className="plans-head">
                    <h2>Owner tools</h2>
                    <button className="plans-x" onClick={onClose} aria-label="Close">✕</button>
                </header>
                <div className="plans-tabs">
                    <button className={tab === 'pending' ? 'on' : ''} onClick={() => setTab('pending')}>Pending</button>
                    <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>All payments</button>
                    <button className={tab === 'mod' ? 'on' : ''} onClick={() => setTab('mod')}>Moderate</button>
                    <button className={tab === 'audit' ? 'on' : ''} onClick={() => setTab('audit')}>Audit log</button>
                </div>

                {err && <div className="plans-err">{err}</div>}
                {loading && <div className="plans-loading">Loading…</div>}

                {(tab === 'pending' || tab === 'all') && !loading && (
                    <>
                        {items.length === 0 && <div className="plans-loading">No payments {tab === 'pending' ? 'pending' : 'yet'}.</div>}
                        <div className="own-list">
                            {items.map(p => (
                                <div key={p.id} className={`own-card st-${p.status}`}>
                                    <div className="own-row">
                                        <div>
                                            <div className="own-user">@{p.username}</div>
                                            <div className="own-meta">{new Date(p.ts).toLocaleString()} · {p.email}</div>
                                        </div>
                                        <div className="own-amt">
                                            {p.currency} {p.amount}
                                            <span className="own-method">{p.method.toUpperCase()}</span>
                                        </div>
                                    </div>
                                    {p.proofUrl && (
                                        <a href={p.proofUrl} target="_blank" rel="noreferrer" className="own-proof">
                                            <img src={p.proofUrl} alt="proof" loading="lazy" />
                                        </a>
                                    )}
                                    {p.note && <div className="own-note">📝 {p.note}</div>}
                                    <div className="own-status-row">
                                        <span className={`plans-row-status st-${p.status}`}>{p.status}</span>
                                        {p.reason && <span className="own-reason">— {p.reason}</span>}
                                        {p.decidedBy && <span className="own-decided">by @{p.decidedBy}</span>}
                                    </div>
                                    {p.status === 'pending' && (
                                        <div className="own-actions">
                                            <button className="plans-submit ok" disabled={busy === p.id}
                                                onClick={() => decide(p.id, 'approve')}>Approve</button>
                                            <button className="plans-submit bad" disabled={busy === p.id}
                                                onClick={() => decide(p.id, 'reject')}>Reject</button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {tab === 'mod' && (
                    <div className="own-list">
                        <div className="own-card">
                            <div className="own-user">Mute (timed restrict)</div>
                            <div className="own-meta">Sets restrictedUntil; user can read but not chat/DM.</div>
                            <input className="plans-input" placeholder="username" value={muteUser}
                                onChange={e => setMuteUser(e.target.value)} />
                            <input className="plans-input" type="number" min={0} placeholder="minutes (0 = unmute)"
                                value={muteMins} onChange={e => setMuteMins(Number(e.target.value || 0))} />
                            <input className="plans-input" placeholder="reason (optional)" value={muteReason}
                                onChange={e => setMuteReason(e.target.value)} />
                            <button className="plans-submit ok" disabled={busy === 'mute'} onClick={submitMute}>
                                {muteMins > 0 ? `Mute ${muteMins} min` : 'Lift mute'}
                            </button>
                        </div>
                        <div className="own-card">
                            <div className="own-user">Ban</div>
                            <div className="own-meta">Days, 0 = unban, or "perm" for permanent.</div>
                            <input className="plans-input" placeholder="username" value={banUser}
                                onChange={e => setBanUser(e.target.value)} />
                            <input className="plans-input" placeholder='days (number) or "perm"' value={banDays}
                                onChange={e => setBanDays(e.target.value)} />
                            <input className="plans-input" placeholder="reason (optional)" value={banReason}
                                onChange={e => setBanReason(e.target.value)} />
                            <button className="plans-submit bad" disabled={busy === 'ban'} onClick={submitBan}>
                                {banDays === '0' ? 'Unban' : `Ban (${banDays})`}
                            </button>
                        </div>
                    </div>
                )}

                {tab === 'audit' && !loading && (
                    <div className="own-list">
                        {audit.length === 0 && <div className="plans-loading">No audit entries yet.</div>}
                        {audit.map(a => (
                            <div key={a.id} className="own-card">
                                <div className="own-row">
                                    <div>
                                        <div className="own-user">{a.action}</div>
                                        <div className="own-meta">
                                            {new Date(a.ts).toLocaleString()} · by @{a.by}
                                            {a.target ? ` → @${a.target}` : ''}
                                        </div>
                                    </div>
                                </div>
                                {a.meta && Object.keys(a.meta).length > 0 && (
                                    <pre className="own-note" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
                                        {JSON.stringify(a.meta, null, 2)}
                                    </pre>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default OwnerPaymentsPanel;
