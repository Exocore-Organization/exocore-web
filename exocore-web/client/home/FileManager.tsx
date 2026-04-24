import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import systemData from '../system.json';
import AnsiText from '../shared/components/AnsiText';
import { getTemplateIcon } from '../shared/components/IconTemplate';
import { CreateProjectWizard } from './CreateProjectWizard';
import type { CreateForm } from './CreateProjectWizard';

// Same language → icon-key map used by ProjectNodeCard so the file manager
// shows the proper colorful language icon instead of a generic 📦 emoji.
const LANG_ICON_KEY: Record<string, string> = {
    nodejs: 'node', node: 'node', js: 'js', javascript: 'js',
    ts: 'typescript', typescript: 'typescript',
    py: 'python', python: 'python',
    rb: 'ruby', ruby: 'ruby',
    rs: 'rust', rust: 'rust',
    go: 'go', java: 'java',
    kt: 'kotlin', kotlin: 'kotlin',
    swift: 'swift', dart: 'dart', php: 'php',
    cs: 'csharp', csharp: 'csharp',
    c: 'c', cpp: 'cpp', lua: 'lua', r: 'r',
    ex: 'elixir', elixir: 'elixir',
    hs: 'haskell', haskell: 'haskell',
    hc: 'holyc', holyc: 'holyc',
    html: 'html', vue: 'vue', svelte: 'svelte',
    tsx: 'react', jsx: 'react',
    bun: 'bun', deno: 'deno',
};
const resolveLangIconKey = (lang?: string): string | undefined => {
    if (!lang) return undefined;
    const key = lang.toLowerCase();
    return LANG_ICON_KEY[key] ?? key;
};

type AlertType = 'success' | 'error' | 'warning' | 'info';

interface Project {
    id: string;
    name: string;
    description?: string;
    language: string;
    status?: string;
    createdAt?: string;
}

interface UserData {
    nickname?: string;
    user?: string;
}

interface FileManagerProps {
    projects: unknown[];
    token: string | null;
    userData: UserData | null;
    loadProjects: (token: string) => void;
    showAlert: (title: string, message: string, type: AlertType) => void;
    showPrompt: (title: string, message: string, defaultVal: string, onConfirm: (val: string) => void) => void;
    showConfirm: (title: string, message: string, onConfirm: () => void) => void;
    onClose: () => void;
}




const getLangInfo = (langId: string) =>
systemData.languages.find(l => l.id === langId) || { id: langId, label: langId, icon: '📦' };

