import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { rpc } from '../access/rpcClient';
import {
    Search, Trash2, Loader2, BookOpen, ChevronDown, X, UploadCloud, FileCheck, Key, CheckCircle2, LogOut, FolderGit2
} from 'lucide-react';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import { get, set, del } from 'idb-keyval';
import { getFileIcon } from './language';

interface NpmPaneProps {
    projectId: string;
    theme: any;
}

export const NpmPane: React.FC<NpmPaneProps> = ({ projectId, theme }) => {
    const [activeTab, setActiveTab] = useState<'search' | 'installed' | 'publish'>('search');
    const [query, setQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    const [selectedPkg, setSelectedPkg] = useState<any>(null);
    const [pkgDetails, setPkgDetails] = useState<{ versions: string[], readme: string } | null>(null);
    const [selectedVersion, setSelectedVersion] = useState('');
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);
    const [installingPkg, setInstallingPkg] = useState<string | null>(null);

    const [pkgNpmFiles, setPkgNpmFiles] = useState<string[]>([]);
    const [isLoadingPkgFiles, setIsLoadingPkgFiles] = useState(false);

    const [installedPkgs, setInstalledPkgs] = useState<any[]>([]);
    const [isLoadingInstalled, setIsLoadingInstalled] = useState(false);

    const [npmUser, setNpmUser] = useState<string | null>(null);
    const [npmToken, setNpmToken] = useState<string | null>(null);
    const [npmManualToken, setNpmManualToken] = useState('');
    const [isCheckingAuth, setIsCheckingAuth] = useState(false);

    const [projectFiles, setProjectFiles] = useState<string[]>([]);
    const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
    const [isPublishing, setIsPublishing] = useState(false);
    const [isLoadingFiles, setIsLoadingFiles] = useState(false);

    useEffect(() => {
        const loadNpmAuth = async () => {
            const u = (await get('exo_npm_user')) as string || null;
            const t = (await get('exo_npm_token')) as string || null;
            if (u && t) {
                setNpmUser(u);
                setNpmToken(t);
            }
        };
        loadNpmAuth();
    }, [projectId]);

    const autoInstallTriedRef = useRef(false);

    const fetchInstalled = async (opts?: { silent?: boolean }) => {
        setIsLoadingInstalled(true);
        try {
            const res = await rpc.call<any>('npm.list', { projectId });
            if (res.success) {
                const pkgs = res.packages || [];
                setInstalledPkgs(pkgs);

                
                
                if (pkgs.length === 0 && !autoInstallTriedRef.current) {
                    autoInstallTriedRef.current = true;
                    runAutoInstall();
                }
            }
        } catch (err) {
            if (!opts?.silent) toast.error("Failed to load packages");
        } finally {
            setIsLoadingInstalled(false);
        }
    };

    const runAutoInstall = async () => {
        const tid = toast.loading("Auto-installing project dependencies...");
        try {
            const res = await rpc.call<any>('npm.installAll', { projectId, token: npmToken }, { timeoutMs: 180000 });
            if (res.skipped) {
                toast.dismiss(tid);
                return;
            }
            toast.success("Dependencies installed!", { id: tid });

            const r2 = await rpc.call<any>('npm.list', { projectId });
            if (r2.success) setInstalledPkgs(r2.packages || []);
        } catch (err) {
            toast.error("Auto-install failed. Try manual install.", { id: tid });
        }
    };

    const saveNpmManualToken = async () => {
        if (!npmManualToken.trim()) return toast.error("Please enter your NPM Access Token.");
        setIsCheckingAuth(true);

        try {
            const res = await rpc.call<any>('npm.whoami', { projectId, token: npmManualToken });
            const verifiedUser = res.username || 'npm_user';

            await set('exo_npm_token', npmManualToken);
            await set('exo_npm_user', verifiedUser);

            setNpmToken(npmManualToken);
            setNpmUser(verifiedUser);
            setNpmManualToken('');
            toast.success("NPM Token saved securely to browser!");

        } catch (err) {
            toast.error("Failed to verify NPM token.");
        } finally {
            setIsCheckingAuth(false);
        }
    };

    const handleLogout = async () => {
        if (!window.confirm("Disconnect NPM? This removes your token from this browser's database.")) return;

        setNpmUser(null);
        setNpmToken(null);

        await del('exo_npm_user');
        await del('exo_npm_token');

        await rpc.call('npm.logout', { projectId }).catch(()=>{});

        toast.success("Successfully logged out securely!");
    };

    const fetchProjectFiles = async () => {
        setIsLoadingFiles(true);
        try {
            const res = await rpc.call<any>('npm.files', { projectId });
            if (res.success) {
                const filtered = res.files.filter((f: string) => !f.includes('node_modules') && !f.startsWith('.git'));
                setProjectFiles(filtered);
                setSelectedFiles(filtered);
            }
        } catch (err) {
            toast.error("Failed to load project files");
        } finally {
            setIsLoadingFiles(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'installed') fetchInstalled();
        if (activeTab === 'publish') {
            fetchProjectFiles();
        }
    }, [activeTab]);

    useEffect(() => {
        if (selectedPkg && selectedVersion) {
            const fetchNpmPublishedFiles = async () => {
                setIsLoadingPkgFiles(true);
                try {
                    const res = await axios.get(`https://data.jsdelivr.com/v1/packages/npm/${selectedPkg.package.name}@${selectedVersion}`);
                    const flatten = (files: any[], prefix = '') => {
                        let arr: string[] = [];
                        for(const f of files) {
                            if(f.type === 'directory') arr.push(...flatten(f.files, prefix + f.name + '/'));
                            else arr.push(prefix + f.name);
                        }
                        return arr;
                    };
                    setPkgNpmFiles(flatten(res.data.files));
                } catch (e) {
                    setPkgNpmFiles([]);
                } finally {
                    setIsLoadingPkgFiles(false);
                }
            };
            fetchNpmPublishedFiles();
        }
    }, [selectedPkg, selectedVersion]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;
        setIsSearching(true);
        try {
            const res = await axios.get(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=20`);
            setSearchResults(res.data.objects || []);
        } catch (err) {
            toast.error("NPM Search Failed");
        } finally {
            setIsSearching(false);
        }
    };

    const openPackageDetails = async (pkg: any) => {
        setSelectedPkg(pkg);
        setIsLoadingDetails(true);
        setPkgNpmFiles([]);
        try {
            const res = await rpc.call<any>('npm.info', { packageName: pkg.package.name });
            setPkgDetails(res);
            setSelectedVersion(pkg.package.version);
        } catch (err) {
            toast.error("Could not fetch details");
        } finally {
            setIsLoadingDetails(false);
        }
    };

    const handleInstall = async () => {
        if (!selectedPkg) return;
        const fullPkgName = `${selectedPkg.package.name}@${selectedVersion}`;
        setInstallingPkg(selectedPkg.package.name);
        const tid = toast.loading(`Installing ${fullPkgName}...`);

        try {
            await rpc.call('npm.install', {
                projectId, packageName: fullPkgName, token: npmToken
            }, { timeoutMs: 180000 });
            toast.success(`${fullPkgName} installed!`, { id: tid });
            setSelectedPkg(null);
            if (activeTab === 'installed') fetchInstalled();
        } catch (err) {
            toast.error(`Installation failed`, { id: tid });
        } finally {
            setInstallingPkg(null);
        }
    };

    const handleUninstall = async (pkgName: string) => {
        const tid = toast.loading(`Uninstalling ${pkgName}...`);
        try {
            await rpc.call('npm.uninstall', {
                projectId, packageName: pkgName, token: npmToken
            }, { timeoutMs: 120000 });
            toast.success(`${pkgName} removed!`, { id: tid });
            fetchInstalled();
        } catch (err) {
            toast.error(`Removal failed`, { id: tid });
        }
    };

    const toggleFileSelection = (file: string) => {
        setSelectedFiles(prev =>
        prev.includes(file) ? prev.filter(f => f !== file) : [...prev, file]
        );
    };

    const handlePublish = async () => {
        if (!npmToken) return toast.error("Please login to NPM using an Access Token first!");
        if (selectedFiles.length === 0) return toast.error("Select at least one file/folder to publish.");

        setIsPublishing(true);
        const tid = toast.loading("Publishing package to NPM...");

        try {
            await rpc.call('npm.publish', {
                projectId,
                files: selectedFiles,
                token: npmToken
            }, { timeoutMs: 180000 });
            toast.success("Package published successfully! 🚀", { id: tid });
        } catch (err: any) {
            toast.error(err.response?.data?.error || "Publish failed. Did you increment the version?", { id: tid });
        } finally {
            setIsPublishing(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: theme.surface, color: theme.textMain, position: 'relative' }}>
        <div style={{ padding: '15px 20px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1px', opacity: 0.6 }}>NPM MANAGER</span>
        <div style={{ fontSize: '10px', background: theme.accent, color: '#000', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold' }}>
        {installedPkgs.length} PKGS
        </div>
        </div>

        <div style={{ display: 'flex', borderBottom: `1px solid ${theme.border}` }}>
        {['search', 'installed', 'publish'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab as any)} style={{
                flex: 1, padding: '12px', background: 'none', border: 'none', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold',
                color: activeTab === tab ? theme.accent : theme.textMuted,
                borderBottom: activeTab === tab ? `2px solid ${theme.accent}` : '2px solid transparent'
            }}>
            {tab.toUpperCase()}
            </button>
        ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }} className="custom-scrollbar">

        {}
        {activeTab === 'search' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px' }}>
            {}
            <input
            className="notranslate" translate="no"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search NPM Packages..."
            style={{ flex: 1, background: theme.bg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '10px', borderRadius: '6px', outline: 'none', fontSize: '12px' }}
            />
            <button type="submit" style={{ background: theme.accent, border: 'none', width: '40px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isSearching ? <Loader2 size={16} className="spin-loader" /> : <Search size={16} />}
            </button>
            </form>

            {searchResults.map((res: any) => (
                <div key={res.package.name} onClick={() => openPackageDetails(res)} className="pkg-card" style={{ padding: '12px', background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer', transition: '0.2s' }}>
                <div className="notranslate" translate="no" style={{ fontWeight: 'bold', fontSize: '13px', color: theme.accent }}>{res.package.name}</div>
                <p style={{ fontSize: '11px', color: theme.textMuted, margin: '8px 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {res.package.description}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                <span style={{ fontSize: '10px', opacity: 0.5 }}>v{res.package.version}</span>
                <BookOpen size={14} style={{ opacity: 0.5 }} />
                </div>
                </div>
            ))}
            </div>
        )}

        {}
        {activeTab === 'installed' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {isLoadingInstalled ? <div style={{textAlign: 'center', padding: '20px'}}><Loader2 className="spin-loader" /></div> : installedPkgs.map((pkg) => (
                <div key={pkg.name} style={{ padding: '10px', background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                <div className="notranslate" translate="no" style={{ fontWeight: 'bold', fontSize: '13px' }}>{pkg.name}</div>
                <div style={{ fontSize: '10px', color: pkg.isUsed ? '#50fa7b' : '#ff5555', marginTop: '4px' }}>
                v{pkg.version.replace(/[\^~]/, '')} • {pkg.isUsed ? 'Active' : 'Unused'}
                </div>
                </div>
                <button onClick={() => handleUninstall(pkg.name)} style={{ background: 'none', border: 'none', color: '#ff5555', cursor: 'pointer' }}>
                <Trash2 size={16} />
                </button>
                </div>
            ))}
            </div>
        )}

        {}
        {activeTab === 'publish' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>

            <div style={{ background: theme.bg, padding: '15px', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: theme.accent, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Key size={14} /> 1. Authentication Status
            </div>

            {npmToken ? (
                <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(80, 250, 123, 0.05)', padding: '15px', borderRadius: '6px', border: '1px solid rgba(80, 250, 123, 0.2)', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <CheckCircle2 size={24} color="#50fa7b" />
                <div>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>Securely Logged In (IndexedDB)</div>
                <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#50fa7b', letterSpacing: '0.5px' }}>@{npmUser}</div>
                </div>
                </div>
                <div style={{ borderTop: `1px dashed ${theme.border}`, paddingTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={handleLogout} className="logout-btn-hover" style={{ background: 'transparent', border: '1px solid rgba(255, 85, 85, 0.3)', color: '#ff5555', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', transition: 'all 0.2s ease' }}>
                <LogOut size={12} /> Disconnect Account
                </button>
                </div>
                </div>
            ) : (
                <div style={{ marginTop: '5px' }}>
                <p style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '10px', lineHeight: '1.4' }}>
                To prevent server leaks, Exocore requires an NPM Personal Access Token. This token is stored securely in your browser's IndexedDB.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* 🟢 PROTECTED: Token Input 🟢 */}
                <input
                type="password"
                placeholder="npm_..."
                value={npmManualToken}
                onChange={e => setNpmManualToken(e.target.value)}
                className="gh-input notranslate" translate="no"
                />
                <button onClick={saveNpmManualToken} disabled={isCheckingAuth} style={{ width: '100%', background: theme.surface, color: '#8be9fd', border: `1px solid ${theme.border}`, padding: '10px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '11px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                {isCheckingAuth ? <Loader2 size={14} className="spin-loader" /> : <Key size={14} />}
                {isCheckingAuth ? 'Verifying...' : 'Save Token Securely'}
                </button>
                </div>
                <a href="https://docs.npmjs.com/creating-and-viewing-access-tokens" target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: '10px', fontSize: '10px', color: theme.accent, textDecoration: 'none', textAlign: 'center' }}>
                How to create an NPM Access Token?
                </a>
                </div>
            )}
            </div>

            <div style={{ background: theme.bg, padding: '15px', borderRadius: '8px', border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: theme.accent, marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FileCheck size={14} /> 2. Files to Publish</div>
            <button onClick={() => setSelectedFiles(selectedFiles.length === projectFiles.length ? [] : [...projectFiles])} style={{ background: 'none', border: 'none', color: '#8be9fd', fontSize: '10px', cursor: 'pointer' }}>
            {selectedFiles.length === projectFiles.length ? 'Deselect All' : 'Select All'}
            </button>
            </div>
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '10px', opacity: 0.8 }}>
            node_modules and hidden files are ignored automatically.
            </p>

            {isLoadingFiles ? <Loader2 size={16} className="spin-loader" /> : (
                <div style={{ maxHeight: '180px', overflowY: 'auto', overflowX: 'hidden', background: theme.surface, padding: '5px', borderRadius: '6px', border: `1px solid ${theme.border}` }} className="custom-scrollbar">
                {projectFiles.map(file => (
                    <label key={file} className="file-item-publish">
                    <input
                    type="checkbox"
                    checked={selectedFiles.includes(file)}
                    onChange={() => toggleFileSelection(file)}
                    style={{ accentColor: theme.accent, margin: 0, width: '14px', height: '14px', flexShrink: 0, cursor: 'pointer' }}
                    />
                    {getFileIcon(file)}
                    <span className="notranslate" translate="no" title={file}>{file}</span>
                    </label>
                ))}
                {projectFiles.length === 0 && <span style={{ fontSize: '10px', opacity: 0.5, padding: '10px', display: 'block', textAlign: 'center' }}>No files found to publish.</span>}
                </div>
            )}
            </div>

            <button onClick={handlePublish} disabled={isPublishing || !npmToken} style={{
                width: '100%', background: (isPublishing || !npmToken) ? theme.surface : '#50fa7b', color: (isPublishing || !npmToken) ? theme.textMuted : '#000', border: 'none', padding: '12px', borderRadius: '6px', fontWeight: 'bold', cursor: (isPublishing || !npmToken) ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px'
            }}>
            {isPublishing ? <Loader2 size={16} className="spin-loader" /> : <UploadCloud size={16} />}
            {isPublishing ? 'Publishing...' : 'Publish to NPM'}
            </button>
            </div>
        )}
        </div>

        {selectedPkg && (
            <div style={{ position: 'absolute', inset: 0, background: theme.surface, zIndex: 100, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '15px', borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => setSelectedPkg(null)} style={{ background: 'none', border: 'none', color: theme.textMain, cursor: 'pointer' }}><X size={20}/></button>
            <div style={{ flex: 1 }}>
            <div className="notranslate" translate="no" style={{ fontWeight: 'bold', fontSize: '16px', color: theme.accent }}>{selectedPkg.package.name}</div>
            <div style={{ fontSize: '11px', opacity: 0.5 }}>Package Info & Published Files</div>
            </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }} className="custom-scrollbar">
            {isLoadingDetails ? <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}><Loader2 className="spin-loader" /></div> : (
                <>
                <div style={{ background: theme.bg, padding: '15px', borderRadius: '8px', marginBottom: '20px', border: `1px solid ${theme.border}` }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold', display: 'block', marginBottom: '8px', opacity: 0.5 }}>SELECT VERSION</label>
                <div style={{ position: 'relative' }}>
                <select
                value={selectedVersion}
                onChange={(e) => setSelectedVersion(e.target.value)}
                style={{ width: '100%', background: theme.surface, color: theme.textMain, border: `1px solid ${theme.border}`, padding: '10px', borderRadius: '6px', outline: 'none', appearance: 'none' }}
                >
                {(pkgDetails?.versions || []).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '12px', pointerEvents: 'none' }} />
                </div>
                <button onClick={handleInstall} disabled={!!installingPkg} style={{
                    width: '100%', marginTop: '15px', background: theme.accent, color: '#000', border: 'none', padding: '12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer'
                }}>
                {installingPkg ? 'Installing...' : `Install v${selectedVersion}`}
                </button>
                </div>

                <div style={{ background: theme.bg, padding: '15px', borderRadius: '8px', marginBottom: '20px', border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: theme.accent, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FolderGit2 size={14} /> Currently Published Files
                </div>
                <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '10px', opacity: 0.8 }}>
                Live contents of <strong className="notranslate" translate="no">{selectedPkg.package.name}@{selectedVersion}</strong> on NPM Registry.
                </p>

                <div className="custom-scrollbar" style={{ maxHeight: '180px', overflowY: 'auto', overflowX: 'hidden', background: theme.surface, padding: '5px', borderRadius: '6px', border: `1px solid ${theme.border}` }}>
                {isLoadingPkgFiles ? <div style={{ padding: '10px', display: 'flex', justifyContent: 'center' }}><Loader2 size={16} className="spin-loader"/></div> : (
                    pkgNpmFiles.map(f => (
                        <div key={f} className="file-item-npm">
                        {getFileIcon(f)}
                        <span className="notranslate" translate="no" title={f}>{f}</span>
                        </div>
                    ))
                )}
                {!isLoadingPkgFiles && pkgNpmFiles.length === 0 && <span style={{ fontSize: '10px', opacity: 0.5, padding: '10px', display: 'block', textAlign: 'center' }}>No files to display.</span>}
                </div>
                </div>

                <div className="markdown-body" style={{ fontSize: '13px', lineHeight: '1.6', color: theme.textMain }}>
                <ReactMarkdown>{pkgDetails?.readme || ''}</ReactMarkdown>
                </div>
                </>
            )}
            </div>
            </div>
        )}

        <style>{`
            .spin-loader { animation: spin 1s linear infinite; }
            @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            .pkg-card:hover { border-color: ${theme.accent} !important; background: ${theme.surface} !important; }

            .logout-btn-hover:hover {
                background: rgba(255, 85, 85, 0.15) !important;
                border-color: rgba(255, 85, 85, 0.6) !important;
            }

            .gh-input {
                width: 100%; background: ${theme.surface}; border: 1px solid ${theme.border};
                color: ${theme.textMain}; padding: 10px; border-radius: 6px; outline: none; font-size: 12px; box-sizing: border-box; font-family: inherit;
            }
            .gh-input:focus { border-color: ${theme.accent}; }

            .file-item-publish {
                display: flex; align-items: center; gap: 10px; font-size: 12px;
                padding: 6px 8px; cursor: pointer; border-radius: 4px; transition: background 0.2s ease;
                user-select: none; width: 100%; box-sizing: border-box; max-width: 100%;
            }
            .file-item-publish:hover { background: ${theme.surface}; }
            .file-item-publish span {
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                flex: 1 1 auto; min-width: 0; display: block;
            }

            .file-item-npm {
                display: flex; align-items: center; gap: 10px; font-size: 12px;
                padding: 6px 8px; border-radius: 4px;
                width: 100%; box-sizing: border-box; max-width: 100%;
            }
            .file-item-npm span {
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                flex: 1 1 auto; min-width: 0; display: block;
            }

            .markdown-body h1, .markdown-body h2 { border-bottom: 1px solid ${theme.border}; padding-bottom: 8px; margin-top: 24px; color: ${theme.accent}; }
            .markdown-body code { background: ${theme.surface}; padding: 2px 4px; border-radius: 4px; font-family: monospace; color: ${theme.accent}; }
            .markdown-body pre { background: ${theme.bg}; padding: 15px; border-radius: 8px; overflow-x: auto; margin: 15px 0; border: 1px solid ${theme.border}; color: ${theme.textMain}; }
            `}</style>
            </div>
    );
};
