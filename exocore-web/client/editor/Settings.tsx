import React, { useState } from 'react';
import axios from 'axios';
import { X, Check, Sun, Moon, ChevronDown } from 'lucide-react';
import { useEditorStore } from './store';
import { ALL_THEMES } from './editorThemes';

export const Settings: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { currentTheme, setTheme, wordWrap, setWordWrap } = useEditorStore();
    const [themeOpen, setThemeOpen] = useState(true);

    // Pick the active theme so the modal chrome (border, accents, button)
    // matches the user's theme choice instead of forcing the Neo-Brutalism
    // yellow on every theme.
    const activeTheme = ALL_THEMES.find(t => t.id === currentTheme) ?? ALL_THEMES[0];
    const accent = activeTheme.accent;
    // Pick a readable foreground for the primary button: black on light
    // accents, white on dark accents. Cheap luminance check.
    const accentFg = (() => {
        const hex = accent.replace('#', '');
        if (hex.length !== 6) return '#000';
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return lum > 0.6 ? '#000' : '#fff';
    })();

    const changeTheme = async (id: string) => {
        setTheme(id);
        try { await axios.post('/exocore/api/settings', { editorTheme: id }); } catch (_) {}
    };

    const toggleWordWrap = async () => {
        const v = !wordWrap;
        setWordWrap(v);
        try { await axios.post('/exocore/api/settings', { wordWrap: v }); } catch (_) {}
    };

    const darkThemes  = ALL_THEMES.filter(t => t.dark);
    const lightThemes = ALL_THEMES.filter(t => !t.dark);

    const ThemeRow = ({ t }: { t: typeof ALL_THEMES[0] }) => {
        const isActive = currentTheme === t.id;
        return (
            <button
                key={t.id}
                onClick={() => changeTheme(t.id)}
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '9px 12px',
                    background: isActive ? 'rgba(255,255,255,0.04)' : 'transparent',
                    border: 'none',
                    borderLeft: isActive ? `3px solid ${accent}` : '3px solid transparent',
                    color: isActive ? '#f0f0f0' : '#777',
                    cursor: 'pointer',
                    fontFamily: "'IBM Plex Sans', sans-serif",
                    fontSize: '12px',
                    fontWeight: isActive ? 700 : 400,
                    textAlign: 'left',
                    transition: '0.1s ease',
                    gap: '10px',
                    borderRadius: 0,
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#bbb'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = '#777'; }}
            >
                <span style={{ display: 'flex', alignItems: 'center', gap: '9px', flex: 1, minWidth: 0 }}>
                    <span style={{
                        width: '9px', height: '9px', flexShrink: 0,
                        background: t.accent,
                        border: `1px solid ${t.accent}44`,
                        borderRadius: 0,
                    }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                    {!t.dark && (
                        <span style={{
                            fontSize: '8px', fontWeight: 700,
                            letterSpacing: '0.08em', color: '#555',
                            background: '#1a1a1a', padding: '1px 5px',
                            border: '1px solid #2a2a2a',
                            textTransform: 'uppercase',
                            flexShrink: 0,
                        }}>LIGHT</span>
                    )}
                </span>
                {isActive && <Check size={13} style={{ color: accent, flexShrink: 0 }} />}
            </button>
        );
    };

    return (
        <div style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 9999,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            fontFamily: "'IBM Plex Sans', sans-serif",
        }}>
            <div style={{
                background: '#111',
                border: '2px solid #2a2a2a',
                boxShadow: `6px 6px 0 0 ${accent}`,
                width: 'min(440px, 95vw)',
                maxHeight: '86vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                borderRadius: 0,
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 18px',
                    borderBottom: '1px solid #1e1e1e',
                    flexShrink: 0,
                    background: '#0d0d0d',
                }}>
                    <div style={{
                        fontWeight: 900, fontSize: '11px',
                        letterSpacing: '0.22em', textTransform: 'uppercase',
                        color: '#f0f0f0',
                    }}>Settings</div>
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none',
                        color: '#555', cursor: 'pointer',
                        padding: '4px', display: 'flex',
                        alignItems: 'center', transition: '0.1s',
                        borderRadius: 0,
                    }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#FF3B3B')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#555')}
                    >
                        <X size={15} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>

                    {/* Section: Theme */}
                    <div style={{ borderBottom: '1px solid #1a1a1a' }}>
                        <button
                            onClick={() => setThemeOpen(o => !o)}
                            style={{
                                width: '100%', display: 'flex', alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '12px 18px',
                                background: 'none', border: 'none',
                                cursor: 'pointer', color: '#888',
                                fontFamily: "'IBM Plex Sans', sans-serif",
                                fontSize: '10px', letterSpacing: '0.16em',
                                fontWeight: 700, textTransform: 'uppercase',
                                transition: '0.1s', borderRadius: 0,
                            }}
                        >
                            <span>Color Theme</span>
                            <ChevronDown
                                size={14}
                                style={{
                                    transform: themeOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                    transition: 'transform 0.15s',
                                    color: '#555',
                                }}
                            />
                        </button>

                        {themeOpen && (
                            <div style={{ paddingBottom: '8px' }}>
                                {/* Dark group */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '6px 18px 4px',
                                }}>
                                    <Moon size={9} style={{ color: '#444' }} />
                                    <span style={{
                                        fontSize: '9px', fontWeight: 700,
                                        letterSpacing: '0.14em', textTransform: 'uppercase',
                                        color: '#444',
                                    }}>Dark</span>
                                </div>
                                {darkThemes.map(t => <ThemeRow key={t.id} t={t} />)}

                                {/* Light group */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '12px 18px 4px',
                                    borderTop: '1px solid #1a1a1a',
                                    marginTop: '4px',
                                }}>
                                    <Sun size={9} style={{ color: '#444' }} />
                                    <span style={{
                                        fontSize: '9px', fontWeight: 700,
                                        letterSpacing: '0.14em', textTransform: 'uppercase',
                                        color: '#444',
                                    }}>Light</span>
                                </div>
                                {lightThemes.map(t => <ThemeRow key={t.id} t={t} />)}
                            </div>
                        )}
                    </div>

                    {/* Section: Preferences */}
                    <div style={{ padding: '14px 18px 18px' }}>
                        <div style={{
                            fontSize: '10px', fontWeight: 700,
                            letterSpacing: '0.16em', textTransform: 'uppercase',
                            color: '#444', marginBottom: '12px',
                        }}>Preferences</div>

                        {/* Word wrap toggle */}
                        <button
                            onClick={toggleWordWrap}
                            style={{
                                width: '100%', padding: '11px 14px',
                                background: 'transparent',
                                border: `2px solid ${wordWrap ? '#333' : '#222'}`,
                                color: '#888',
                                cursor: 'pointer',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                fontFamily: "'IBM Plex Sans', sans-serif",
                                fontSize: '13px', fontWeight: 500,
                                marginBottom: '16px',
                                transition: '0.1s', borderRadius: 0,
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = '#444'; e.currentTarget.style.color = '#bbb'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = wordWrap ? '#333' : '#222'; e.currentTarget.style.color = '#888'; }}
                        >
                            <span>Word Wrap</span>
                            <span style={{
                                fontSize: '9px', padding: '2px 8px',
                                background: wordWrap ? 'rgba(0,255,148,0.1)' : '#1a1a1a',
                                color: wordWrap ? '#00FF94' : '#555',
                                border: `1px solid ${wordWrap ? 'rgba(0,255,148,0.25)' : '#2a2a2a'}`,
                                fontFamily: "'IBM Plex Mono', monospace",
                                fontWeight: 700, letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                            }}>
                                {wordWrap ? 'ON' : 'OFF'}
                            </span>
                        </button>

                        {/* Close button */}
                        <button
                            onClick={onClose}
                            style={{
                                width: '100%', padding: '12px',
                                background: accent,
                                border: `2px solid ${accent}`,
                                boxShadow: `4px 4px 0 ${accent}33`,
                                color: accentFg,
                                fontWeight: 900, cursor: 'pointer',
                                fontSize: '11px',
                                fontFamily: "'IBM Plex Sans', sans-serif",
                                letterSpacing: '0.14em', textTransform: 'uppercase',
                                transition: '0.1s', borderRadius: 0,
                            }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'translate(-1px,-1px)'; e.currentTarget.style.boxShadow = `6px 6px 0 ${accent}33`; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = `4px 4px 0 ${accent}33`; }}
                        >
                            Close &amp; Apply
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
