import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import './plans.css';

interface PlanInfo {
    id: string; name: string; durationDays: number;
    basePricePHP: number; localCurrency: string; localPrice: number; fxRate: number;
}
interface CatalogResp {
    success: boolean;
    plans: PlanInfo[];
    payment: {
        gcash: { name: string; number: string; qrPayload: string };
        gotyme: { name: string; number: string };
    };
    me: { plan: string; planExpiresAt: number | null; pendingPaymentId: string | null } | null;
}
interface MyPayment {
    id: string; ts: number; plan: string; amount: number; currency: string;
    method: string; status: 'pending' | 'approved' | 'rejected';
    reason?: string; proofUrl?: string | null; decidedAt?: number;
}
interface MeResp {
    success: boolean; plan: string; planExpiresAt: number | null;
    pendingPaymentId: string | null; payments: MyPayment[];
}

const fmtDate = (ts: number) => new Date(ts).toLocaleString();

const PlansModal: React.FC<{ open: boolean; token: string; onClose: () => void }> = ({ open, token, onClose }) => {
    const [catalog, setCatalog] = useState<CatalogResp | null>(null);
    const [me, setMe] = useState<MeResp | null>(null);
    const [method, setMethod] = useState<'gcash' | 'gotyme'>('gcash');
    const [note, setNote] = useState('');
    const [proof, setProof] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [ok, setOk] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement | null>(null);

    const reload = async () => {
        try {
            const [c, m] = await Promise.all([
                axios.get<CatalogResp>('/exocore/api/auth/plans/catalog', { params: { token } }),
                axios.get<MeResp>('/exocore/api/auth/plans/me', { params: { token } }),
            ]);
            setCatalog(c.data); setMe(m.data);
        } catch (e: any) {
            setErr(e?.response?.data?.message || 'failed to load plans');
        }
    };

    useEffect(() => { if (open && token) { setErr(null); setOk(null); reload(); } /* eslint-disable-next-line */ }, [open, token]);

    if (!open) return null;
    const plan = catalog?.plans?.[0];
    const isExo = me?.plan === 'exo' && me.planExpiresAt && me.planExpiresAt > Date.now();
    const pending = !!me?.pendingPaymentId;

    const submit = async () => {
        if (!proof) { setErr('Upload a screenshot of your payment first.'); return; }
        setBusy(true); setErr(null); setOk(null);
        try {
            const fd = new FormData();
            fd.append('token', token);
            fd.append('plan', 'exo');
            fd.append('method', method);
            if (note) fd.append('note', note);
            fd.append('file', proof);
            const r = await axios.post('/exocore/api/auth/plans/submit', fd);
            if (r.data?.success) {
                setOk('Submitted! An owner will review your payment shortly.');
                setProof(null); setNote('');
                if (fileRef.current) fileRef.current.value = '';
                await reload();
            } else {
                setErr(r.data?.message || 'submit failed');
            }
        } catch (e: any) {
            setErr(e?.response?.data?.message || 'submit failed');
        } finally { setBusy(false); }
    };

    const qrImg = catalog
        ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(catalog.payment.gcash.qrPayload)}`
        : '';

    return (
        <div className="plans-overlay" onClick={onClose}>
            <div className="plans-modal" onClick={e => e.stopPropagation()}>
                <header className="plans-head">
                    <h2>EXO PLAN</h2>
                    <button className="plans-x" onClick={onClose} aria-label="Close">✕</button>
                </header>

                {!catalog && <div className="plans-loading">Loading plan…</div>}

                {catalog && plan && (
                    <>
                        <div className="plans-card">
                            <div className="plans-card-head">
                                <span className="plans-tag">PRO</span>
                                <span className="plans-name">{plan.name}</span>
                            </div>
                            <div className="plans-price">
                                <span className="plans-amount">{plan.localCurrency} {plan.localPrice.toLocaleString()}</span>
                                <span className="plans-period">/ {plan.durationDays} days</span>
                            </div>
                            {plan.localCurrency !== 'PHP' && (
                                <div className="plans-fx">≈ ₱{plan.basePricePHP} PHP (rate {plan.fxRate.toFixed(4)} via frankfurter.app)</div>
                            )}
                            <ul className="plans-feat">
                                <li>✔ EXO badge on chat & profile</li>
                                <li>✔ Higher post / image limits</li>
                                <li>✔ Priority support from owners</li>
                                <li>✔ Manual payment — no card needed</li>
                            </ul>
                            {isExo && (
                                <div className="plans-status ok">
                                    ✅ You're on EXO until <b>{fmtDate(me!.planExpiresAt!)}</b>
                                </div>
                            )}
                            {pending && (
                                <div className="plans-status pending">
                                    ⏳ Payment pending review.
                                </div>
                            )}
                        </div>

                        {!isExo && !pending && (
                            <>
                                <div className="plans-tabs">
                                    <button className={method === 'gcash' ? 'on' : ''} onClick={() => setMethod('gcash')}>GCash</button>
                                    <button className={method === 'gotyme' ? 'on' : ''} onClick={() => setMethod('gotyme')}>GoTyme</button>
                                </div>
                                {method === 'gcash' ? (
                                    <div className="plans-pay">
                                        <img src={qrImg} alt="GCash QR" className="plans-qr" />
                                        <div className="plans-pay-meta">
                                            <div><b>Name:</b> {catalog.payment.gcash.name}</div>
                                            <div><b>Number:</b> {catalog.payment.gcash.number}</div>
                                            <div className="plans-help">Send <b>₱{plan.basePricePHP}</b> via GCash app or QR scan.</div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="plans-pay">
                                        <div className="plans-pay-meta">
                                            <div><b>Bank:</b> GoTyme</div>
                                            <div><b>Name:</b> {catalog.payment.gotyme.name}</div>
                                            <div><b>Account:</b> {catalog.payment.gotyme.number}</div>
                                            <div className="plans-help">Send <b>₱{plan.basePricePHP}</b> then upload a screenshot below.</div>
                                        </div>
                                    </div>
                                )}

                                <div className="plans-form">
                                    <label className="plans-file">
                                        <span>Payment screenshot</span>
                                        <input
                                            ref={fileRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={e => setProof(e.target.files?.[0] || null)}
                                        />
                                    </label>
                                    <textarea
                                        placeholder="Reference number / note (optional)"
                                        maxLength={300}
                                        value={note}
                                        onChange={e => setNote(e.target.value)}
                                    />
                                    {err && <div className="plans-err">{err}</div>}
                                    {ok && <div className="plans-ok">{ok}</div>}
                                    <button className="plans-submit" onClick={submit} disabled={busy}>
                                        {busy ? 'Submitting…' : 'Submit payment for review'}
                                    </button>
                                </div>
                            </>
                        )}

                        {me && me.payments.length > 0 && (
                            <div className="plans-history">
                                <h3>Your payment history</h3>
                                {me.payments.map(p => (
                                    <div className={`plans-row st-${p.status}`} key={p.id}>
                                        <span className="plans-row-when">{fmtDate(p.ts)}</span>
                                        <span className="plans-row-amt">{p.currency} {p.amount}</span>
                                        <span className="plans-row-method">{p.method.toUpperCase()}</span>
                                        <span className={`plans-row-status st-${p.status}`}>{p.status}</span>
                                        {p.reason && <span className="plans-row-reason">— {p.reason}</span>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default PlansModal;
