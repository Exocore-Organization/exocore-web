import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { rpc } from '../access/rpcClient';
import {
    GitBranch, DownloadCloud, UploadCloud, FolderGit2, Key, Loader2, CheckCircle2, Lock, Globe, RefreshCw, PlusCircle, Link as LinkIcon, FileCheck, ExternalLink, LogOut, XCircle, Search
} from 'lucide-react';
import toast from 'react-hot-toast';
import { get, set, del } from 'idb-keyval';
import { getFileIcon } from './language';

interface GithubPaneProps {
    projectId: string;
    theme: any;
}

export const GithubPane: React.FC<GithubPaneProps> = ({ projectId, theme }) => {
    const [activeTab, setActiveTab] = useState<'clone' | 'sync' | 'auth'>('auth');
    const [isLoading, setIsLoading] = useState(false);
    const [isCheckingDb, setIsCheckingDb] = useState(true);


    const [ghToken, setGhToken] = useState('');
    const [ghUser, setGhUser] = useState('');
    const [ghEmail, setGhEmail] = useState('');

    const [deviceCodeData, setDeviceCodeData] = useState<any>(null);
    const pollInterval = useRef<any>(null);


    const [myRepos, setMyRepos] = useState<any[]>([]);
    const [searchRepo, setSearchRepo] = useState('');
    const [cloneUrl, setCloneUrl] = useState('');
    const [extractToRoot, setExtractToRoot] = useState(false);


    const [isGitRepo, setIsGitRepo] = useState(false);
    const [remoteUrl, setRemoteUrl] = useState('');
    const [repoName, setRepoName] = useState('');
    const [isPrivate, setIsPrivate] = useState(false);
    const [connectUrl, setConnectUrl] = useState('');


    const [commitMsg, setCommitMsg] = useState('');
    const [commitDesc, setCommitDesc] = useState('');


    const [projectFiles, setProjectFiles] = useState<{file: string, status: string}[]>([]);
    const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
    const [trackedFiles, setTrackedFiles] = useState<string[]>([]);
    const [isLoadingFiles, setIsLoadingFiles] = useState(false);


    useEffect(() => {
        const loadCredentials = async () => {
            setIsCheckingDb(true);
            const t = (await get('exo_gh_token')) as string || '';
            const u = (await get('exo_gh_user')) as string || '';
            const e = (await get('exo_gh_email')) as string || '';

            setGhToken(t);
            setGhUser(u);
            setGhEmail(e);

            if (t && u) {
                setActiveTab('sync');
                fetchUserRepos(t);
            }
            setIsCheckingDb(false);
        };
        loadCredentials();
    }, [projectId]);

    const fetchUserRepos = async (token: string) => {
        if (!token) return;
        try {
            const res = await rpc.call<any>('github.repos', { token });
            if (res.success) setMyRepos(res.repos);
        } catch (e) {}
    };

    const checkGitStatus = async () => {
        try {
            const res = await rpc.call<any>('github.status', { projectId });
            setIsGitRepo(res.isGit);
            setRemoteUrl(res.remote || '');
            setTrackedFiles(res.trackedFiles || []);
        } catch (err) {}
    };

    const fetchProjectFiles = async () => {
        setIsLoadingFiles(true);
        try {
            const res = await rpc.call<any>('github.files', { projectId });
            if (res.success) {
                setProjectFiles(res.files);
                setSelectedFiles(res.files.map((f: any) => f.file));
            }
        } catch (err) {} finally {
            setIsLoadingFiles(false);
        }
    };

    const refreshAll = () => {
        checkGitStatus();
        fetchProjectFiles();
    };

    useEffect(() => {
        refreshAll();
        return () => clearInterval(pollInterval.current);
    }, [projectId]);


    const startAutoAuth = async () => {
        setIsLoading(true);
        try {
            const res = await rpc.call<any>('github.authDevice', {});
            setDeviceCodeData(res.data);
            toast.success("Code generated! Please open the link to authorize.");

            pollInterval.current = setInterval(async () => {
                try {
                    const pollRes = await rpc.call<any>('github.authPoll', { device_code: res.data.device_code });
                    if (pollRes.success) {
                        clearInterval(pollInterval.current);

                        setGhToken(pollRes.token);
                        setGhUser(pollRes.username);
                        setGhEmail(pollRes.email);


                        await set('exo_gh_token', pollRes.token);
                        await set('exo_gh_user', pollRes.username);
                        await set('exo_gh_email', pollRes.email);

                        setDeviceCodeData(null);
                        setIsLoading(false);
                        toast.success(`Authenticated as @${pollRes.username}!`);

                        fetchUserRepos(pollRes.token);
                        setActiveTab('sync');
                    } else if (pollRes.error === 'access_denied' || pollRes.error === 'expired_token') {
                        cancelAutoAuth(); toast.error(`Auth Failed: ${pollRes.error}`);
                    }
                } catch (e) {}
            }, 6000);
        } catch (err) {
            toast.error("Failed to start Auto Auth"); setIsLoading(false);
        }
    };

    const cancelAutoAuth = () => { clearInterval(pollInterval.current); setDeviceCodeData(null); setIsLoading(false); };

    const saveManualAuth = async () => {
        if (!ghToken || !ghUser || !ghEmail) return toast.error("Please fill in all Manual Auth fields!");


        await set('exo_gh_token', ghToken);
        await set('exo_gh_user', ghUser);
        await set('exo_gh_email', ghEmail);

        toast.success("GitHub Credentials Saved Securely!");
        setActiveTab('sync');
        fetchUserRepos(ghToken);
    };

    const handleLogout = async () => {
        if (!window.confirm("Disconnect GitHub? This will clear credentials from your browser.")) return;
        setGhToken(''); setGhUser(''); setGhEmail('');


        await del('exo_gh_token');
        await del('exo_gh_user');
        await del('exo_gh_email');

        setMyRepos([]);
        toast.success("GitHub Disconnected!");
    };


    const handleClone = async () => {
        if (!cloneUrl) return toast.error("Please enter a GitHub URL");
        setIsLoading(true); const tid = toast.loading(`Cloning...`);
        try {
            await rpc.call('github.clone', { projectId, repoUrl: cloneUrl, extract: extractToRoot }, { timeoutMs: 180000 });
            toast.success("Repository cloned!", { id: tid }); setCloneUrl(''); refreshAll(); setActiveTab('sync');
        } catch (err: any) { toast.error(err.response?.data?.error || "Failed to clone", { id: tid }); } finally { setIsLoading(false); }
    };

    const handleCreateRepo = async () => {
        if (!ghToken) return toast.error("Authenticate first!");
        if (!repoName) return toast.error("Enter a repository name");
        if (selectedFiles.length === 0) return toast.error("Select at least one file to publish.");
        setIsLoading(true); const tid = toast.loading("Creating and publishing...");
        try {
            await rpc.call('github.create', { projectId, token: ghToken, username: ghUser, email: ghEmail, repoName, isPrivate, files: selectedFiles }, { timeoutMs: 180000 });
            toast.success("Created & pushed!", { id: tid }); refreshAll();
        } catch (err: any) { toast.error(err.response?.data?.error || "Publish failed", { id: tid }); } finally { setIsLoading(false); }
    };

    const handleConnectRepo = async () => {
        if (!connectUrl || !ghToken) return toast.error("Enter URL & Authenticate.");
        setIsLoading(true); const tid = toast.loading("Connecting...");
        try {
            await rpc.call('github.connect', { projectId, repoUrl: connectUrl, token: ghToken, username: ghUser, email: ghEmail }, { timeoutMs: 180000 });
            toast.success("Connected & Pulled!", { id: tid }); refreshAll();
        } catch (err: any) { toast.error("Connect failed", { id: tid }); } finally { setIsLoading(false); }
    };

    const handlePush = async () => {
        if (selectedFiles.length === 0) return toast.error("Select at least one file to push.");
        setIsLoading(true); const tid = toast.loading("Pushing to GitHub...");
        try {
            await rpc.call('github.push', {
                projectId, token: ghToken, username: ghUser, files: selectedFiles, commitMsg, commitDesc
            }, { timeoutMs: 180000 });
            toast.success("Code pushed!", { id: tid });
            setCommitMsg(''); setCommitDesc('');
            refreshAll();
        } catch (err: any) { toast.error("Push failed", { id: tid }); } finally { setIsLoading(false); }
    };

    const handlePull = async () => {
        setIsLoading(true); const tid = toast.loading("Pulling latest code...");
        try {
            await rpc.call('github.pull', { projectId, token: ghToken }, { timeoutMs: 180000 });
            toast.success("Updated!", { id: tid }); refreshAll();
        } catch (err: any) { toast.error("Pull failed", { id: tid }); } finally { setIsLoading(false); }
    };

    const toggleFileSelection = (file: string) => {
        setSelectedFiles(prev => prev.includes(file) ? prev.filter(f => f !== file) : [...prev, file]);
    };

    const renderBadge = (status: string) => {
        if (status.includes('D')) return <span style={{ color: '#ff5555', background: 'rgba(255,85,85,0.1)', padding: '2px 4px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold' }}>Deleted</span>;
        if (status.includes('M')) return <span style={{ color: '#f1fa8c', background: 'rgba(241,250,140,0.1)', padding: '2px 4px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold' }}>Modified</span>;
        if (status.includes('??') || status.includes('U') || status.includes('A')) return <span style={{ color: '#50fa7b', background: 'rgba(80,250,123,0.1)', padding: '2px 4px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold' }}>New</span>;
        return null;
    };

    const filteredRepos = myRepos.filter(r => r.name.toLowerCase().includes(searchRepo.toLowerCase()));

    if (isCheckingDb) return <div style={{ display: 'flex', justifyContent: 'center', padding: '50px', color: theme.accent }}><Loader2 className="spin-loader"/></div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: theme.surface, color: theme.textMain, overflow: 'hidden' }}>
        {}
        <div style={{ padding: '15px 20px', borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <GitBranch size={16} color={theme.accent} />
        <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1px', opacity: 0.8 }}>GITHUB MANAGER</span>
        </div>

        {}
        <div style={{ display: 'flex', borderBottom: `1px solid ${theme.border}` }}>
        {['auth', 'clone', 'sync'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab as any)} style={{
                flex: 1, padding: '12px', background: 'none', border: 'none', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold',
                color: activeTab === tab ? theme.accent : theme.textMuted,
                borderBottom: activeTab === tab ? `2px solid ${theme.accent}` : '2px solid transparent'
            }}>
            {tab.toUpperCase()}
            </button>
        ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '15px' }} className="custom-scrollbar">

        {}
        {activeTab === 'auth' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ background: theme.bg, padding: '15px', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: theme.accent, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}><Key size={14} /> Authentication Status</div>
            {ghToken ? (
                <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(80, 250, 123, 0.05)', padding: '15px', borderRadius: '6px', border: '1px solid rgba(80, 250, 123, 0.2)', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <CheckCircle2 size={24} color="#50fa7b" />
                <div>
                <div style={{ fontSize: '11px', color: theme.textMuted }}>Securely Connected (IndexedDB)</div>
                <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#50fa7b' }}>@{ghUser}</div>
                </div>
                </div>
                <div style={{ borderTop: `1px dashed rgba(255,255,255,0.1)`, paddingTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={handleLogout} style={{ background: 'transparent', border: '1px solid rgba(255, 85, 85, 0.3)', color: '#ff5555', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}><LogOut size={12} /> Disconnect</button>
                </div>
                </div>
            ) : (
                <>
                {deviceCodeData ? (
                    <div style={{ background: 'rgba(139, 233, 253, 0.1)', padding: '15px', borderRadius: '6px', border: '1px solid rgba(139, 233, 253, 0.3)', textAlign: 'center' }}>
                    <p style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '10px' }}>1. Copy this verification code:</p>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff', letterSpacing: '4px', background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '6px', marginBottom: '15px' }}>{deviceCodeData.user_code}</div>
                    <p style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '10px' }}>2. Click the link below and paste the code.</p>
                    <a href={deviceCodeData.verification_uri} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 'bold', color: '#8be9fd', textDecoration: 'none', marginBottom: '15px', background: 'rgba(139, 233, 253, 0.2)', padding: '8px 12px', borderRadius: '4px' }}><ExternalLink size={14}/> Open GitHub</a>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '5px', fontSize: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#50fa7b' }}><Loader2 size={12} className="spin-loader"/> Waiting for approval...</div>
                    <button onClick={cancelAutoAuth} style={{ background: 'none', border: 'none', color: '#ff5555', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}><XCircle size={12}/> Cancel</button>
                    </div>
                    </div>
                ) : (
                    <button onClick={startAutoAuth} disabled={isLoading} style={{ width: '100%', background: theme.surface, color: '#fff', border: `1px solid ${theme.border}`, padding: '12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 'bold' }}>{isLoading ? <Loader2 size={16} className="spin-loader"/> : <GitBranch size={16}/>} Login with GitHub</button>
                )}

                {!deviceCodeData && (
                    <div style={{ marginTop: '20px', borderTop: `1px dashed ${theme.border}`, paddingTop: '15px' }}>
                    <p style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '10px' }}>Having trouble with Auto Login? Enter your PAT manually:</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <input placeholder="GitHub Username" value={ghUser} onChange={e => setGhUser(e.target.value)} className="gh-input" />
                    <input placeholder="GitHub Email" value={ghEmail} onChange={e => setGhEmail(e.target.value)} className="gh-input" />
                    <input type="password" placeholder="ghp_xxxxxxxxxxxxxxx" value={ghToken} onChange={e => setGhToken(e.target.value)} className="gh-input" />
                    <button onClick={saveManualAuth} style={{ width: '100%', background: theme.surface, color: '#8be9fd', border: `1px solid ${theme.border}`, padding: '8px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '11px' }}>Save Manual Login Securely</button>
                    </div>
                    </div>
                )}
                </>
            )}
            </div>
            </div>
        )}

        {}
        {activeTab === 'clone' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {ghToken && myRepos.length > 0 && (
                <div style={{ background: theme.bg, padding: '15px', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: theme.accent, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}><Search size={14} /> My Repositories</div>
                <div style={{ position: 'relative', marginBottom: '10px' }}>
                <input placeholder="Search your repos..." value={searchRepo} onChange={e => setSearchRepo(e.target.value)} className="gh-input" style={{ paddingLeft: '30px' }} />
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: theme.textMuted }} />
                </div>
                <div style={{ maxHeight: '150px', overflowY: 'auto', background: theme.surface, borderRadius: '6px', border: `1px solid ${theme.border}` }} className="custom-scrollbar">
                {filteredRepos.map(repo => (
                    <div key={repo.name} onClick={() => setCloneUrl(repo.clone_url)} style={{ padding: '8px 10px', fontSize: '11px', cursor: 'pointer', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="repo-item-hover">
                    {}
                    <span className="notranslate" translate="no">{repo.name}</span>
                    {repo.private ? <Lock size={10} color={theme.textMuted}/> : <Globe size={10} color={theme.textMuted}/>}
                    </div>
                ))}
                {filteredRepos.length === 0 && <div style={{ padding: '10px', fontSize: '11px', color: theme.textMuted, textAlign: 'center' }}>No repositories found.</div>}
                </div>
                </div>
            )}

            <div style={{ background: theme.bg, padding: '15px', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: theme.accent, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}><DownloadCloud size={14} /> Clone Repository</div>
            <input placeholder="https://github.com/user/repo.git" value={cloneUrl} onChange={e => setCloneUrl(e.target.value)} className="gh-input" style={{ marginBottom: '10px' }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', cursor: 'pointer', marginBottom: '15px', color: theme.textMuted }}>
            <input type="checkbox" checked={extractToRoot} onChange={e => setExtractToRoot(e.target.checked)} style={{ accentColor: theme.accent }} />
            Extract directly to project root
            </label>
            <button onClick={handleClone} disabled={isLoading} style={{ width: '100%', background: isLoading ? theme.surface : '#50fa7b', color: isLoading ? theme.textMuted : '#000', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 'bold', cursor: isLoading ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
            {isLoading ? <Loader2 size={16} className="spin-loader" /> : <FolderGit2 size={16} />} Clone to Project
            </button>
            </div>
            </div>
        )}

        {}
        {activeTab === 'sync' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ background: theme.bg, padding: '15px', borderRadius: '8px', border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: theme.accent, marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FileCheck size={14} /> Select Changes</div>
            <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={refreshAll} style={{ background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer' }}><RefreshCw size={12}/></button>
            <button onClick={() => setSelectedFiles(selectedFiles.length === projectFiles.length ? [] : projectFiles.map(f => f.file))} style={{ background: 'none', border: 'none', color: '#8be9fd', fontSize: '10px', cursor: 'pointer' }}>
            {selectedFiles.length === projectFiles.length ? 'Deselect All' : 'Select All'}
            </button>
            </div>
            </div>

            {isLoadingFiles ? <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}><Loader2 size={16} className="spin-loader" color={theme.accent}/></div> : (
                <div style={{ maxHeight: '180px', overflowY: 'auto', overflowX: 'hidden', background: theme.surface, padding: '5px', borderRadius: '6px', border: `1px solid ${theme.border}` }} className="custom-scrollbar">
                {projectFiles.map(f => (
                    <label key={f.file} className="file-item">
                    <input type="checkbox" checked={selectedFiles.includes(f.file)} onChange={() => toggleFileSelection(f.file)} style={{ accentColor: theme.accent }} />
                    {getFileIcon(f.file)}
                    {}
                    <span className="notranslate" translate="no" title={f.file} style={{ textDecoration: f.status.includes('D') ? 'line-through' : 'none', opacity: f.status.includes('D') ? 0.6 : 1 }}>{f.file}</span>
                    {renderBadge(f.status)}
                    </label>
                ))}
                {projectFiles.length === 0 && <span style={{ fontSize: '10px', opacity: 0.5, padding: '10px', display: 'block', textAlign: 'center' }}>No uncommitted files found.</span>}
                </div>
            )}
            </div>

            {isGitRepo ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ background: 'rgba(80, 250, 123, 0.05)', padding: '15px', borderRadius: '8px', border: '1px solid rgba(80, 250, 123, 0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <CheckCircle2 size={18} color="#50fa7b" style={{ flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '10px', color: theme.textMuted }}>Connected to remote</div>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#50fa7b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={remoteUrl}>{remoteUrl || 'Local Repo'}</div>
                </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={handlePull} disabled={isLoading} style={{ flex: 1, background: theme.surface, color: '#fff', border: `1px solid ${theme.border}`, padding: '8px', borderRadius: '4px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
                <DownloadCloud size={14} /> Pull
                </button>
                {remoteUrl && (
                    <a href={remoteUrl.replace('.git', '')} target="_blank" rel="noreferrer" style={{ flex: 1, textDecoration: 'none', background: 'rgba(139, 233, 253, 0.1)', color: '#8be9fd', border: '1px solid rgba(139, 233, 253, 0.3)', padding: '8px', borderRadius: '4px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 'bold' }}>
                    <ExternalLink size={14} /> Visit Repo
                    </a>
                )}
                </div>
                </div>

                <div style={{ background: theme.bg, padding: '15px', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: theme.accent, marginBottom: '10px' }}>Commit Details</div>
                <input placeholder="Commit message (e.g. Fixed login bug)" value={commitMsg} onChange={e => setCommitMsg(e.target.value)} className="gh-input" style={{ marginBottom: '10px' }} />
                <textarea placeholder="Extended description (optional)" value={commitDesc} onChange={e => setCommitDesc(e.target.value)} className="gh-input" style={{ resize: 'vertical', minHeight: '60px', marginBottom: '15px' }} />

                <button onClick={handlePush} disabled={isLoading || projectFiles.length === 0} style={{ width: '100%', background: (isLoading || projectFiles.length === 0) ? theme.surface : '#50fa7b', color: (isLoading || projectFiles.length === 0) ? theme.textMuted : '#000', border: 'none', padding: '10px', borderRadius: '6px', cursor: (isLoading || projectFiles.length === 0) ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
                {isLoading ? <Loader2 size={16} className="spin-loader"/> : <UploadCloud size={14} />} Commit & Push
                </button>
                </div>

                <div style={{ background: theme.bg, padding: '15px', borderRadius: '8px', border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: theme.accent, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FolderGit2 size={14} /> Repository Files
                </div>
                <div style={{ maxHeight: '150px', overflowY: 'auto', overflowX: 'hidden', background: theme.surface, padding: '5px', borderRadius: '6px', border: `1px solid ${theme.border}` }} className="custom-scrollbar">
                {trackedFiles.map(file => (
                    <div key={file} className="file-item" style={{ cursor: 'default' }}>
                    {getFileIcon(file)}
                    {}
                    <span className="notranslate" translate="no" title={file}>{file}</span>
                    </div>
                ))}
                {trackedFiles.length === 0 && <span style={{ fontSize: '10px', opacity: 0.5, padding: '10px', display: 'block', textAlign: 'center' }}>No tracked files yet.</span>}
                </div>
                </div>
                </div>
            ) : (
                <>
                <div style={{ background: theme.bg, padding: '15px', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: theme.accent, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}><PlusCircle size={14} /> Create & Publish</div>
                <input placeholder="New Repository Name" value={repoName} onChange={e => setRepoName(e.target.value)} className="gh-input" style={{ marginBottom: '10px' }} />
                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                <button onClick={() => setIsPrivate(false)} style={{ flex: 1, padding: '8px', fontSize: '11px', borderRadius: '4px', border: `1px solid ${!isPrivate ? theme.accent : theme.border}`, background: !isPrivate ? 'rgba(255,255,255,0.1)' : 'transparent', color: '#fff', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '5px' }}><Globe size={14} /> Public</button>
                <button onClick={() => setIsPrivate(true)} style={{ flex: 1, padding: '8px', fontSize: '11px', borderRadius: '4px', border: `1px solid ${isPrivate ? theme.accent : theme.border}`, background: isPrivate ? 'rgba(255,255,255,0.1)' : 'transparent', color: '#fff', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '5px' }}><Lock size={14} /> Private</button>
                </div>
                <button onClick={handleCreateRepo} disabled={isLoading} style={{ width: '100%', background: '#00a1ff', color: '#fff', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                {isLoading ? <Loader2 size={16} className="spin-loader" /> : <UploadCloud size={16} />} Publish Repo
                </button>
                </div>

                <div style={{ background: theme.bg, padding: '15px', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: theme.accent, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}><LinkIcon size={14} /> Connect Existing Repo</div>
                <input placeholder="https://github.com/user/repo.git" value={connectUrl} onChange={e => setConnectUrl(e.target.value)} className="gh-input" style={{ marginBottom: '10px' }} />
                <button onClick={handleConnectRepo} disabled={isLoading} style={{ width: '100%', background: theme.surface, color: '#fff', border: `1px solid ${theme.border}`, padding: '10px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                {isLoading ? <Loader2 size={16} className="spin-loader" /> : <RefreshCw size={16} />} Connect & Pull
                </button>
                </div>
                </>
            )}
            </div>
        )}
        </div>

        <style>{`
            .spin-loader { animation: spin 1s linear infinite; }
            @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

            .gh-input {
                width: 100%; background: ${theme.surface}; border: 1px solid ${theme.border};
                color: #fff; padding: 10px; border-radius: 6px; outline: none; font-size: 12px; box-sizing: border-box; font-family: inherit;
            }
            .gh-input:focus { border-color: ${theme.accent}; }
            .repo-item-hover:hover { background: rgba(255,255,255,0.05); }

            .file-item {
                display: flex; align-items: center; gap: 8px; font-size: 12px;
                padding: 6px 8px; cursor: pointer; border-radius: 4px; transition: background 0.2s ease;
                user-select: none; width: 100%; box-sizing: border-box; max-width: 100%;
            }
            .file-item:hover { background: rgba(255, 255, 255, 0.05); }
            .file-item input[type="checkbox"] { margin: 0; width: 14px; height: 14px; flex-shrink: 0; cursor: pointer; }
            .file-item span {
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                flex: 1 1 auto; min-width: 0; display: block;
            }
            `}</style>
            </div>
    );
};
