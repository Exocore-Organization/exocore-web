import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { rpc } from '../../access/rpcClient';
import toast from 'react-hot-toast';
import { KeyRound, Check, Loader2, X } from 'lucide-react';
import { META_MODELS } from './types';

interface ExoSetupPanelProps {
    theme: any;
    kiloProvider: string;
    kiloModel: string;
    kiloKey: string;
    onProviderChange: (p: string) => void;
    onModelChange: (m: string) => void;
    onKeyChange: (k: string) => void;
    onSave: () => void;
    onRemove: () => void;
}

const COOKIES_PLACEHOLDER = `Paste cookies in any of these formats:

1) JSON object:
   { "ecto_1_sess": "xxx", "datr": "yyy" }

2) Browser cookie array (DevTools > Application > Cookies > meta.ai > export):
   [ { "name": "ecto_1_sess", "value": "xxx" }, ... ]

3) Raw cookie header:
   ecto_1_sess=xxx; datr=yyy

We will test EACH cookie one by one against
https://exocore-llama.hf.space/ and only keep
the ones that actually authenticate.`;

function normalizeCookies(raw: string): Record<string, string> | null {
    const txt = raw.trim();
    if (!txt) return null;

    // Try JSON first.
    try {
        const parsed = JSON.parse(txt);
        if (Array.isArray(parsed)) {
            const out: Record<string, string> = {};
            for (const item of parsed) {
                if (item && typeof item.name === 'string' && typeof item.value === 'string') {
                    out[item.name] = item.value;
                }
            }
            return Object.keys(out).length ? out : null;
        }
        if (parsed && typeof parsed === 'object') {
            const out: Record<string, string> = {};
            for (const [k, v] of Object.entries(parsed)) {
                if (typeof v === 'string') out[k] = v;
            }
            return Object.keys(out).length ? out : null;
        }
    } catch { /* fall through */ }

    // Try cookie-header format: "a=b; c=d".
    const out: Record<string, string> = {};
    for (const part of txt.split(/;\s*|\n/)) {
        const idx = part.indexOf('=');
        if (idx <= 0) continue;
        const name = part.slice(0, idx).trim();
        const value = part.slice(idx + 1).trim();
        if (name && value) out[name] = value;
    }
    return Object.keys(out).length ? out : null;
}

interface CookieCheck { name: string; ok: boolean; error?: string; }

