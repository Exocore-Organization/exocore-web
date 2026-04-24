import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const BackButton: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();

    if (location.pathname === "/") return null; 

    const handleBack = () => {
        if (window.history.length > 2) window.history.back();
        else navigate("/");
    };

        return (
            <button
            onClick={handleBack}
            className="mobile-back-btn"
            style={{
                position: 'fixed', top: '1rem', left: '1rem', zIndex: 1000,
                display: 'flex', alignItems: 'center', gap: '8px',
                background: 'var(--bg-card, rgba(255,255,255,0.2))',
                border: '1px solid var(--border-color, #ccc)',
                backdropFilter: 'blur(10px)', padding: '10px 16px',
                borderRadius: '999px', cursor: 'pointer', color: 'var(--text-main)',
                fontWeight: 'bold', boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
            }}
            >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span className="back-text">Back</span>
            </button>
        );
};

export default BackButton;
