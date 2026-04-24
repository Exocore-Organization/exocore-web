import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const AuthCallback: React.FC = () => {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const [msg, setMsg] = useState('Verifying your account…');

    useEffect(() => {
        const token = params.get('token');
        const verified = params.get('verified');
        if (token) {
            localStorage.setItem('exo_token', token);
            sessionStorage.removeItem('exo_pending_verify');
            setMsg(verified === '1' ? 'Email verified — signing you in…' : 'Signing you in…');
            const t = setTimeout(() => navigate('/', { replace: true }), 800);
            return () => clearTimeout(t);
        }
        setMsg('Missing verification token.');
        const t = setTimeout(() => navigate('/login', { replace: true }), 1500);
        return () => clearTimeout(t);
    }, [navigate, params]);

    return (
        <div className="auth-page">
            <div className="auth-card" style={{ textAlign: 'center', alignItems: 'center' }}>
                <div className="auth-logo" style={{ justifyContent: 'center' }}>
                    <span className="auth-logo-text">EXOCORE</span>
                </div>
                <h1 className="auth-title" style={{ fontSize: '1.3rem' }}>{msg}</h1>
                <div style={{
                    width: 28, height: 28, margin: '0.5rem auto',
                    border: '3px solid rgba(255,229,0,0.3)', borderTopColor: '#FFE500',
                    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                }} />
            </div>
        </div>
    );
};

export default AuthCallback;
