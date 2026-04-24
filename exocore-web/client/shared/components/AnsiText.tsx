import React from 'react';

const AnsiText: React.FC<{ text: string }> = ({ text }) => {
    const parts = text.split(/(\x1b\[[0-9;]*m)/g);
    let color = 'inherit';
    let isBold = false;

    return (
        <>
        {parts.map((part, i) => {
            const match = part.match(/\x1b\[([0-9;]*)m/);
            if (match) {
                const codes = match[1] ? match[1].split(';') : ['0'];
                for (const codeStr of codes) {
                    const code = parseInt(codeStr);
                    if (code === 0) { color = 'inherit'; isBold = false; }
                    else if (code === 1) isBold = true;
                    else if (code === 30) color = '#64748b';
                    else if (code === 31 || code === 91) color = '#ef4444';
                    else if (code === 32 || code === 92) color = '#22c55e';
                    else if (code === 33 || code === 93) color = '#f59e0b';
                    else if (code === 34 || code === 94) color = '#3b82f6';
                    else if (code === 35 || code === 95) color = '#d946ef';
                    else if (code === 36 || code === 96) color = '#06b6d4';
                    else if (code === 37 || code === 97) color = '#f8fafc';
                    else if (code === 90) color = '#94a3b8';
                }
                return null;
            }
            return part ? <span key={i} style={{ color, fontWeight: isBold ? 'bold' : 'normal' }}>{part}</span> : null;
        })}
        </>
    );
};

export default AnsiText;