const FileManager: React.FC<FileManagerProps> = ({
    projects, token, userData, loadProjects, showAlert, showPrompt, showConfirm, onClose,
}) => {
    const navigate = useNavigate();
    const [tab, setTab] = useState<'active' | 'archived'>('active');

    const [createOpen, setCreateOpen] = useState(false);
    const [createStep, setCreateStep] = useState(1);
    const [isCreating, setIsCreating] = useState(false);
    const [createForm, setCreateForm] = useState<CreateForm>({
        name: '',
        description: '',
        language: systemData.languages[0]?.id ?? 'nodejs',
    });

    const [activeLogProject, setActiveLogProject] = useState<string | null>(null);
    const [logLines, setLogLines] = useState<string[]>([]);
    const wsRef = useRef<WebSocket | null>(null);
    const logContainerRef = useRef<HTMLPreElement | null>(null);

    const [useTemplate, setUseTemplate] = useState(false);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [availableTemplates, setAvailableTemplates] = useState<Array<{ id: string; meta: { name: string; description: string; language: string; category?: string; icon?: string } }>>([]);

    const createStepRef = useRef(1);
    useEffect(() => { createStepRef.current = createStep; }, [createStep]);

    useEffect(() => {
        if (!createOpen) return;
        window.history.pushState({ exocoreWizard: true }, document.title);
        const handlePopState = () => {
            window.history.pushState({ exocoreWizard: true }, document.title);
            if (createStepRef.current > 1) {
                setCreateStep(s => s - 1);
            } else {
                setCreateOpen(false);
            }
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [createOpen]);

    useEffect(() => {
        axios.get('/exocore/api/editor/templates/list')
            .then(res => {
                const t = res.data?.templates as Array<{ id: string; meta: { name: string; description: string; language: string } }>;
                if (Array.isArray(t)) setAvailableTemplates(t);
            })
            .catch(() => {});
    }, []);

    const typedProjects = projects as Project[];
    const activeProjects = typedProjects.filter(p => p.status !== 'Archived');
    const archivedProjects = typedProjects.filter(p => p.status === 'Archived');
    const displayList = tab === 'active' ? activeProjects : archivedProjects;

    // Multi-select for bulk delete
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    // Pagination ("Load more")
    const PAGE_SIZE = 10;
    const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
    // Reset selection + visible count when switching tabs or list size changes meaningfully
    useEffect(() => {
        setSelectedIds(new Set());
        setVisibleCount(PAGE_SIZE);
    }, [tab]);

    const visibleList = displayList.slice(0, visibleCount);

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };
    const toggleSelectAllVisible = () => {
        const allVisible = visibleList.map(p => p.id);
        const allSelected = allVisible.every(id => selectedIds.has(id));
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (allSelected) allVisible.forEach(id => next.delete(id));
            else allVisible.forEach(id => next.add(id));
            return next;
        });
    };
    const clearSelection = () => setSelectedIds(new Set());

    const handleBulkDelete = () => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        const isArchived = tab === 'archived';
        showConfirm(
            `Delete ${ids.length} project${ids.length !== 1 ? 's' : ''}`,
            `Permanently delete the selected ${ids.length} project${ids.length !== 1 ? 's' : ''}? This cannot be undone.`,
            async () => {
                let ok = 0, fail = 0;
                await Promise.all(ids.map(async (id) => {
                    try {
                        await axios.post('/exocore/api/editor/projects/delete',
                            { projectId: id, isArchived }, { params: { token } });
                        ok++;
                    } catch { fail++; }
                }));
                clearSelection();
                if (token) loadProjects(token);
                if (fail === 0) showAlert('Deleted', `${ok} project${ok !== 1 ? 's' : ''} removed.`, 'success');
                else showAlert('Done with errors', `${ok} deleted, ${fail} failed.`, fail > ok ? 'error' : 'success');
            },
        );
    };

    // Live-poll project list every 3s while File Manager is open so newly
    // created / renamed / archived / status-changed projects show up
    // automatically even if the parent dashboard's poll is throttled.
    useEffect(() => {
        if (!token) return;
        const id = setInterval(() => {
            if (!document.hidden) loadProjects(token);
        }, 3000);
        return () => clearInterval(id);
    }, [token, loadProjects]);

    useEffect(() => {
        return () => {
            if (wsRef.current) wsRef.current.close();
        };
    }, []);

    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logLines]);

    const closeLogs = () => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        setActiveLogProject(null);
        setLogLines([]);
    };

    const toggleLogs = (projectId: string) => {
        if (activeLogProject === projectId) {
            closeLogs();
        } else {
            closeLogs();
            setActiveLogProject(projectId);
            setLogLines(["[System] Connecting to terminal logs...\n"]);

            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            
            const wsUrl = `${protocol}//${window.location.host}/exocore/terminal?projectId=${projectId}&type=console`;
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onmessage = (event) => {
                const chunk = event.data.toString();
                setLogLines(prev => {
                    const newLines = [...prev, chunk];
                    return newLines.slice(-150);
                });
            };

            ws.onclose = () => {
                setLogLines(prev => [...prev, "\n[System] Disconnected from logs."]);
            };
        }
    };

    const openCreateWizard = () => {
        setCreateForm({ name: '', description: '', language: systemData.languages[0]?.id ?? 'nodejs' });
        setCreateStep(1);
        setUseTemplate(false);
        setSelectedTemplateId('');
        setSelectedCategory('');
        setCreateOpen(true);
    };

    const closeCreateWizard = () => {
        if (isCreating) return;
        setCreateOpen(false);
    };

    const validateStep1 = () => {
        const trimmed = createForm.name.trim();
        if (!trimmed) {
            showAlert('Required', 'Please enter a project name to continue.', 'warning');
            return false;
        }
        if (!/^[a-zA-Z0-9_-][a-zA-Z0-9_ -]*$/.test(trimmed)) {
            showAlert('Invalid Name', 'Use only letters, numbers, spaces, hyphens, or underscores.', 'warning');
            return false;
        }
        return true;
    };

    const goNextStep = () => {
        if (createStep === 1 && !validateStep1()) return;
        if (createStep === 2 && availableTemplates.length > 0 && !selectedCategory) {
            showAlert('Required', 'Please pick a category to continue.', 'warning');
            return;
        }
        if (createStep === 3 && availableTemplates.length > 0 && !selectedTemplateId) {
            showAlert('Required', 'Please select a template to continue.', 'warning');
            return;
        }
        setCreateStep(s => s + 1);
    };

    const goPrevStep = () => {
        setCreateStep(s => s - 1);
    };

    const submitCreate = async () => {
        if (!validateStep1()) return;

        // ── Template path ──────────────────────────────────────────────
        // Silently copy the template via the SSE endpoint (we never show
        // logs to the user) and then jump straight into the editor with
        // ?autoinstall=1 so the editor's own terminal panel opens and runs
        // `chmod +x install.sh && bash install.sh` in the project's real
        // shell. No "Step 5" log panel, no HTTP-piped install output.
        if (useTemplate && selectedTemplateId) {
            const safeName = createForm.name.trim().replace(/[^a-zA-Z0-9_-]/g, '');
            setIsCreating(true);
            try {
                const resp = await fetch('/exocore/api/editor/templates/create-from-template', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        templateId: selectedTemplateId,
                        projectName: safeName,
                        author: userData?.nickname || userData?.user || 'Developer',
                        description: createForm.description.trim(),
                    }),
                });
                if (!resp.ok || !resp.body) {
                    const err = await resp.json().catch(() => ({ error: 'Failed to create project' }));
                    throw new Error(err.error || 'Failed to create project');
                }
                const reader = resp.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let outcome: 'done' | 'error' | null = null;
                let errMsg = '';
                while (!outcome) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const events = buffer.split('\n\n');
                    buffer = events.pop() ?? '';
                    for (const evt of events) {
                        const line = evt.split('\n').find(l => l.startsWith('data: '));
                        if (!line) continue;
                        try {
                            const payload = JSON.parse(line.slice(6)) as { status: string; log: string };
                            if (payload.status === 'done') outcome = 'done';
                            else if (payload.status === 'error') { outcome = 'error'; errMsg = payload.log; }
                        } catch { /* ignore malformed event */ }
                    }
                }
                if (outcome === 'error') throw new Error(errMsg || 'Project creation failed');
                if (token) loadProjects(token);
                setCreateOpen(false);
                navigate(`/editor?project=${encodeURIComponent(safeName)}&autoinstall=1`);
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Failed to create project';
                showAlert('Error', msg, 'error');
            } finally {
                setIsCreating(false);
            }
            return;
        }

        setIsCreating(true);
        try {
            const isNode = createForm.language.toLowerCase().includes('node');
            const payload: Record<string, unknown> = {
                name: createForm.name.trim(),
                description: createForm.description.trim(),
                language: createForm.language,
                author: userData?.nickname || userData?.user,
                run: 'npm start',
            };
            if (isNode) {
                const pkgName = createForm.name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
                payload.files = {
                    'package.json': JSON.stringify({
                        name: pkgName, version: '1.0.0',
                        description: createForm.description.trim(),
                        main: 'index.js',
                        scripts: { start: 'node index.js' },
                        author: userData?.nickname || userData?.user || 'Developer',
                    }, null, 2),
                    'index.js': "console.log('Exocore Node.js project is running!');\n",
                };
            }
            const res = await axios.post('/exocore/api/editor/projects/create', payload, { params: { token } });
            setCreateOpen(false);
            if (token) loadProjects(token);
            const projectId = res.data?.project?.id || res.data?.id;
            if (projectId) {
                navigate(`/editor?project=${projectId}`);
            } else {
                showAlert('Created', 'Project initialized.', 'success');
            }
        } catch {
            showAlert('Error', 'Failed to create project. Please try again.', 'error');
        } finally {
            setIsCreating(false);
        }
    };

    const handleStart = async (id: string, name: string) => {
        try {
            await axios.post('/exocore/api/editor/runtime/start', { projectId: id }, { params: { token } });
            showAlert('Started', `${name} is now booting up.`, 'success');
            if (token) loadProjects(token);
        } catch {
            showAlert('Error', `Failed to start ${name}.`, 'error');
        }
    };

    const handleStop = async (id: string, name: string) => {
        try {
            await axios.post('/exocore/api/editor/runtime/stop', { projectId: id }, { params: { token } });
            showAlert('Stopped', `${name} has been shut down.`, 'success');
            if (token) loadProjects(token);
        } catch {
            showAlert('Error', `Failed to stop ${name}.`, 'error');
        }
    };

    const handleRename = (id: string, name: string) => {
        showPrompt('Rename Project', `New name for "${name}":`, name, async (newName) => {
            if (!newName.trim() || newName === name) return;
            try {
                await axios.post('/exocore/api/editor/projects/rename', { projectId: id, newName: newName.trim() }, { params: { token } });
                if (token) loadProjects(token);
                showAlert('Renamed', 'Project renamed successfully.', 'success');
            } catch { showAlert('Error', 'Rename failed.', 'error'); }
        });
    };

    const handleArchive = (id: string, name: string) => {
        showConfirm('Archive Project', `Archive "${name}"? You can restore it later.`, async () => {
            try {
                await axios.post('/exocore/api/editor/projects/archive', { projectId: id }, { params: { token } });
                if (token) loadProjects(token);
                showAlert('Archived', 'Project moved to archives.', 'warning');
            } catch { showAlert('Error', 'Archive failed.', 'error'); }
        });
    };

    const handleRestore = (id: string, name: string) => {
        showConfirm('Restore Project', `Restore "${name}" to active?`, async () => {
            try {
                await axios.post('/exocore/api/editor/projects/unarchive', { projectId: id }, { params: { token } });
                if (token) loadProjects(token);
                showAlert('Restored', 'Project is back online.', 'success');
            } catch { showAlert('Error', 'Restore failed.', 'error'); }
        });
    };

    const handleDelete = (id: string, name: string, isArchived = false) => {
        showConfirm('Delete Project', `Permanently delete "${name}"? This cannot be undone.`, async () => {
            try {
                await axios.post('/exocore/api/editor/projects/delete', { projectId: id, isArchived }, { params: { token } });
                if (token) loadProjects(token);
                showAlert('Deleted', 'Project removed permanently.', 'success');
            } catch { showAlert('Error', 'Delete failed.', 'error'); }
        });
    };

    const selectedLang = getLangInfo(createForm.language);

    return (
        <>
        <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 10000 }}>
        <div className="modal-box fm-window" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
        <span className="modal-title">
        <span style={{ fontSize: '1.1rem' }}>📁</span>
        File Manager
        </span>
        <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="fm-tabs">
        <button className={`fm-tab ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>
        Active <span className="fm-tab-count">{activeProjects.length}</span>
        </button>
        <button className={`fm-tab ${tab === 'archived' ? 'active' : ''}`} onClick={() => setTab('archived')}>
        Archived <span className="fm-tab-count">{archivedProjects.length}</span>
        </button>
        </div>

        <div className="fm-toolbar" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-secondary)', cursor: displayList.length === 0 ? 'default' : 'pointer', userSelect: 'none' }}>
        <input
            type="checkbox"
            disabled={visibleList.length === 0}
            checked={visibleList.length > 0 && visibleList.every(p => selectedIds.has(p.id))}
            onChange={toggleSelectAllVisible}
            style={{ accentColor: '#a5b4fc' }}
        />
        Select all
        </label>
        <span className="fm-count">{displayList.length} item{displayList.length !== 1 ? 's' : ''}</span>
        {selectedIds.size > 0 && (
            <>
            <span style={{ fontSize: '0.72rem', color: '#a5b4fc', fontWeight: 600 }}>
            {selectedIds.size} selected
            </span>
            <button
                className="btn btn-sm"
                style={{ width: 'auto', background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
                onClick={handleBulkDelete}
            >
            Delete selected ({selectedIds.size})
            </button>
            <button
                className="btn btn-ghost btn-sm"
                style={{ width: 'auto' }}
                onClick={clearSelection}
            >
            Clear
            </button>
            </>
        )}
        <div style={{ flex: 1 }} />
        {tab === 'active' && (
            <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={openCreateWizard}>
            + New Project
            </button>
        )}
        </div>

        <div className="fm-body">
        {displayList.length === 0 ? (
            <div className="fm-empty">
            <div className="fm-empty-icon">{tab === 'active' ? '🚀' : '📦'}</div>
            <div>
            {tab === 'active'
                ? 'No active projects. Create one to get started.'
        : 'No archived projects.'}
        </div>
        </div>
        ) : (
            <div className="fm-list">
            {visibleList.map(proj => {
                const lang = getLangInfo(proj.language);
                const isLogOpen = activeLogProject === proj.id;
                const statusColor = proj.status === 'running' ? '#22c55e' : proj.status === 'Archived' ? '#6b7280' : '#6b7280';
                const isSelected = selectedIds.has(proj.id);

                return (
                    <div key={proj.id} style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.75rem', marginBottom: '0.25rem', background: isSelected ? 'rgba(165,180,252,0.06)' : 'transparent', borderRadius: 6 }}>
                    <div style={{ padding: '0.5rem 0' }}>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(proj.id)}
                        style={{ accentColor: '#a5b4fc', cursor: 'pointer', width: 16, height: 16, flexShrink: 0 }}
                        onClick={(e) => e.stopPropagation()}
                    />
                    <div style={{ width: 38, height: 38, borderRadius: 8, background: '#1a1a1a', border: '1px solid #2f2f2f', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {(() => {
                        const iconKey = resolveLangIconKey(proj.language);
                        if (iconKey) return getTemplateIcon(iconKey, proj.language, 22);
                        return <span style={{ fontSize: '1rem' }}>{lang.icon}</span>;
                    })()}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span className="notranslate" translate="no" style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{proj.name}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.68rem', padding: '1px 7px', borderRadius: 20, border: `1px solid ${statusColor}44`, color: statusColor, background: `${statusColor}15`, fontWeight: 500, textTransform: 'capitalize' }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor, display: 'inline-block' }} />
                    {proj.status ?? 'stopped'}
                    </span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {lang.label}{proj.createdAt && ` · ${proj.createdAt}`}{proj.description && proj.description !== 'No description' && ` · ${proj.description}`}
                    </div>
                    </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    {tab === 'active' ? (
                        <>
                        <button style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 6, padding: '0.25rem 0.6rem', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 500 }} onClick={() => handleStart(proj.id, proj.name)}>▶ Start</button>
                        <button style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '0.25rem 0.6rem', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 500 }} onClick={() => handleStop(proj.id, proj.name)}>■ Stop</button>
                        <button style={{ background: isLogOpen ? 'rgba(168,85,247,0.2)' : 'rgba(168,85,247,0.1)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.25)', borderRadius: 6, padding: '0.25rem 0.6rem', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 500 }} onClick={() => toggleLogs(proj.id)}>{isLogOpen ? '▼ Logs' : '▶ Logs'}</button>
                        <button style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 6, padding: '0.25rem 0.6rem', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 500 }} onClick={() => navigate(`/editor?project=${proj.id}`)}>Open</button>
                        <button style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '0.25rem 0.6rem', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 500 }} onClick={() => handleRename(proj.id, proj.name)}>Rename</button>
                        <button style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6, padding: '0.25rem 0.6rem', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 500 }} onClick={() => handleArchive(proj.id, proj.name)}>Archive</button>
                        <button style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 6, padding: '0.25rem 0.6rem', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 500 }} onClick={() => handleDelete(proj.id, proj.name, false)}>Delete</button>
                        </>
                    ) : (
                        <>
                        <button style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 6, padding: '0.25rem 0.6rem', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 500 }} onClick={() => handleRestore(proj.id, proj.name)}>Restore</button>
                        <button style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '0.25rem 0.6rem', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 500 }} onClick={() => handleDelete(proj.id, proj.name, true)}>Delete</button>
                        </>
                    )}
                    </div>
                    </div>

                    {isLogOpen && (
                        <div onClick={e => e.stopPropagation()} style={{ marginTop: '0.4rem', borderRadius: 8, border: '1px solid rgba(168,85,247,0.2)', overflow: 'hidden', background: '#080808' }}>
                        <div style={{ padding: '6px 12px', background: 'rgba(168,85,247,0.08)', borderBottom: '1px solid rgba(168,85,247,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>console · {proj.name}</span>
                        <span style={{ fontSize: '0.68rem', color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />live</span>
                        </div>
                        <pre ref={logContainerRef} style={{ margin: 0, padding: '10px 12px', color: '#e2e8f0', fontFamily: 'var(--font-mono)', fontSize: '11.5px', height: '180px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {logLines.map((chunk, i) => <AnsiText key={i} text={chunk} />)}
                        {logLines.length === 0 && <span style={{ color: '#475569' }}>Waiting for output...</span>}
                        </pre>
                        </div>
                    )}
                    </div>
                );
            })}
            {displayList.length > visibleCount && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '0.75rem 0 0.25rem' }}>
                <button
                    className="btn btn-ghost btn-sm"
                    style={{ width: 'auto', background: 'rgba(99,102,241,0.08)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)' }}
                    onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                >
                Load more ({displayList.length - visibleCount} remaining)
                </button>
                </div>
            )}
            </div>
        )}
        </div>
        </div>
        </div>

        {createOpen && (
            <CreateProjectWizard
                createStep={createStep}
                isCreating={isCreating}
                createForm={createForm}
                useTemplate={useTemplate}
                selectedTemplateId={selectedTemplateId}
                selectedCategory={selectedCategory}
                availableTemplates={availableTemplates}
                selectedLang={selectedLang}
                authorName={userData?.nickname || userData?.user || 'Developer'}
                onClose={closeCreateWizard}
                onNext={goNextStep}
                onBack={goPrevStep}
                onFormChange={updates => setCreateForm(f => ({ ...f, ...updates }))}
                onUseTemplateChange={setUseTemplate}
                onCategorySelect={cat => {
                    setSelectedCategory(cat);
                    setSelectedTemplateId('');
                }}
                onTemplateSelect={id => {
                    setSelectedTemplateId(id);
                    const tmpl = availableTemplates.find(t => t.id === id);
                    if (tmpl) setCreateForm(f => ({ ...f, language: tmpl.meta.language }));
                }}
                onLangChange={lang => setCreateForm(f => ({ ...f, language: lang }))}
                onSubmit={submitCreate}
            />
        )}
        </>
    );
};

export default FileManager;
