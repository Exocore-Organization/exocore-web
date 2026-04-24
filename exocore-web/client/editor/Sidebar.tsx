import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Menu, Item, useContextMenu } from 'react-contexify';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Folder, FolderOpen, MoreVertical,
    FilePlus, FolderPlus, Edit3, Trash2,
    ChevronRight, ChevronDown, UploadCloud,
    Eye, EyeOff, RotateCw, Move, Download, ArchiveRestore
} from 'lucide-react';
import Swal from 'sweetalert2';
import toast from 'react-hot-toast';

import { useLegacyEditorStore, FileNode } from './store';
import { getFileIcon } from './language';
import 'react-contexify/dist/ReactContexify.css';

interface SidebarProps {
    projectId: string | null;
    isVisible: boolean;
    onOpen: (node: FileNode) => void;
}

const MENU_ID = 'sidebar_menu';
const LONG_PRESS_MS = 500;

interface DragState {
    isDragging: boolean;
    node: FileNode | null;
    x: number;
    y: number;
    dropTarget: string | null;
}

const getSortedNodes = (nodes: FileNode[]) => {
    if (!nodes) return [];
    return [...nodes].sort((a, b) => {
        if (a.name === 'node_modules') return 1;
        if (b.name === 'node_modules') return -1;
        if (a.type === 'directory' && b.type !== 'directory') return -1;
        if (a.type !== 'directory' && b.type === 'directory') return 1;
        return a.name.localeCompare(b.name);
    });
};

interface TreeNodeProps {
    node: FileNode;
    depth: number;
    projectId: string | null;
    onOpen: (node: FileNode) => void;
    showHidden: boolean;
    dragState: DragState;
    onDragStart: (node: FileNode, x: number, y: number) => void;
    onDragMove: (x: number, y: number) => void;
    onDragEnd: () => void;
    onDropTarget: (path: string | null) => void;
    onDrop: (targetFolderPath: string) => void;
    onRefresh: () => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({
    node, depth, projectId, onOpen, showHidden,
    dragState, onDragStart, onDragMove, onDragEnd,
    onDropTarget, onDrop, onRefresh
}) => {
    const { activeFile, setFiles } = useLegacyEditorStore();
    const [isOpen, setIsOpen] = useState(false);
    const [isCreating, setIsCreating] = useState<{ type: 'file' | 'directory' } | null>(null);
    const [newName, setNewName] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const { show } = useContextMenu({ id: MENU_ID });

    const isHiddenItem = node.name.startsWith('.') || node.name === 'node_modules';
    useEffect(() => { if (isCreating && inputRef.current) inputRef.current.focus(); }, [isCreating]);

    if (!showHidden && isHiddenItem) return null;

    const isDropTarget = dragState.dropTarget === node.path && node.type === 'directory';
    const isDragSource = dragState.node?.path === node.path;

    const handleCreate = async () => {
        if (!newName || !isCreating || !projectId) return setIsCreating(null);
        try {
            const basePath = node.type === 'directory'
                ? node.path
                : node.path.substring(0, node.path.lastIndexOf('/'));
            const filePath = `${basePath}/${newName}`;
            const { rpc } = await import('../access/rpcClient');
            await rpc.call('coding.create', { projectId, filePath, type: isCreating.type });
            setIsCreating(null); setNewName('');
            const res = await rpc.call<any>('coding.files', { projectId });
            setFiles(res.files);
        } catch { toast.error("Creation failed"); }
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        longPressTimer.current = setTimeout(() => {
            onDragStart(node, e.clientX, e.clientY);
        }, LONG_PRESS_MS);
    };

    const handlePointerUp = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
        if (dragState.isDragging && dragState.dropTarget && dragState.node) {
            onDrop(dragState.dropTarget);
        }
        onDragEnd();
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (longPressTimer.current && (Math.abs(e.movementX) > 3 || Math.abs(e.movementY) > 3)) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
        if (dragState.isDragging) {
            onDragMove(e.clientX, e.clientY);
        }
    };

    const handlePointerEnter = () => {
        if (dragState.isDragging && node.type === 'directory' && dragState.node?.path !== node.path) {
            onDropTarget(node.path);
        }
    };

