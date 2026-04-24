import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import PasswordInput from './PasswordInput';
import { rpc } from '../rpcClient';

const Login: React.FC = () => {
    const navigate = useNavigate();
    const [creds, setCreds] = useState({ user: '', pass: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (localStorage.getItem('exo_token')) navigate('/');
    }, [navigate]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        let processedUser = creds.user.trim();
        if (!processedUser.includes('@') && !/^\d+$/.test(processedUser) && !processedUser.startsWith('@')) {
            processedUser = `@${processedUser}`;
        }

        if (!processedUser || !creds.pass) {
            setError('Please fill in all fields.');
            return;
        }

        setLoading(true);
        try {
            const data = await rpc.call<{ success?: boolean; token?: string; message?: string }>(
                'auth.login',
                { user: processedUser, pass: creds.pass },
                { token: '' },
            );
            if (data?.token) {
                localStorage.setItem('exo_token', data.token);
                navigate('/dashboard');
            } else {
                setError(data?.message || 'Authentication failed. Please check your credentials.');
            }
        } catch (err: unknown) {
            const msg = (err as { message?: string })?.message;
            setError(msg || 'Authentication failed. Please check your credentials.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout
            title="Welcome back"
            subtitle="Sign in to your Exocore workspace."
            footerContent={
                <>
                    New to Exocore?{' '}
                    <Link to="/register">Create an account</Link>
                </>
            }
        >
            <form className="form-stack" onSubmit={handleLogin}>
                <div className="field">
                    <label className="field-label">Username or Email</label>
                    <input
                        className="field-input"
                        type="text"
                        placeholder="@username or email@example.com"
                        value={creds.user}
                        onChange={e => setCreds({ ...creds, user: e.target.value })}
                        autoComplete="username"
                        autoFocus
                        required
                    />
                </div>

                <div className="field">
                    <label className="field-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Password</span>
                        <Link
                            to="/forgot"
                            style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 'normal' }}
                        >
                            Forgot password?
                        </Link>
                    </label>
                    <PasswordInput
                        placeholder="Enter your password"
                        value={creds.pass}
                        onChange={e => setCreds({ ...creds, pass: e.target.value })}
                        autoComplete="current-password"
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

                <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: '0.5rem' }}>
                    {loading ? (
                        <>
                            <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                            Signing in…
                        </>
                    ) : 'Sign In'}
                </button>
            </form>
        </AuthLayout>
    );
};

export default Login;