const MetaCookieSetup: React.FC = () => {
    const [raw, setRaw] = useState('');
    const [busy, setBusy] = useState(false);
    const [savedCookieNames, setSavedCookieNames] = useState<string[] | null>(null);
    const [reply, setReply] = useState<string | null>(null);
    const [perCookie, setPerCookie] = useState<CookieCheck[] | null>(null);

    useEffect(() => {
        rpc.call<any>('ai.metaCookiesGet').then(r => {
            if (r?.saved) setSavedCookieNames(r.cookieNames || []);
        }).catch(() => {});
    }, []);

    const handleClear = async () => {
        try {
            await rpc.call('ai.metaCookiesDelete');
            setSavedCookieNames(null);
            setReply(null);
            setPerCookie(null);
            toast.success('Saved cookies cleared');
        } catch {
            toast.error('Failed to clear cookies');
        }
    };

    const handleTest = async () => {
        const cookies = normalizeCookies(raw);
        if (!cookies) {
            toast.error('Could not parse cookies. Paste JSON, an exported array, or "name=value; ..."');
            return;
        }
        setBusy(true);
        setReply(null);
        setPerCookie(null);
        const tid = toast.loading(`Testing ${Object.keys(cookies).length} cookies one by one...`);
        try {
            const res = await rpc.call<any>('ai.metaCookiesPost', { cookies }, { timeoutMs: 180000 });
            if (res?.ok) {
                toast.success(`Saved! Working: ${(res.kept || []).join(', ')}`, { id: tid });
                setSavedCookieNames(res.kept || Object.keys(cookies));
                setReply(res.replyPreview || '(empty preview)');
                setPerCookie(res.perCookie || null);
                setRaw('');
            } else {
                toast.error(`Test failed: ${res?.error || 'unknown'}`, { id: tid });
                setPerCookie(res?.perCookie || null);
            }
        } catch (err: any) {
            const detail = err?.response?.data?.detail || err?.response?.data?.error || err.message;
            const pc = err?.response?.data?.perCookie;
            if (pc) setPerCookie(pc);
            toast.error(`Failed: ${detail}`, { id: tid });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="form-group" style={{ marginTop: 8 }}>
            <label>Paste meta.ai Cookies (any format)</label>
            {savedCookieNames && (
                <div style={{
                    background: 'rgba(46, 204, 113, 0.1)',
                    border: '1px solid rgba(46, 204, 113, 0.3)',
                    borderRadius: 6, padding: '6px 10px', marginBottom: 6,
                    fontSize: 11, color: '#2ecc71', display: 'flex', alignItems: 'center', gap: 6,
                    justifyContent: 'space-between',
                }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Check size={12} /> Active: {savedCookieNames.join(', ')}
                    </span>
                    <button onClick={handleClear} style={{
                        background: 'transparent', border: 'none', color: '#ff5555',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 2,
                    }} title="Clear saved cookies">
                        <X size={12} />
                    </button>
                </div>
            )}
            <textarea
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder={COOKIES_PLACEHOLDER}
                rows={8}
                style={{
                    width: '100%', fontFamily: 'monospace', fontSize: 11,
                    padding: 8, borderRadius: 6,
                    background: 'rgba(0,0,0,0.25)', color: '#ddd',
                    border: '1px solid rgba(255,255,255,0.1)', resize: 'vertical',
                }}
            />
            <button
                className="save-btn"
                onClick={handleTest}
                disabled={busy || !raw.trim()}
                style={{ marginTop: 6, width: '100%', justifyContent: 'center', display: 'flex', gap: 6, alignItems: 'center' }}
            >
                {busy
                    ? <><Loader2 size={14} className="spin" /> Probing each cookie...</>
                    : 'Test cookies one-by-one & save working ones'}
            </button>

            {perCookie && perCookie.length > 0 && (
                <div style={{
                    marginTop: 8, padding: 8, borderRadius: 6, fontSize: 11,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    maxHeight: 160, overflow: 'auto',
                }}>
                    <strong style={{ color: '#aaa' }}>Per-cookie test results</strong>
                    <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0 0' }}>
                        {perCookie.map((c, i) => (
                            <li key={i} style={{
                                display: 'flex', justifyContent: 'space-between',
                                padding: '3px 0', color: c.ok ? '#2ecc71' : '#ff7777',
                                fontFamily: 'monospace',
                            }}>
                                <span>{c.ok ? '✔' : '✖'} {c.name}</span>
                                <span style={{ opacity: 0.7, fontSize: 10 }}>
                                    {c.ok ? 'authenticates' : (c.error || 'failed').slice(0, 40)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {reply && (
                <div style={{
                    marginTop: 6, padding: 8, borderRadius: 6, fontSize: 11,
                    background: 'rgba(255,255,255,0.05)', color: '#aaa',
                    maxHeight: 100, overflow: 'auto',
                }}>
                    <strong style={{ color: '#2ecc71' }}>Reply preview:</strong> {reply}
                </div>
            )}
            <p className="setup-desc" style={{ marginTop: 8, fontSize: 10 }}>
                Pointed at <code>https://exocore-llama.hf.space/</code>. Each pasted cookie is tested
                individually so we keep only the tokens that actually authenticate.
            </p>
        </div>
    );
};

export const ExoSetupPanel: React.FC<ExoSetupPanelProps> = ({
    kiloProvider, kiloModel,
    onProviderChange, onModelChange,
    onSave,
}) => {
    React.useEffect(() => {
        if (kiloProvider !== 'meta') onProviderChange('meta');
        if (!kiloModel) onModelChange(META_MODELS[0].id);
    }, [kiloProvider, kiloModel, onProviderChange, onModelChange]);

    return (
        <div className="setup-panel custom-scrollbar">
            <div className="setup-title"><KeyRound size={16}/> Setup Llama (exocore-llama)</div>
            <p className="setup-desc">Free Llama via meta.ai cookies, proxied through https://exocore-llama.hf.space/. No API key needed.</p>

            <div className="form-group">
                <label>AI Provider</label>
                <select value="meta" disabled>
                    <option value="meta">exocore-llama — Llama (cookies)</option>
                </select>
            </div>

            <div className="form-group">
                <label>Select Model</label>
                <select value={kiloModel || META_MODELS[0].id} onChange={(e) => onModelChange(e.target.value)}>
                    {META_MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
            </div>

            <MetaCookieSetup />

            <div className="setup-actions">
                <button className="save-btn" onClick={onSave}>Use Llama</button>
            </div>
        </div>
    );
};
