import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

interface AuthLayoutProps {
    title: string;
    subtitle?: string;
    footerContent?: React.ReactNode;
    children: React.ReactNode;
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ title, subtitle, footerContent, children }) => {
    const navigate = useNavigate();
    const location = useLocation();

    const showBack = location.pathname !== '/';

    return (
        <div className="auth-scene">
            {showBack && (
                <button className="auth-back" onClick={() => navigate('/')}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M11 7H3M6 3L3 7l3 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Back
                </button>
            )}

            <div className="auth-shell">
                <div className="auth-brand">
                    <div className="auth-brand-mark">EX</div>
                    <span className="auth-brand-name">EXOCORE</span>
                </div>

                <div className="auth-card">
                    <div className="auth-card-inner">
                        <div className="auth-card-header">
                            <h1 className="auth-card-title">{title}</h1>
                            {subtitle && (
                                <p className="auth-card-subtitle">{subtitle}</p>
                            )}
                        </div>
                        {children}
                    </div>

                    {footerContent && (
                        <div className="auth-footer-links">
                            {footerContent}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AuthLayout;
