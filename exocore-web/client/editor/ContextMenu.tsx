import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';

export interface ContextMenuOption {
    label: string;
    icon: string;
    onClick: () => void;
    danger?: boolean;
}

interface Props {
    x: number;
    y: number;
    onClose: () => void;
    options: ContextMenuOption[];
}

export const ContextMenu: React.FC<Props> = ({ x, y, onClose, options }) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ top: y, left: x });

    
    useLayoutEffect(() => {
        if (menuRef.current) {
            const menuWidth = menuRef.current.offsetWidth;
            const menuHeight = menuRef.current.offsetHeight;
            const screenWidth = window.innerWidth;
            const screenHeight = window.innerHeight;

            let newLeft = x;
            let newTop = y;

            
            if (x + menuWidth > screenWidth) {
                newLeft = screenWidth - menuWidth - 10;
            }

            
            if (y + menuHeight > screenHeight) {
                newTop = screenHeight - menuHeight - 10;
            }

            setPos({ top: newTop, left: newLeft });
        }
    }, [x, y, options]);

    useEffect(() => {
        const handleOutsideAction = (e: any) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        
        window.addEventListener('mousedown', handleOutsideAction);
        window.addEventListener('touchstart', handleOutsideAction);

        return () => {
            window.removeEventListener('mousedown', handleOutsideAction);
            window.removeEventListener('touchstart', handleOutsideAction);
        };
    }, [onClose]);

    
    if (options.length === 0) return null;

    return (
        <div
        ref={menuRef}
        className="exo-context-menu"
        style={{
            top: pos.top,
            left: pos.left,
            position: 'fixed',
            zIndex: 10000, 
            minWidth: '160px',
            background: '#1a1b26',
            border: '1px solid rgba(122, 162, 247, 0.3)',
            borderRadius: '8px',
            padding: '5px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            animation: 'exoFadeIn 0.15s ease-out'
        }}
        >
        <style>{`
            @keyframes exoFadeIn {
                from { opacity: 0; transform: translateY(-5px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .context-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 10px 12px;
                cursor: pointer;
                border-radius: 4px;
                transition: all 0.2s;
                color: #a9b1d6;
                font-size: 14px;
            }
            .context-item:hover {
                background: rgba(122, 162, 247, 0.1);
                color: #7aa2f7;
            }
            .context-item.danger { color: #f7768e; }
            .context-item.danger:hover { background: rgba(247, 118, 142, 0.1); }
            .icon { font-size: 16px; width: 20px; text-align: center; }
            `}</style>

            {options.map((opt, i) => (
                <div
                key={i}
                className={`context-item ${opt.danger ? 'danger' : ''}`}
                onClick={(e) => {
                    e.stopPropagation();
                    opt.onClick();
                    onClose();
                }}
                >
                <span className="icon">{opt.icon}</span>
                <span className="label">{opt.label}</span>
                </div>
            ))}
            </div>
    );
};
