import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { rpc } from '../rpcClient';

interface PendingCtx { email: string; nickname?: string; username?: string }

const gmailUrlFor = (email: string): string => {
    const domain = email.split('@')[1]?.toLowerCase() || '';
    if (domain.includes('gmail') || domain.includes('googlemail')) return 'https://mail.google.com';
    if (domain.includes('outlook') || domain.includes('hotmail') || domain.includes('live')) return 'https://outlook.live.com/mail/0/inbox';
    if (domain.includes('yahoo')) return 'https://mail.yahoo.com';
    if (domain.includes('proton')) return 'https://mail.proton.me';
    if (domain.includes('icloud')) return 'https://www.icloud.com/mail';
    if (domain) return `https://${domain}`;
    return 'https://mail.google.com';
};

const VerifyPending: React.FC = () => {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const [resending, setResending] = useState(false);
    const [resendStatus, setResendStatus] = useState<{ ok: boolean; msg: string } | null>(null);
    const [resendTimer, setResendTimer] = useState(0);
    const [autoOpenedRef, setAutoOpenedRef] = useState(false);
    const openedOnce = useRef(false);

    const ctx: PendingCtx = useMemo(() => {
        const stored = sessionStorage.getItem('exo_pending_verify');
        if (stored) {
            try { return JSON.parse(stored); } catch { /* ignore */ }
        }
        return { email: params.get('email') || '' };
    }, [params]);

    useEffect(() => {
        if (localStorage.getItem('exo_token')) navigate('/');
    }, [navigate]);

    useEffect(() => {
        if (resendTimer <= 0) return;
        const id = setInterval(() => setResendTimer(t => t - 1), 1000);
        return () => clearInterval(id);
    }, [resendTimer]);

    const mailUrl = gmailUrlFor(ctx.email || '');

    const handleOpenInbox = () => {
        if (!ctx.email) return;
        openedOnce.current = true;
        window.open(mailUrl, '_blank', 'noopener,noreferrer');
        setAutoOpenedRef(true);
    };

    const handleResend = async () => {
        if (!ctx.email) {
            setResendStatus({ ok: false, msg: 'No email on record. Please go back and register again.' });
            return;
        }
        setResending(true);
        setResendStatus(null);
        try {
            await rpc.call('auth.verify.resend', {
                username: ctx.username || ctx.email,
                host: window.location.origin,
            }, { token: '' });
            setResendStatus({ ok: true, msg: `Verification link sent to ${ctx.email}` });
            setResendTimer(45);
        } catch (err: any) {
            const msg = err?.message || 'Could not resend. Try again in a moment.';
            setResendStatus({ ok: false, msg });
        } finally {
            setResending(false);
        }
    };

    return (
        <AuthLayout
            title="Check your inbox"
            subtitle={ctx.nickname ? `One last step, ${ctx.nickname}.` : 'One last step to activate your account.'}
            footerContent={<><Link to="/login">Back to sign in</Link></>}
        >
            <div className="vp-card">
                <div className="vp-icon">✉</div>
                <p className="vp-text">
                    We sent a verification link to <br />
                    <strong className="vp-email">{ctx.email || 'your email'}</strong>
                </p>
                <p className="vp-text-sub">
                    Open that email and click <em>Verify my email</em>. We'll bring you straight back here, signed in and ready to go.
                </p>

                <button className="btn btn-primary" type="button" onClick={handleOpenInbox} disabled={!ctx.email}>
                    Open my inbox →
                </button>

                {autoOpenedRef && (
                    <p className="vp-hint">Inbox opened in a new tab. Once you click the verify link, return here — you'll be auto-logged in.</p>
                )}

                <div className="vp-divider"><span>didn't get it?</span></div>

                <button className="btn btn-secondary" type="button" onClick={handleResend} disabled={resending || resendTimer > 0}>
                    {resending ? 'Sending…'
                        : resendTimer > 0 ? `Resend in ${resendTimer}s`
                        : 'Resend verification email'}
                </button>

                {resendStatus && (
                    <div className={resendStatus.ok ? 'form-success' : 'form-error'}>
                        {resendStatus.msg}
                    </div>
                )}

                <p className="vp-footnote">
                    Wrong email? <Link to="/register">Use a different one →</Link>
                </p>
            </div>
        </AuthLayout>
    );
};

export default VerifyPending;
