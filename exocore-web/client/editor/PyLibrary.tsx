import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { rpc } from '../access/rpcClient';
import { Search, Loader2, Package2, Download, Trash2, CheckCircle2, AlertCircle, ExternalLink, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

interface PyLibraryProps {
    projectId: string;
    theme: any;
}

interface SearchResult {
    name: string;
    version: string;
    summary: string;
}

interface InstalledPkg {
    name: string;
    version?: string;
    used: boolean;
}

export const PyLibrary: React.FC<PyLibraryProps> = ({ projectId, theme }) => {
    const [tab, setTab] = useState<'search' | 'installed'>('installed');
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [installing, setInstalling] = useState<string | null>(null);
    const [uninstalling, setUninstalling] = useState<string | null>(null);
    const [installed, setInstalled] = useState<InstalledPkg[]>([]);
    const [loadingInstalled, setLoadingInstalled] = useState(false);

    const loadInstalled = useCallback(async () => {
        setLoadingInstalled(true);
        try {
            const res = await rpc.call<any>('pylib.list', { projectId });
            setInstalled(res?.packages || []);
        } catch {
            setInstalled([]);
        } finally {
            setLoadingInstalled(false);
        }
    }, [projectId]);

    useEffect(() => { loadInstalled(); }, [loadInstalled]);

    const search = async () => {
        if (!query.trim()) return;
        setSearching(true);
        try {
            const res = await rpc.call<any>('pylib.search', { q: query.trim() });
            setResults(res?.results || []);
            if ((res?.results || []).length === 0) toast.error('No packages found');
        } catch {
            toast.error('Search failed');
        } finally {
            setSearching(false);
        }
    };

    const install = async (pkg: SearchResult) => {
        setInstalling(pkg.name);
        const tid = toast.loading(`pip install ${pkg.name}...`);
        try {
            const res = await rpc.call<any>('pylib.install', {
                projectId, packageName: pkg.name, version: pkg.version,
            }, { timeoutMs: 180000 });
            if (res?.success) {
                toast.success(`Installed ${pkg.name}`, { id: tid });
                loadInstalled();
            } else {
                toast.error(res?.error || 'Install failed', { id: tid });
            }
        } catch (err: any) {
            toast.error(err?.data?.error || err?.message || 'Install failed', { id: tid });
        } finally {
            setInstalling(null);
        }
    };

    const uninstall = async (name: string) => {
        setUninstalling(name);
        const tid = toast.loading(`Uninstalling ${name}...`);
        try {
            const res = await rpc.call<any>('pylib.uninstall', { projectId, packageName: name }, { timeoutMs: 120000 });
            if (res?.success) {
                toast.success(`Removed ${name}`, { id: tid });
                loadInstalled();
            } else {
                toast.error('Uninstall failed', { id: tid });
            }
        } catch {
            toast.error('Uninstall failed', { id: tid });
        } finally {
            setUninstalling(null);
        }
    };

    const accent = theme.accent || '#00a1ff';
    const border = theme.border || 'rgba(255,255,255,0.08)';
    const usedCount = installed.filter(p => p.used).length;
    const unusedCount = installed.length - usedCount;

    const tabBtn = (t: 'search' | 'installed'): React.CSSProperties => ({
        background: tab === t ? accent : 'transparent',
        color: tab === t ? '#fff' : 'inherit',
        border: 'none',
        padding: '6px 10px',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
    });

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', color: theme.text || '#cbd5e1', overflow: 'hidden' }}>
            <div style={{ display: 'flex', borderBottom: `1px solid ${border}`, padding: '8px 12px', gap: 6, alignItems: 'center' }}>
                <button onClick={() => setTab('installed')} style={tabBtn('installed')}>
                    <Package2 size={12} /> Installed
                    {installed.length > 0 && <span style={{
                        background: tab === 'installed' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)',
                        padding: '1px 6px', borderRadius: 8, fontSize: 10,
                    }}>{installed.length}</span>}
                </button>
                <button onClick={() => setTab('search')} style={tabBtn('search')}>
                    <Search size={12} /> Search
                </button>
                <div style={{ flex: 1 }} />
                <button
                    onClick={loadInstalled}
                    title="Refresh"
                    style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 4, opacity: 0.7 }}
                >
                    <RefreshCw size={13} className={loadingInstalled ? 'spin' : ''} />
                </button>
            </div>

            {tab === 'search' && (
                <div style={{ padding: 12, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && search()}
                            placeholder="Search PyPI (e.g. requests, numpy)"
                            style={{
                                flex: 1, background: 'rgba(255,255,255,0.05)', border: `1px solid ${border}`,
                                borderRadius: 6, padding: '8px 10px', color: 'inherit', fontSize: 13, outline: 'none',
                            }}
                        />
                        <button
                            onClick={search} disabled={searching}
                            style={{ background: accent, color: '#fff', border: 'none', borderRadius: 6, padding: '0 12px', cursor: 'pointer' }}
                        >
                            {searching ? <Loader2 size={14} className="spin" /> : <Search size={14} />}
                        </button>
                    </div>
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        {results.length === 0 && !searching && (
                            <div style={{ textAlign: 'center', opacity: 0.5, fontSize: 12, padding: 30 }}>
                                Search PyPI to install Python packages
                            </div>
                        )}
                        {results.map((pkg) => {
                            const isInstalled = installed.some(p => p.name.toLowerCase() === pkg.name.toLowerCase());
                            return (
                                <div key={pkg.name} style={{
                                    padding: 10, border: `1px solid ${border}`, borderRadius: 6, marginBottom: 8,
                                    background: 'rgba(255,255,255,0.02)',
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <a href={`https://pypi.org/project/${pkg.name}/`} target="_blank" rel="noopener noreferrer"
                                                    style={{ color: 'inherit', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    {pkg.name} <ExternalLink size={10} style={{ opacity: 0.5 }} />
                                                </a>
                                                {pkg.version && <span style={{ opacity: 0.6, fontWeight: 400, fontSize: 11 }}>v{pkg.version}</span>}
                                            </div>
                                            {pkg.summary && <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4, lineHeight: 1.4 }}>{pkg.summary}</div>}
                                        </div>
                                        <button
                                            onClick={() => install(pkg)}
                                            disabled={installing === pkg.name || isInstalled}
                                            style={{
                                                background: isInstalled ? 'rgba(34,197,94,0.2)' : accent,
                                                color: isInstalled ? '#22c55e' : '#fff',
                                                border: 'none', borderRadius: 6, padding: '6px 10px', fontSize: 11,
                                                cursor: isInstalled ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                                whiteSpace: 'nowrap', flexShrink: 0,
                                            }}
                                        >
                                            {installing === pkg.name ? <Loader2 size={11} className="spin" /> :
                                                isInstalled ? <><CheckCircle2 size={11} /> Installed</> :
                                                <><Download size={11} /> Install</>}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {tab === 'installed' && (
                <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                    {installed.length > 0 && (
                        <div style={{ display: 'flex', gap: 8, marginBottom: 10, fontSize: 11 }}>
                            <span style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', padding: '3px 8px', borderRadius: 12, fontWeight: 600 }}>
                                ● {usedCount} active
                            </span>
                            {unusedCount > 0 && (
                                <span style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', padding: '3px 8px', borderRadius: 12, fontWeight: 600 }}>
                                    ○ {unusedCount} unused
                                </span>
                            )}
                        </div>
                    )}
                    {loadingInstalled ? (
                        <div style={{ textAlign: 'center', opacity: 0.6, padding: 30 }}><Loader2 size={18} className="spin" /></div>
                    ) : installed.length === 0 ? (
                        <div style={{ textAlign: 'center', opacity: 0.6, padding: 30, fontSize: 12 }}>
                            <Package2 size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                            <div style={{ marginBottom: 4 }}>No packages installed yet</div>
                            <div style={{ fontSize: 10, opacity: 0.7 }}>Add packages to <code>requirements.txt</code> or use Search</div>
                        </div>
                    ) : (
                        installed.map((p) => (
                            <div key={p.name} style={{
                                padding: '8px 10px', borderBottom: `1px solid ${border}`,
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                            }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                                        {p.used
                                            ? <CheckCircle2 size={12} style={{ color: '#22c55e', flexShrink: 0 }} />
                                            : <AlertCircle size={12} style={{ color: '#fbbf24', flexShrink: 0 }} />}
                                        <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</strong>
                                        {p.version && <span style={{ opacity: 0.6, fontSize: 11 }}>{p.version}</span>}
                                    </div>
                                    <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2, marginLeft: 18 }}>
                                        {p.used ? 'imported in code' : 'not imported anywhere'}
                                    </div>
                                </div>
                                <button
                                    onClick={() => uninstall(p.name)}
                                    disabled={uninstalling === p.name}
                                    title="Uninstall"
                                    style={{
                                        background: 'transparent', border: 'none', color: '#ef4444',
                                        cursor: 'pointer', padding: 6, borderRadius: 4, opacity: 0.7,
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
                                >
                                    {uninstalling === p.name ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />}
                                </button>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};
