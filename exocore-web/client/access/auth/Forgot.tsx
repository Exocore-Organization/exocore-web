import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import PasswordInput from './PasswordInput';
import { rpc } from '../rpcClient';

type Step = 'request' | 'reset';

interface ForgotForm {
    email: string;
    otp: string;
    newPass: string;
}

const Forgot: React.FC = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState<Step>('request');
    const [form, setForm] = useState<ForgotForm>({ email: '', otp: '', newPass: '' });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const [resendTimer, setResendTimer] = useState(0);

    useEffect(() => {
        if (localStorage.getItem('exo_token')) navigate('/dashboard');
    }, [navigate]);

    useEffect(() => {
        if (resendTimer <= 0) return;
        const id = setInterval(() => setResendTimer(t => t - 1), 1000);
        return () => clearInterval(id);
    }, [resendTimer]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleRequestOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        if (loading) return;
        setError(''); setSuccess('');

        if (!form.email.trim()) { setError('Please enter your email address.'); return; }

        setLoading(true);
        try {
            await rpc.call('auth.forgot.request', { email: form.email }, { token: '' });
            setSuccess('OTP sent! Keep refreshing your inbox — delivery may take a minute or two.');
            setStep('reset');
            setResendTimer(180);
        } catch (err: unknown) {
            const msg = (err as { message?: string })?.message;
            setError(msg || 'Failed to send OTP. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleResetPass = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(''); setSuccess('');

        if (!form.otp.trim()) { setError('Please enter the OTP.'); return; }
        if (!form.newPass) { setError('Please enter a new password.'); return; }
        if (form.newPass.length < 6) { setError('Password must be at least 6 characters.'); return; }

        setLoading(true);
        try {
            await rpc.call('auth.forgot.reset', {
                email: form.email,
                otp: form.otp,
                pass: form.newPass,
            }, { token: '' });
            setSuccess('Password updated! Redirecting to login…');
            setTimeout(() => navigate('/login'), 1800);
        } catch (err: unknown) {
            const msg = (err as { message?: string })?.message;
            setError(msg || 'Invalid OTP or request expired.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout
            title={step === 'request' ? 'Recover account' : 'Reset password'}
            subtitle={
                step === 'request'
                    ? "Enter your email and we\u2019ll send you a one-time code."
                    : `We sent a 6-digit code to ${form.email}`
            }
            footerContent={
                <Link to="/login">Back to sign in</Link>
            }
        >
            {step === 'request' ? (
                <form className="form-stack" onSubmit={handleRequestOtp}>
                    <div className="field">
                        <label className="field-label">Email Address</label>
                        <input
                            className="field-input"
                            type="email"
                            name="email"
                            placeholder="you@example.com"
                            value={form.email}
                            onChange={handleChange}
                            autoFocus
                            required
                        />
                    </div>

                    {error && (
                        <div className="form-error">
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                                <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5"/>
                                <path d="M7 4v3M7 9.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                            {error}
                        </div>
                    )}

                    <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: '0.25rem' }}>
                        {loading ? (
                            <>
                                <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                                Sending OTP…
                            </>
                        ) : 'Send OTP'}
                    </button>
                </form>
            ) : (
                <form className="form-stack" onSubmit={handleResetPass}>
                    <div className="field">
                        <label className="field-label">6-Digit OTP</label>
                        <input
                            className="field-input"
                            type="text"
                            name="otp"
                            placeholder="000000"
                            maxLength={6}
                            value={form.otp}
                            onChange={handleChange}
                            autoFocus
                            required
                            style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', letterSpacing: '0.3em', textAlign: 'center' }}
                        />
                    </div>

                    <div className="field">
                        <label className="field-label">New Password</label>
                        <PasswordInput
                            name="newPass"
                            placeholder="Min. 6 characters"
                            value={form.newPass}
                            onChange={handleChange}
                            autoComplete="new-password"
                            required
                        />
                    </div>

                    {success && (
                        <div className="form-success">
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                                <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5"/>
                                <path d="M4.5 7l2 2 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            {success}
                        </div>
                    )}

                    {error && (
                        <div className="form-error">
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                                <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5"/>
                                <path d="M7 4v3M7 9.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                            {error}
                        </div>
                    )}

                    <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: '0.25rem' }}>
                        {loading ? (
                            <>
                                <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                                Resetting…
                            </>
                        ) : 'Reset Password'}
                    </button>

                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => { setStep('request'); setError(''); setSuccess(''); }}
                    >
                        ← Use different email
                    </button>

                    {resendTimer > 0 && (
                        <p style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Resend OTP in <span style={{ color: 'var(--indigo-light)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{resendTimer}s</span>
                        </p>
                    )}
                </form>
            )}
        </AuthLayout>
    );
};

export default Forgot;