    const handlePointerLeave = () => {
        if (dragState.isDragging && dragState.dropTarget === node.path) {
            onDropTarget(null);
        }
    };

    return (
        <div className="tree-node-wrapper">
            <div
                className={`tree-row ${activeFile?.path === node.path ? 'active' : ''} ${isHiddenItem ? 'hidden-item-style' : ''} ${isDragSource ? 'drag-source' : ''} ${isDropTarget ? 'drop-target' : ''}`}
                onClick={() => {
                    if (dragState.isDragging) return;
                    node.type === 'directory' ? setIsOpen(!isOpen) : onOpen(node);
                }}
                onContextMenu={(e) => { e.preventDefault(); show({ event: e, props: { node, setIsCreating } }); }}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerMove={handlePointerMove}
                onPointerEnter={handlePointerEnter}
                onPointerLeave={handlePointerLeave}
                style={{ paddingLeft: `${depth * 12 + 16}px` }}
            >
                <span className="chevron-icon">
                    {node.type === 'directory' && (isOpen ? <ChevronDown size={14}/> : <ChevronRight size={14}/>)}
                </span>
                <span className="file-icon">
                    {node.type === 'directory'
                        ? (isOpen ? <FolderOpen size={16} className="folder-icon open"/> : <Folder size={16} className="folder-icon"/>)
                        : getFileIcon(node.name)
                    }
                </span>
                <span className="file-name notranslate" translate="no">{node.name}</span>
                <div className="row-actions">
                    {dragState.isDragging && dragState.node?.path === node.path
                        ? <Move size={12} color="#f59e0b" />
                        : <MoreVertical size={14} onClick={(e) => { e.stopPropagation(); show({ event: e, props: { node, setIsCreating } }); }} />
                    }
                </div>
            </div>

            <AnimatePresence>
                {isCreating && (
                    <div style={{ paddingLeft: `${(depth + 1) * 12 + 32}px`, margin: '4px 0' }}>
                        <input
                            ref={inputRef} value={newName} onChange={(e) => setNewName(e.target.value)}
                            onBlur={handleCreate} onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                            className="exo-tree-input notranslate" placeholder={isCreating.type === 'file' ? "file.js" : "folder name"}
                            translate="no"
                        />
                    </div>
                )}
                {node.type === 'directory' && isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        style={{ overflow: 'hidden' }}
                    >
                        {getSortedNodes(node.children || []).map(child => (
                            <TreeNode
                                key={child.path} node={child} depth={depth + 1}
                                projectId={projectId} onOpen={onOpen} showHidden={showHidden}
                                dragState={dragState}
                                onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd}
                                onDropTarget={onDropTarget} onDrop={onDrop} onRefresh={onRefresh}
                            />
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export const Sidebar: React.FC<SidebarProps> = ({ isVisible, projectId, onOpen }) => {
    const { files, setFiles, activeFile, setActiveFile } = useLegacyEditorStore();
    const [rootCreating, setRootCreating] = useState<{ type: 'file' | 'directory' } | null>(null);
    const [rootName, setRootName] = useState('');
    const [showHidden, setShowHidden] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [dragState, setDragState] = useState<DragState>({
        isDragging: false, node: null, x: 0, y: 0, dropTarget: null,
    });

    if (!isVisible) return null;

    const refreshFiles = useCallback(async () => {
        if (!projectId) return;
        setIsRefreshing(true);
        try {
            const { rpc } = await import('../access/rpcClient');
            const res = await rpc.call<any>('coding.files', { projectId });
            setFiles(res.files);
        } catch { toast.error("Refresh failed"); }
        finally { setTimeout(() => setIsRefreshing(false), 600); }
    }, [projectId, setFiles]);

    const handleDragStart = useCallback((node: FileNode, x: number, y: number) => {
        setDragState({ isDragging: true, node, x, y, dropTarget: null });
        toast(`Moving: ${node.name}`, { icon: '✋', duration: 2000, style: { fontSize: '12px' } });
    }, []);

    const handleDragMove = useCallback((x: number, y: number) => {
        setDragState(s => ({ ...s, x, y }));
    }, []);

    const handleDragEnd = useCallback(() => {
        setDragState({ isDragging: false, node: null, x: 0, y: 0, dropTarget: null });
    }, []);

    const handleDropTarget = useCallback((path: string | null) => {
        setDragState(s => ({ ...s, dropTarget: path }));
    }, []);

    const handleDrop = useCallback(async (targetFolderPath: string) => {
        if (!dragState.node || !projectId) return;

        const srcPath = dragState.node.path;
        const fileName = srcPath.split('/').pop() ?? '';
        const destPath = `${targetFolderPath}/${fileName}`;

        if (srcPath === destPath) return;

        const toastId = toast.loading(`Moving ${fileName}...`);
        try {
            const { rpc } = await import('../access/rpcClient');
            await rpc.call('coding.move', { projectId, srcPath, destPath });
            toast.success(`Moved to ${targetFolderPath.split('/').pop()}`, { id: toastId });
            if (activeFile?.path === srcPath) setActiveFile(null, '');
            await refreshFiles();
        } catch {
            toast.error('Move failed', { id: toastId });
        }
    }, [dragState.node, projectId, activeFile, setActiveFile, refreshFiles]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !projectId) return;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('projectId', projectId);
        const isZip = file.name.endsWith('.zip');
        const tid = toast.loading(isZip ? "Restoring Workspace..." : "Uploading...");
        try {
            await axios.post(isZip ? '/exocore/api/editor/coding/extract' : '/exocore/api/editor/coding/create', formData);
            toast.success("Done", { id: tid });
            refreshFiles();
        } catch { toast.error("Failed", { id: tid }); }
        e.target.value = '';
    };

    const handleAction = async (type: string, node: FileNode) => {
        if (!projectId) return;
        if (type === 'delete') {
            const res = await Swal.fire({
                title: 'Delete?', text: node.name, showCancelButton: true,
                background: '#0e1525', color: '#fff', confirmButtonColor: '#ef4444'
            });
            if (res.isConfirmed) {
                const { rpc } = await import('../access/rpcClient');
                await rpc.call('coding.delete', { projectId, filePath: node.path });
                if (activeFile?.path === node.path) setActiveFile(null, "");
                refreshFiles();
            }
        } else if (type === 'download-file') {
            const url = `/exocore/api/editor/coding/download-file?projectId=${encodeURIComponent(projectId)}&filePath=${encodeURIComponent(node.path)}`;
            const a = document.createElement('a');
            a.href = url;
            a.download = node.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } else if (type === 'download-folder') {
            const tid = toast.loading(`Zipping ${node.name}...`);
            const url = `/exocore/api/editor/coding/download-folder?projectId=${encodeURIComponent(projectId)}&folderPath=${encodeURIComponent(node.path)}`;
            const a = document.createElement('a');
            a.href = url;
            a.download = `${node.name}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            toast.success('Download started', { id: tid });
        }
    };

    const handleDownloadProject = () => {
        if (!projectId) return;
        const tid = toast.loading('Preparing project zip...');
        const url = `/exocore/api/editor/coding/download?projectId=${encodeURIComponent(projectId)}`;
        const a = document.createElement('a');
        a.href = url;
        a.download = `${projectId}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => toast.success('Download started', { id: tid }), 800);
    };

    return (
        <div className="exocore-sidebar-container">
            {}
            {dragState.isDragging && dragState.node && (
                <div
                    style={{
                        position: 'fixed',
                        left: dragState.x + 12,
                        top: dragState.y + 12,
                        zIndex: 9999,
                        background: 'rgba(99,102,241,0.9)',
                        color: '#fff',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        pointerEvents: 'none',
                        backdropFilter: 'blur(8px)',
                        boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                    }}
                >
                    <Move size={11} />
                    {dragState.node.name}
                </div>
            )}

            <div className="sidebar-toolbar">
                <div className="toolbar-title">
                    <span className="title-dot" />
                    EXPLORER
                </div>
                <div className="toolbar-actions">
                    <span title="New File" className="toolbar-icon"><FilePlus size={14} onClick={() => setRootCreating({ type: 'file' })} /></span>
                    <span title="New Folder" className="toolbar-icon"><FolderPlus size={14} onClick={() => setRootCreating({ type: 'directory' })} /></span>
                    <span title="Upload File" className="toolbar-icon"><UploadCloud size={14} onClick={() => fileInputRef.current?.click()} /></span>
                    <span title="Refresh" className="toolbar-icon"><RotateCw size={14} className={isRefreshing ? 'spin' : ''} onClick={refreshFiles} /></span>
                    <div className="divider" />
                    <span title="Download Project as ZIP" className="toolbar-icon"><ArchiveRestore size={14} onClick={handleDownloadProject} /></span>
                    <span onClick={() => setShowHidden(!showHidden)} title={showHidden ? 'Hide dotfiles' : 'Show dotfiles'} className="toolbar-icon">
                        {showHidden ? <Eye size={14} color="#00a1ff" /> : <EyeOff size={14} />}
                    </span>
                </div>
            </div>

            <input type="file" ref={fileInputRef} hidden onChange={handleFileUpload} />

            <div className="sidebar-scroll custom-scrollbar">
                {rootCreating && (
                    <div style={{ padding: '8px 16px' }}>
                        <input
                            autoFocus value={rootName} onChange={(e) => setRootName(e.target.value)}
                            onBlur={() => {
                                if (rootName) {
                                    void (async () => {
                                        const { rpc } = await import('../access/rpcClient');
                                        await rpc.call('coding.create', {
                                            projectId, filePath: rootName, type: rootCreating.type,
                                        });
                                        refreshFiles();
                                    })();
                                }
                                setRootCreating(null); setRootName('');
                            }}
                            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                            className="exo-tree-input notranslate" placeholder="Name..."
                            translate="no"
                        />
                    </div>
                )}
                {getSortedNodes(files || []).map(f => (
                    <TreeNode
                        key={f.path} node={f} depth={0}
                        projectId={projectId} onOpen={onOpen} showHidden={showHidden}
                        dragState={dragState}
                        onDragStart={handleDragStart}
                        onDragMove={handleDragMove}
                        onDragEnd={handleDragEnd}
                        onDropTarget={handleDropTarget}
                        onDrop={handleDrop}
                        onRefresh={refreshFiles}
                    />
                ))}
            </div>

            <Menu id={MENU_ID} theme="dark" animation="fade">
                <Item onClick={({ props }) => props.setIsCreating({ type: 'file' })}><FilePlus size={14}/> &nbsp; New File</Item>
                <Item onClick={({ props }) => props.setIsCreating({ type: 'directory' })}><FolderPlus size={14}/> &nbsp; New Folder</Item>
                <Item onClick={({ props }) => handleAction('rename', props.node)}><Edit3 size={14}/> &nbsp; Rename</Item>
                <Item onClick={({ props }) => handleAction('delete', props.node)}><Trash2 size={14}/> &nbsp; Delete</Item>
                <Item onClick={({ props }) => {
                    if (props.node.type === 'file') handleAction('download-file', props.node);
                    else handleAction('download-folder', props.node);
                }}>
                    <Download size={14}/> &nbsp; Download
                </Item>
            </Menu>

            <style>{`
                .exocore-sidebar-container { height: 100%; display: flex; flex-direction: column; background: transparent; user-select: none; color: inherit; }
                .sidebar-toolbar {
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 10px 14px;
                    border-bottom: 1px solid rgba(255,255,255,0.06);
                    background: linear-gradient(180deg, rgba(255,255,255,0.025), transparent);
                }
                .toolbar-title {
                    font-size: 10px; font-weight: 800; letter-spacing: 1.5px;
                    opacity: 0.9; text-transform: uppercase;
                    display: flex; align-items: center; gap: 8px;
                }
                .title-dot {
                    width: 6px; height: 6px; border-radius: 50%;
                    background: #00a1ff;
                    box-shadow: 0 0 8px rgba(0, 161, 255, 0.6);
                }
                .toolbar-actions { display: flex; align-items: center; gap: 4px; opacity: 0.85; }
                .toolbar-icon {
                    display: inline-flex; align-items: center; justify-content: center;
                    width: 24px; height: 24px; border-radius: 5px;
                    transition: background 0.15s, transform 0.1s;
                }
                .toolbar-icon:hover { background: rgba(255,255,255,0.08); }
                .toolbar-icon:active { transform: scale(0.92); }
                .toolbar-actions svg { cursor: pointer; }
                .toolbar-actions .divider { width: 1px; height: 14px; background: rgba(255,255,255,0.12); margin: 0 4px; }
                .sidebar-scroll { flex: 1; overflow-y: auto; overflow-x: hidden; padding-top: 8px; }
                .tree-row { display: flex; align-items: center; padding: 4px 12px; height: 28px; cursor: pointer; transition: background 0.1s; border-left: 2px solid transparent; gap: 6px; touch-action: none; color: inherit; }
                .tree-row:hover { background: rgba(255,255,255,0.05); }
                .tree-row.active { background: rgba(255,255,255,0.08); border-left-color: currentColor; font-weight: 600; }
                .tree-row.drag-source { opacity: 0.4; }
                .tree-row.drop-target { background: rgba(99,102,241,0.18); border-left-color: #6366f1; outline: 1px dashed rgba(99,102,241,0.55); }
                .chevron-icon { width: 16px; display: flex; align-items: center; justify-content: center; opacity: 0.7; }
                .folder-icon { color: #f29e1d; }
                .folder-icon.open { color: #ffd866; }
                .file-name { font-size: 13px; color: inherit; opacity: 0.9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .tree-row.active .file-name { opacity: 1; }
                .row-actions { display: none; margin-left: auto; opacity: 0.6; padding: 4px; }
                .tree-row:hover .row-actions { display: flex; }
                .row-actions:hover { opacity: 1; }
                .hidden-item-style { opacity: 0.5; }
                .exo-tree-input { background: rgba(255,255,255,0.06); border: 1px solid currentColor; color: inherit; font-size: 12px; padding: 4px 8px; border-radius: 4px; outline: none; width: calc(100% - 20px); font-family: inherit; }
                .spin { animation: spin 0.8s linear infinite; }
                @keyframes spin { 100% { transform: rotate(360deg); } }

                .vscode-layout[data-scheme="light"] .sidebar-toolbar { border-bottom-color: rgba(0,0,0,0.1); }
                .vscode-layout[data-scheme="light"] .toolbar-actions .divider { background: rgba(0,0,0,0.12); }
                .vscode-layout[data-scheme="light"] .tree-row:hover { background: rgba(0,0,0,0.05); }
                .vscode-layout[data-scheme="light"] .tree-row.active {
                    background: rgba(0,0,0,0.08);
                    border-left: 3px solid currentColor;
                    font-weight: 700;
                }
                .vscode-layout[data-scheme="light"] .tree-row.drop-target {
                    background: rgba(99,102,241,0.12);
                    outline-color: rgba(99,102,241,0.5);
                }
                .vscode-layout[data-scheme="light"] .file-name { opacity: 1; font-weight: 500; }
                .vscode-layout[data-scheme="light"] .toolbar-title { opacity: 0.95; font-weight: 900; }
                .vscode-layout[data-scheme="light"] .toolbar-actions { opacity: 0.95; }
                .vscode-layout[data-scheme="light"] .chevron-icon { opacity: 0.85; }
                .vscode-layout[data-scheme="light"] .folder-icon { color: #d97706; }
                .vscode-layout[data-scheme="light"] .folder-icon.open { color: #f59e0b; }
                .vscode-layout[data-scheme="light"] .row-actions { opacity: 0.7; }
                .vscode-layout[data-scheme="light"] .hidden-item-style { opacity: 0.6; }
                .vscode-layout[data-scheme="light"] .exo-tree-input {
                    background: #fff;
                    border: 1px solid rgba(0,0,0,0.3);
                    color: inherit;
                }

                @media (max-width: 768px) {
                    .tree-row { height: 36px; padding: 0 16px; }
                    .file-name { font-size: 14px; }
                    .sidebar-toolbar { padding: 16px; }
                    .toolbar-actions { gap: 18px; }
                }
            `}</style>
        </div>
    );
};
