import React from 'react';

interface AuthLayoutProps {
    title: string;
    subtitle?: string;
    footerContent?: React.ReactNode;
    children: React.ReactNode;
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ title, subtitle, footerContent, children }) => (
    <div className="auth-page">
        <div className="auth-card">
            <div className="auth-logo">
                <span className="auth-logo-text">EXOCORE</span>
            </div>
            <div className="auth-header">
                <h1 className="auth-title">{title}</h1>
                {subtitle && <p className="auth-subtitle">{subtitle}</p>}
            </div>
            <div className="auth-body">{children}</div>
            {footerContent && <div className="auth-footer">{footerContent}</div>}
        </div>
    </div>
);

export default AuthLayout;
