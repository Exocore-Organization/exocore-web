import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { initTheme } from '../components/utils/themeManager';

const FEATURES = [
    { icon: '⚡', label: 'Fast IDE' },
    { icon: '🖥️', label: 'Live Terminal' },
    { icon: '🤖', label: 'AI Assistant' },
    { icon: '📦', label: 'NPM Manager' },
    { icon: '🌿', label: 'Git / GitHub' },
    { icon: '🌐', label: 'Web Preview' },
];

const Home: React.FC = () => {
    const navigate = useNavigate();

    useEffect(() => {
        initTheme();
        if (localStorage.getItem('exo_token')) navigate('/dashboard');
    }, [navigate]);

    return (
        <div className="home-scene">
            <div className="home-glow home-glow-1" />
            <div className="home-glow home-glow-2" />
            <div className="home-glow home-glow-3" />

            <div className="home-content">
                <div className="home-badge">
                    <span className="home-badge-dot" />
                    Cloud Development Platform
                </div>

                <h1 className="home-title">EXOCORE</h1>

                <p className="home-subtitle">
                    A next-generation browser-based IDE. Write, run, and deploy
                    code in any language — no setup required.
                </p>

                <div className="home-cta-group">
                    <button
                        className="btn-home-primary"
                        onClick={() => navigate('/login')}
                    >
                        Get Started
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </button>
                    <button
                        className="btn-home-secondary"
                        onClick={() => navigate('/register')}
                    >
                        Create Account
                    </button>
                </div>

                <div className="home-features">
                    {FEATURES.map(f => (
                        <div key={f.label} className="home-feature-item">
                            <span className="home-feature-icon">{f.icon}</span>
                            <span className="home-feature-label">{f.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="home-version">Exocore v4.0.0 · Modern Engine</div>
        </div>
    );
};

export default Home;
