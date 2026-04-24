import React, { useState, useEffect, useRef } from 'react';
import { Send, Settings2, Trash2, Trash, RotateCcw, Image as ImageIcon, MessageSquare, Zap, Brain, Gauge, KeyRound, Check, X, Plus, Eraser, Sparkles, MoreHorizontal } from 'lucide-react';
import axios from 'axios';
import { rpc } from '../access/rpcClient';
import { muxCarrier } from '../access/wsMux';
import toast from 'react-hot-toast';
import { get, set, del } from 'idb-keyval';

/* Direct base URL for the Exocore Llama bridge (meta.ai proxy hosted on
 * Hugging Face Spaces). Used for the few endpoints we call straight from
 * the browser (delete-all + conversation listing). The chat / agent
 * endpoints still go through the local server proxy so the workspace
 * context and SSR cookies stay on the same origin. */
const EXOCORE_BASE = 'https://exocore-llama.hf.space';

/* IndexedDB keys — we keep ONE conversation per project (the "doc id") plus
 * the rolling chat transcript. Storing in IDB instead of localStorage gives
 * us room for long conversations and survives across panel reloads. */
const idbChatKey = (pid: string) => `exo_ai_chat_${pid}`;
const idbDocKey  = (pid: string) => `exo_ai_docid_${pid}`;

/* Meta.ai cookies are stored ENTIRELY client-side in IndexedDB (per-browser,
 * not per-project) and forwarded in every request body. The server never
 * persists them to disk. Key is global so the same paste covers every
 * project the user opens in this browser. */
const COOKIE_KEY = 'exo_meta_cookies_v1';
type CookieMap = Record<string, string>;
const loadStoredCookies  = (): Promise<CookieMap | undefined> => get<CookieMap>(COOKIE_KEY);
const saveStoredCookies  = (c: CookieMap): Promise<void> => set(COOKIE_KEY, c);
const clearStoredCookies = (): Promise<void> => del(COOKIE_KEY);

/* Parse pasted cookies from JSON-object, browser-export array, or
 * "name=value; name=value" header form. Returns null if nothing usable. */
function parseCookieBlob(raw: string): CookieMap | null {
    const txt = raw.trim();
    if (!txt) return null;
    try {
        const parsed = JSON.parse(txt);
        if (Array.isArray(parsed)) {
            const out: CookieMap = {};
            for (const item of parsed) {
                if (item && typeof item.name === 'string' && typeof item.value === 'string') out[item.name] = item.value;
            }
            return Object.keys(out).length ? out : null;
        }
        if (parsed && typeof parsed === 'object') {
            const out: CookieMap = {};
            for (const [k, v] of Object.entries(parsed)) if (typeof v === 'string') out[k] = v;
            return Object.keys(out).length ? out : null;
        }
    } catch { /* fall through */ }
    const out: CookieMap = {};
    for (const part of txt.split(/;\s*|\n/)) {
        const idx = part.indexOf('=');
        if (idx <= 0) continue;
        const name = part.slice(0, idx).trim();
        const value = part.slice(idx + 1).trim();
        if (name && value) out[name] = value;
    }
    return Object.keys(out).length ? out : null;
}
import { useLegacyEditorStore } from './store';
import type { Message } from './ai/types';
import { ExoSetupPanel } from './ai/ExoSetupPanel';
import { ChatMessage } from './ai/ChatMessage';

interface ExocoreAIProps {
    projectId: string;
    theme: any;
}

export const ExocoreAI: React.FC<ExocoreAIProps> = ({ projectId, theme }) => {
    const { files: projectTree, setFiles, setActiveFile } = useLegacyEditorStore();

    // We keep ONE conversation id (the "doc id") per project. Every reply
    // returns the same id from the sticky-session backend, so tracking the
    // first one we see and persisting it to IndexedDB is enough. When the
    // user clears the chat we delete just that one conversation upstream.
    const docIdRef = useRef<string | null>(null);
    const trackConv = (id?: string | null) => {
        if (!id || docIdRef.current === id) return;
        docIdRef.current = id;
        set(idbDocKey(projectId), id).catch(() => {});
    };

    // Remember the user's last prompt so we can auto-fix on terminal failure
    // by re-sending it together with the workspace + failing logs.
    const lastUserPromptRef = useRef<string>('');

    /* Hydrate the transcript from IndexedDB on mount. Falls back to the
     * legacy localStorage payload (so existing users don't lose history),
     * then migrates it into IDB and clears the old key. */
    const [messages, setMessages] = useState<Message[]>([]);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const fromIdb = await get<Message[]>(idbChatKey(projectId));
                if (!cancelled && Array.isArray(fromIdb) && fromIdb.length) {
                    setMessages(fromIdb);
                } else {
                    const legacy = localStorage.getItem(`exo_ai_chat_${projectId}`);
                    if (legacy) {
                        try {
                            const parsed = JSON.parse(legacy);
                            if (!cancelled && Array.isArray(parsed) && parsed.length) {
                                setMessages(parsed);
                                await set(idbChatKey(projectId), parsed);
                            }
                        } catch {}
                        localStorage.removeItem(`exo_ai_chat_${projectId}`);
                    }
                }
                const savedDoc = await get<string>(idbDocKey(projectId));
                if (!cancelled && typeof savedDoc === 'string' && savedDoc) {
                    docIdRef.current = savedDoc;
                }
            } catch {}
        })();
        return () => { cancelled = true; };
    }, [projectId]);

    const [input, setInput] = useState('');

    // Locked to Meta-only mode. The legacy kilo/rest providers were removed —
    // every chat now goes through the meta.ai bridge with a sticky session.
    // Typed as string so the now-unreachable rest/kilo branches still compile.
    const aiMode: string = 'exocore';
    const [isConnected] = useState(true);
    const _wsRef = useRef<WebSocket | null>(null); void _wsRef;

    const [showKiloSetup, setShowKiloSetup] = useState(false);
    const kiloProvider = 'meta';
    const kiloModel = 'Meta AI';
    const kiloKey = '';
    const setKiloProvider = (_: string) => {};
    const setKiloModel = (_: string) => {};
    const setKiloKey = (_: string) => {};
    // Stubs so the legacy REST/kilo branches still typecheck even though
    // they're unreachable now (aiMode is locked to 'exocore' / Meta).
    const showRestSetup = false;
    const setShowRestSetup = (_: boolean) => {};
    const restEndpoint = '';
    const restQueryParam = '';
    const restDataPath = '';
    const restPresets: any[] = [];
    const setRestEndpoint = (_: string) => {};
    const setRestQueryParam = (_: string) => {};
    const setRestDataPath = (_: string) => {};
    const setRestPresets = (_: any[]) => {};

    // Sticky-session metadata returned by /meta/session. `sessionMode` covers
    // CHAT, IMAGINE, plus Meta AI's reasoning modes: think_fast (instant) and
    // think_hard (extended thinking). The two reasoning modes are exposed in
    // the header as a Fast / Thinking toggle.
    type SessionMode = 'CHAT' | 'IMAGINE' | 'think_fast' | 'think_hard';
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [sessionMode, setSessionMode] = useState<SessionMode>('think_fast');
    const [busySession, setBusySession] = useState(false);

    /* Extra-provider selector (Meta is default, plus Deep / Hez / Pixe via the
     * Tapos multi-AI Flask wrapper at https://exocore-llama.hf.space/). When
     * `provider !== 'meta'` we bypass the meta sticky-session machinery and
     * just hit /exocore/api/editor/ai/extra/<provider>. The `hez` provider
     * needs a token; we keep it in IndexedDB so the user only pastes it once. */
    type Provider = 'meta' | 'deep' | 'hez' | 'pixe';
    const PROVIDER_KEY = 'exo_ai_provider_v1';
    const HEZ_TOKEN_KEY = 'exo_hez_token_v1';
    const [provider, setProviderState] = useState<Provider>('meta');
    const [hezToken, setHezTokenState] = useState<string>('');
    const [showProviderMenu, setShowProviderMenu] = useState(false);
    useEffect(() => {
        get<Provider>(PROVIDER_KEY).then(p => { if (p) setProviderState(p); }).catch(() => {});
        get<string>(HEZ_TOKEN_KEY).then(t => { if (typeof t === 'string') setHezTokenState(t); }).catch(() => {});
    }, []);
    const setProvider = (p: Provider) => { setProviderState(p); set(PROVIDER_KEY, p).catch(() => {}); };
    const setHezToken = (t: string) => { setHezTokenState(t); set(HEZ_TOKEN_KEY, t).catch(() => {}); };
    const PROVIDER_LABEL: Record<Provider, string> = {
        meta: 'Meta AI',
        deep: 'DeepAI',
        hez: 'GLM-5 (Hez)',
        pixe: 'Perplexity (Pixe)',
    };

    /* Cookies live in IndexedDB on the client. We hydrate once on mount and
     * then use cookieRef synchronously when building request bodies. The
     * header cookie menu (paste / save / erase) writes to BOTH the React
     * state (for UI) and the ref (for in-flight requests). */
    const [cookieMap, setCookieMap] = useState<CookieMap | null>(null);
    const cookieRef = useRef<CookieMap | null>(null);
    const [showCookieMenu, setShowCookieMenu] = useState(false);
    const [showActionsMenu, setShowActionsMenu] = useState(false);
    useEffect(() => {
        if (!showActionsMenu) return;
        const onDoc = (e: MouseEvent) => {
            const t = e.target as HTMLElement | null;
            if (!t) return;
            if (t.closest('.actions-menu') || t.closest('.icon-only-btn')) return;
            setShowActionsMenu(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [showActionsMenu]);
    const [cookiePaste, setCookiePaste] = useState('');
    const [cookieBusy, setCookieBusy] = useState(false);
    useEffect(() => {
        let cancelled = false;
        loadStoredCookies().then((c) => {
            if (cancelled || !c) return;
            cookieRef.current = c;
            setCookieMap(c);
        }).catch(() => {});
        return () => { cancelled = true; };
    }, []);

    /* Inject the per-user cookies, the pinned conversation id, and the
     * current reasoning mode into every Meta API request body. Centralised
     * so we never forget any of them on a new endpoint.
     *
     * The bridge accepts the conversation id under any of `id`,
     * `conversation_id` or `conversationId` (server-side it does
     * `body.get("id") or body.get("conversation_id")`), so we send all three
     * to guarantee the same convo is kept across Fast/Thinking switches and
     * follow-up messages. */
    const withMeta = (extra: Record<string, unknown> = {}): Record<string, unknown> => {
        const cid = docIdRef.current || undefined;
        return {
            cookies: cookieRef.current || undefined,
            conversationId: cid,
            conversation_id: cid,
            id: cid,
            mode: sessionMode,
            ...extra,
        };
    };

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const toggleRef = useRef<HTMLDivElement>(null);

    
    const isDragging = useRef(false);
    const startX = useRef(0);
    const scrollLeft = useRef(0);


    
    useEffect(() => {
        const loadConfig = async () => {
            const p = await get('kilo_provider');
            const m = await get('kilo_model');
            const k = await get('kilo_key');
            if (p) setKiloProvider(p);
            if (m) setKiloModel(m);
            if (k) setKiloKey(k);

            const re = await get('rest_endpoint');
            const rq = await get('rest_query_param');
            const rd = await get('rest_data_path');
            const rp = await get('rest_presets');

            if (re) setRestEndpoint(re);
            if (rq) setRestQueryParam(rq);
            if (rd) setRestDataPath(rd);
            if (rp) setRestPresets(rp);
        };
            loadConfig();
    }, []);

    
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    
    useEffect(() => {
        if (messages.length > 0) {
            set(idbChatKey(projectId), messages).catch(() => {});
        } else {
            del(idbChatKey(projectId)).catch(() => {});
        }
        // Re-poll the sticky session id whenever the chat changes — that's
        // the moment a brand-new conversation could have been pinned by the
        // server. Cheap GET against /meta/session.
        rpc.call<any>('ai.metaSession')
            .then(r => {
                const id = r?.conversationId || null;
                setSessionId(id);
                if (id) trackConv(id);
                const m = r?.mode;
                if (m === 'CHAT' || m === 'IMAGINE' || m === 'think_fast' || m === 'think_hard') {
                    setSessionMode(m);
                }
            })
            .catch(() => {});
    }, [messages, projectId]);

    
    const handleMouseDown = (e: React.MouseEvent) => {
        if (!toggleRef.current) return;
        isDragging.current = true;
        toggleRef.current.classList.add('grabbing');
        startX.current = e.pageX - toggleRef.current.offsetLeft;
        scrollLeft.current = toggleRef.current.scrollLeft;
    };
    const handleMouseLeave = () => {
        isDragging.current = false;
        if (toggleRef.current) toggleRef.current.classList.remove('grabbing');
    };
        const handleMouseUp = () => {
            isDragging.current = false;
            if (toggleRef.current) toggleRef.current.classList.remove('grabbing');
        };
            const handleMouseMove = (e: React.MouseEvent) => {
                if (!isDragging.current || !toggleRef.current) return;
                e.preventDefault();
                const x = e.pageX - toggleRef.current.offsetLeft;
                const walk = (x - startX.current) * 2;
                toggleRef.current.scrollLeft = scrollLeft.current - walk;
            };

            
            useEffect(() => {
                messages.forEach(msg => {
                    if (msg.actions) {
                        msg.actions.forEach((action, idx) => {
                            if (action.type === 'terminal' && action.status === 'pending') {
                                autoExecuteTerminal(action.target, msg.id, idx);
                            }
                            if (action.type === 'file_create' && action.status === 'pending' && typeof action.content === 'string') {
                                queueFileCreate(action.target, action.content, msg.id, idx);
                            }
                            if (action.type === 'file_edit' && action.status === 'pending') {
                                autoExecuteFileEdit(action.target, action.oldText || '', action.newText || '', msg.id, idx);
                            }
                            if (action.type === 'file_delete' && action.status === 'pending') {
                                autoExecuteFileDelete(action.target, msg.id, idx);
                            }
                        });
                    }
                });
            }, [messages]);

            // Apply a small diff (oldText → newText) to an existing file. We
            // read the current contents, do an exact-match replace, and write
            // it back. If the oldText doesn't match (model drift) we mark the
            // action as failed so the AI can retry with a fresh snapshot.
            const autoExecuteFileEdit = async (
                filePath: string, oldText: string, newText: string,
                messageId: string, actionIndex: number,
            ) => {
                setMessages(prev => {
                    const newMsgs = [...prev];
                    const msg = newMsgs.find(m => m.id === messageId);
                    if (msg && msg.actions) msg.actions[actionIndex].status = 'executing';
                    return newMsgs;
                });
                try {
                    const { rpc } = await import('../access/rpcClient');
                    const cur = await rpc.call<any>('coding.read', { projectId, filePath });
                    const original: string = typeof cur?.content === 'string' ? cur.content : '';
                    if (!oldText || !original.includes(oldText)) {
                        throw new Error('old_text_not_found');
                    }
                    const patched = original.replace(oldText, newText);
                    await rpc.call('coding.save', { projectId, filePath, content: patched, source: 'agent' });
                    await refreshFileTree();
                    setMessages(prev => {
                        const newMsgs = [...prev];
                        const msg = newMsgs.find(m => m.id === messageId);
                        if (msg && msg.actions) msg.actions[actionIndex].status = 'done';
                        return newMsgs;
                    });
                } catch {
                    setMessages(prev => {
                        const newMsgs = [...prev];
                        const msg = newMsgs.find(m => m.id === messageId);
                        if (msg && msg.actions) msg.actions[actionIndex].status = 'failed';
                        return newMsgs;
                    });
                }
            };

            // Ensure the project has an exo.md memory file (mirrors replit.md).
            // Created lazily the first time the agent runs anything in a
            // project, with a friendly starter outlining what the AI should
            // remember between turns. Never overwrites an existing file.
            const exoMdInitRef = useRef<Set<string>>(new Set());
            const ensureExoMd = async () => {
                if (exoMdInitRef.current.has(projectId)) return;
                exoMdInitRef.current.add(projectId);
                try {
                    const { rpc } = await import('../access/rpcClient');
                    let exists = false;
                    try {
                        const r = await rpc.call<any>('coding.read', { projectId, filePath: 'exo.md' });
                        exists = typeof r?.content === 'string';
                    } catch {}
                    if (exists) return;
                    const seed =
`# exo.md

This file is the project's long-term memory for Exocode AI.
The agent updates it as it works — keep notes here that should
survive across chats (architecture, decisions, conventions).

## Project overview
_Add a one-liner here once the project takes shape._

## Recent changes
- Project initialized.

## Preferences
- Language: (auto-detected)
- Run command: (see system.exo)

## Open todos
- [ ] First task
`;
                    await rpc.call('coding.create', { projectId, filePath: 'exo.md', type: 'file', source: 'agent' }).catch(() => {});
                    await rpc.call('coding.save', { projectId, filePath: 'exo.md', content: seed, source: 'agent' });
                    await refreshFileTree();
                } catch {}
            };

            // Auto-apply: file edits are written immediately, no confirmation.
            // The server-side guard for system.exo (only [runtime] mergeable)
            // protects the project config from accidental overwrites.
            const queueFileCreate = async (filePath: string, content: string, messageId: string, actionIndex: number) => {
                autoExecuteFileCreate(filePath, content, messageId, actionIndex);
            };

            const autoExecuteFileCreate = async (filePath: string, content: string, messageId: string, actionIndex: number) => {
                setMessages(prev => {
                    const newMsgs = [...prev];
                    const msg = newMsgs.find(m => m.id === messageId);
                    if (msg && msg.actions) msg.actions[actionIndex].status = 'executing';
                    return newMsgs;
                });
                try {
                    const { rpc } = await import('../access/rpcClient');
                    await rpc.call('coding.create', { projectId, filePath, type: 'file', source: 'agent' }).catch(() => {});
                    await rpc.call('coding.save', { projectId, filePath, content, source: 'agent' });
                    await refreshFileTree();
                    setMessages(prev => {
                        const newMsgs = [...prev];
                        const msg = newMsgs.find(m => m.id === messageId);
                        if (msg && msg.actions) msg.actions[actionIndex].status = 'done';
                        return newMsgs;
                    });
                } catch {
                    setMessages(prev => {
                        const newMsgs = [...prev];
                        const msg = newMsgs.find(m => m.id === messageId);
                        if (msg && msg.actions) msg.actions[actionIndex].status = 'failed';
                        return newMsgs;
                    });
                }
            };

            // Called when the user clicks Yes/No on an awaiting_confirm card.
            const confirmOverwrite = (messageId: string, actionIndex: number, accept: boolean) => {
                const msg = messages.find(m => m.id === messageId);
                const action = msg?.actions?.[actionIndex];
                if (!msg || !action || action.type !== 'file_create') return;
                if (accept) {
                    autoExecuteFileCreate(action.target, action.content || '', messageId, actionIndex);
                } else {
                    setMessages(prev => {
                        const newMsgs = [...prev];
                        const m = newMsgs.find(x => x.id === messageId);
                        if (m && m.actions) m.actions[actionIndex].status = 'skipped';
                        return newMsgs;
                    });
                }
            };

            const autoExecuteFileDelete = async (filePath: string, messageId: string, actionIndex: number) => {
                try {
                    const { rpc } = await import('../access/rpcClient');
                    await rpc.call('coding.delete', { projectId, filePath });
                    await refreshFileTree();
                    setMessages(prev => {
                        const newMsgs = [...prev];
                        const msg = newMsgs.find(m => m.id === messageId);
                        if (msg && msg.actions) msg.actions[actionIndex].status = 'done';
                        return newMsgs;
                    });
                } catch {
                    setMessages(prev => {
                        const newMsgs = [...prev];
                        const msg = newMsgs.find(m => m.id === messageId);
                        if (msg && msg.actions) msg.actions[actionIndex].status = 'failed';
                        return newMsgs;
                    });
                }
            };

            const autoExecuteTerminal = (command: string, messageId: string, actionIndex: number) => {
                setMessages(prev => {
                    const newMsgs = [...prev];
                    const msg = newMsgs.find(m => m.id === messageId);
                    if (msg && msg.actions) {
                        msg.actions[actionIndex].status = 'executing';
                        msg.actions[actionIndex].output = '';
                msg.actions[actionIndex].showOutput = true;
                    }
                    return newMsgs;
                });

                const wsPath = `/exocore/terminal?projectId=${projectId}`;
                const socket = muxCarrier.openChannelInstance("terminal", wsPath) as unknown as WebSocket;

                let isReady = false;
                let outputBuffer = "";

                socket.onopen = () => {
                    
                    
                    socket.send(`env TERM=dumb PS1='' sh\r`);

                    
                    setTimeout(() => {
                        isReady = true; 
                        socket.send(`${command}\r`);

                        
                        setTimeout(() => {
                            socket.send(`exit\r`); 
                            setTimeout(() => {
                                if (socket.readyState === WebSocket.OPEN) socket.close();
                                let finalOutput = '';
                                let looksFailed = false;
                                setMessages(prev => {
                                    const newMsgs = [...prev];
                                    const msg = newMsgs.find(m => m.id === messageId);
                                    if (msg && msg.actions) {
                                        const act = msg.actions[actionIndex];
                                        finalOutput = (act.output || '').trim();
                                        looksFailed = looksLikeError(finalOutput);
                                        act.output = finalOutput || "Command executed successfully.";
                                        act.status = looksFailed ? 'failed' : 'done';
                                    }
                                    return newMsgs;
                                });

                                // If the command appears to have failed, auto-trigger a
                                // fix request so the AI re-plans with workspace + logs.
                                if (looksFailed) {
                                    triggerAutoFix(messageId, actionIndex, command, finalOutput);
                                }
                            }, 500);
                        }, 2500);
                    }, 1000);
                };

                socket.onmessage = (event) => {
                    if (!isReady) return;

                    const raw = event.data.toString();
                    outputBuffer += raw;

                    // Kitty-terminal style cleanup: strip ANSI escapes, OSC
                    // sequences, bell/ESC bytes, and CR. Then peel away every
                    // shell prompt residue so only the *result* of the command
                    // shows up — no "user@host$", no "(env) ➜", no "fish>".
                    let cleanStr = outputBuffer
                        .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
                        .replace(/\u001b\][0-9;]*.*?(?:\u0007|\u001b\\)/g, '')
                        .replace(/\u0007/g, '')
                        .replace(/\u001b/g, '')
                        .replace(/\r/g, '');

                    // Drop the wrapper invocation we ourselves sent.
                    cleanStr = cleanStr.replace(/^\s*env\s+TERM=dumb\s+PS1=''\s+sh\s*$/gm, '');

                    // Echo of the command we sent.
                    const escapedCmd = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    cleanStr = cleanStr.replace(new RegExp(`^${escapedCmd}\\s*\\n?`, 'm'), '');

                    // Drop "exit" + any trailing logout banners.
                    cleanStr = cleanStr.replace(/^\s*exit\s*$/gm, '');
                    cleanStr = cleanStr.replace(/^\s*logout\s*$/gm, '');

                    // Strip common shell prompts (bash/zsh/fish/sh). We only
                    // remove lines that LOOK like a prompt header so legit
                    // output containing "$" or "%" inside text survives.
                    cleanStr = cleanStr
                        .replace(/^[\w.+-]+@[\w.-]+:[^\s$#%>]*[$#%>]\s*/gm, '')   // user@host:/path$
                        .replace(/^[\w.-]+[$#%>]\s+/gm, '')                       // hostname$
                        .replace(/^\([^)]+\)\s*[➜→»]\s+\S+\s*/gm, '')             // (venv) ➜ folder
                        .replace(/^[➜→»]\s+\S+\s*/gm, '')                         // ➜ folder
                        .replace(/^fish:\s*/gm, '')                                // fish: prefix
                        .replace(/^sh-\d[\d.]*\$\s*/gm, '')                       // sh-5.1$
                        .replace(/^\$\s+/gm, '');                                  // bare "$ "

                    // Tidy up whitespace.
                    cleanStr = cleanStr
                        .replace(/^[ \t]+$/gm, '')
                        .replace(/\n{3,}/g, '\n\n')
                        .trim();

                    setMessages(prev => {
                        const newMsgs = [...prev];
                        const msg = newMsgs.find(m => m.id === messageId);
                        if (msg && msg.actions) {
                            msg.actions[actionIndex].output = cleanStr;
                        }
                        return newMsgs;
                    });
                };

                socket.onerror = () => {
                    setMessages(prev => {
                        const newMsgs = [...prev];
                        const msg = newMsgs.find(m => m.id === messageId);
                        if (msg && msg.actions) msg.actions[actionIndex].status = 'failed';
                        return newMsgs;
                    });
                };
            };

            // Heuristic: did this terminal output look like a failure?
            // We check for typical error keywords across npm, node, python,
            // shells and compilers. Empty output is treated as success.
            const looksLikeError = (out: string): boolean => {
                if (!out) return false;
                const s = out.toLowerCase();
                const patterns = [
                    /\berror\b/, /\bexception\b/, /\bfailed\b/, /\bfatal\b/,
                    /\btraceback\b/, /\bsyntaxerror\b/, /\btypeerror\b/, /\breferenceerror\b/,
                    /\benoent\b/, /\beacces\b/, /\bcommand not found\b/, /\bno such file\b/,
                    /\bcannot find module\b/, /\bmodulenotfounderror\b/,
                    /\bnpm err!\b/, /\byarn err\b/, /\berror ts\d+/,
                    /\bsegmentation fault\b/, /\bpermission denied\b/,
                ];
                return patterns.some(p => p.test(s));
            };

            // Re-prompt the agent with the workspace + the failing command/logs
            // so it can propose a fix. Runs at most once per failed action so
            // we don't loop forever on persistent errors.
            const triggerAutoFix = async (sourceMsgId: string, sourceActionIdx: number, command: string, logs: string) => {
                let already = false;
                setMessages(prev => {
                    const newMsgs = [...prev];
                    const m = newMsgs.find(x => x.id === sourceMsgId);
                    const a = m?.actions?.[sourceActionIdx];
                    if (a?.autoFixed) { already = true; return prev; }
                    if (a) a.autoFixed = true;
                    return newMsgs;
                });
                if (already) return;

                const fixerMsg: Message = {
                    id: (Date.now() + Math.random()).toString(),
                    role: 'ai',
                    steps: [`Detected error in: ${command}`, 'Re-scanning project (find ./)...', 'Asking Llama to fix it...'],
                    actions: [],
                    isGenerating: true,
                    provider: 'exocore',
                    kind: 'agent',
                };
                setMessages(prev => [...prev, fixerMsg]);

                const fixPrompt =
`The previous command failed. Please diagnose and fix it.

Original user request:
${lastUserPromptRef.current || '(unknown)'}

Failed command:
${command}

Terminal logs:
${logs.slice(0, 4000)}

Use the project tree (find ./) and existing files supplied in the workspace context to produce file_create / terminal actions that resolve the error. After fixing, re-run the failing command.`;

                try {
                    const res = await rpc.call<any>('ai.metaAgent', withMeta({
                        prompt: fixPrompt,
                        projectId,
                    }), { timeoutMs: 180000 });
                    if (!res?.ok) throw new Error(res?.detail || res?.error || 'agent failed');
                    trackConv(res?.conversationId);

                    const planned = (res.actions || []).map((a: any) => {
                        if (a.type === 'file_create') return { type: 'file_create', target: a.path, status: 'pending', content: a.content };
                        if (a.type === 'file_delete') return { type: 'file_delete', target: a.path, status: 'pending' };
                        if (a.type === 'terminal') return { type: 'terminal', target: a.command, status: 'pending', showOutput: false };
                        return null;
                    }).filter(Boolean);

                    setMessages(prev => {
                        const msgs = [...prev];
                        const last = msgs.find(m => m.id === fixerMsg.id);
                        if (last) {
                            last.text = res.data.message || 'Auto-fix plan ready.';
                            last.actions = planned;
                            last.steps = [...(last.steps || []), `Plan: ${planned.length} action(s)`];
                            last.isGenerating = false;
                        }
                        return msgs;
                    });
                } catch (err: any) {
                    const detail = err?.response?.data?.detail || err.message || 'auto-fix failed';
                    setMessages(prev => {
                        const msgs = [...prev];
                        const last = msgs.find(m => m.id === fixerMsg.id);
                        if (last) {
                            last.text = `Auto-fix failed: ${detail}`;
                            last.isGenerating = false;
                        }
                        return msgs;
                    });
                }
            };

            const toggleActionOutput = (msgId: string, actionIndex: number) => {
                setMessages(prev => {
                    const newMsgs = [...prev];
                    const msg = newMsgs.find(m => m.id === msgId);
                    if (msg && msg.actions) {
                        msg.actions[actionIndex].showOutput = !msg.actions[actionIndex].showOutput;
                    }
                    return newMsgs;
                });
            };

            const clearChat = async () => {
                const docId = docIdRef.current;
                docIdRef.current = null;
                setMessages([]);
                await Promise.all([
                    del(idbChatKey(projectId)).catch(() => {}),
                    del(idbDocKey(projectId)).catch(() => {}),
                ]);
                toast.success("Chat memory cleared");
                if (docId) {
                    try {
                        await rpc.call('ai.metaCleanup', withMeta({ conversationIds: [docId] }));
                    } catch { /* best-effort cleanup */ }
                }
            };

            // ---- Sticky session controls (mode / warmup / reset) -----------
            const refreshSession = async () => {
                try {
                    const r = await rpc.call<any>('ai.metaSession');
                    setSessionId(r?.conversationId || null);
                    setSessionMode((r?.mode === 'IMAGINE' ? 'IMAGINE' : 'CHAT'));
                } catch { /* ignore */ }
            };

            // Reset = delete the pinned convo on Meta AI + drop our local id
            // so the next message starts a brand new conversation. This is
            // the fastest fix when the model still "remembers" an old system
            // prompt or persona from the previous session. Tries the direct
            // bridge first (single round-trip, matches the example contract
            // { id/conversation_id, cookies }), then falls back to the
            // server proxy on CORS / network failures.
            const resetSession = async () => {
                if (!window.confirm('Reset the active Meta conversation? The next message will start a fresh convo on meta.ai.')) return;
                setBusySession(true);
                const tid = toast.loading('Resetting convo on meta.ai...');
                const cid = docIdRef.current;
                try {
                    let ok = false;
                    if (cid && cookieRef.current) {
                        try {
                            const dr = await axios.post(`${EXOCORE_BASE}/delete`, {
                                id: cid,
                                conversation_id: cid,
                                cookies: cookieRef.current,
                            }, { timeout: 60000 });
                            if (dr.data && dr.data.ok !== false) ok = true;
                        } catch { /* fall through to proxy */ }
                    }
                    if (!ok) {
                        await rpc.call('ai.metaSessionReset', withMeta());
                    }
                    setSessionId(null);
                    docIdRef.current = null;
                    setMessages([]);
                    await Promise.all([
                        del(idbChatKey(projectId)).catch(() => {}),
                        del(idbDocKey(projectId)).catch(() => {}),
                    ]);
                    toast.success('Convo reset on meta.ai', { id: tid });
                } catch (err: any) {
                    toast.error(`Reset failed: ${err?.response?.data?.detail || err.message}`, { id: tid });
                } finally { setBusySession(false); }
            };

            /* Bootstrap exactly ONE pinned conversation on meta.ai and
             * remember its id forever (well, until reset). The user clicks
             * "Create convo" once after pasting cookies — every subsequent
             * message reuses this id, so meta.ai stops creating duplicate
             * "Quick Hello" threads. If a convo is already pinned we just
             * surface the existing id instead of spawning another one. */
            const createSession = async () => {
                if (docIdRef.current) {
                    toast.success(`Already pinned: #${docIdRef.current.slice(0, 6)}`);
                    return;
                }
                setBusySession(true);
                const tid = toast.loading('Creating convo on meta.ai...');
                try {
                    const r = await rpc.call<any>(
                        'ai.metaSessionCreate',
                        withMeta({ seed: 'ping' }),
                        { timeoutMs: 90000 },
                    );
                    const id = r?.conversationId || r?.sessionId;
                    if (!id) throw new Error('no_convo_id');
                    trackConv(id);
                    setSessionId(id);
                    toast.success(`Convo pinned: #${String(id).slice(0, 6)}`, { id: tid });
                } catch (err: any) {
                    toast.error(`Create failed: ${err?.response?.data?.detail || err.message}`, { id: tid });
                } finally { setBusySession(false); }
            };

            /* Generic mode setter — used by the Fast / Thinking / Imagine
             * toggles in the header. The pinned conversation id is kept
             * intact (we send it back as `id` + `conversation_id`), so the
             * exact same convo continues — only the reasoning mode flips.
             * If no convo is pinned yet we still flip the local mode so the
             * NEXT message is sent with the new mode from the start. */
            const switchMode = async (next: SessionMode) => {
                if (next === sessionMode) return;
                const label = next === 'think_hard' ? 'Thinking'
                    : next === 'think_fast' ? 'Fast'
                    : next === 'IMAGINE' ? 'Imagine' : 'Chat';
                setSessionMode(next);
                const cid = docIdRef.current;
                toast.success(cid ? `Mode: ${label} (convo kept)` : `Mode: ${label}`);
                if (!cid) return;
                setBusySession(true);
                try {
                    // withMeta() already injects id + conversation_id +
                    // conversationId so the server keeps the same chat.
                    await rpc.call('ai.metaMode', withMeta({ mode: next }));
                } catch { /* best-effort, not fatal */ }
                finally { setBusySession(false); }
            };
            // Legacy no-op kept for backwards-compat with callers/refs below.
            const toggleSessionMode = () => switchMode(sessionMode === 'IMAGINE' ? 'think_fast' : 'IMAGINE');

            /* Verify the pasted cookie blob against meta.ai (server probes
             * each cookie individually) and persist the working subset to
             * IndexedDB. Server-side disk storage is intentionally disabled. */
            const saveCookiesFromPaste = async () => {
                const parsed = parseCookieBlob(cookiePaste);
                if (!parsed) {
                    toast.error('Could not parse cookies. Paste JSON, an exported array, or "name=value; ..."');
                    return;
                }
                setCookieBusy(true);
                const tid = toast.loading(`Testing ${Object.keys(parsed).length} cookies...`);
                try {
                    const r = await rpc.call<any>('ai.metaCookiesPost', { cookies: parsed }, { timeoutMs: 180000 });
                    if (!r?.ok) throw new Error(r?.detail || r?.error || 'verify failed');
                    const working: CookieMap = (r.cookies && typeof r.cookies === 'object') ? r.cookies : parsed;
                    await saveStoredCookies(working);
                    cookieRef.current = working;
                    setCookieMap(working);
                    setCookiePaste('');
                    toast.success(`Saved cookies to IndexedDB: ${Object.keys(working).join(', ')}`, { id: tid });
                } catch (err: any) {
                    const detail = err?.response?.data?.detail || err?.response?.data?.error || err?.message || 'failed';
                    toast.error(`Cookie save failed: ${detail}`, { id: tid });
                } finally { setCookieBusy(false); }
            };

            const eraseCookies = async () => {
                if (!window.confirm('Erase saved meta.ai cookies from this browser?')) return;
                await clearStoredCookies();
                cookieRef.current = null;
                setCookieMap(null);
                toast.success('Cookies erased');
            };

            const warmupSession = async () => {
                if (!sessionId) {
                    toast.error('No active conversation yet. Send a message first.');
                    return;
                }
                setBusySession(true);
                const tid = toast.loading('Warming up...');
                try {
                    const r = await rpc.call<any>('ai.metaWarmup', withMeta());
                    if (!r?.ok) throw new Error(r?.detail || r?.error || 'warmup failed');
                    toast.success('Pre-warmed', { id: tid });
                } catch (err: any) {
                    toast.error(`Warmup failed: ${err?.response?.data?.detail || err.message}`, { id: tid });
                } finally { setBusySession(false); }
            };

            // Wipe EVERY conversation on the user's meta.ai account (not just
            // the ones we tracked locally). One-shot nuke for housekeeping.
            // Calls the Exocore Llama bridge directly so we don't need a
            // server round-trip for this admin action.
            const deleteAllConversations = async () => {
                if (!cookieRef.current) {
                    toast.error('Paste your meta.ai cookies first.');
                    setShowCookieMenu(true);
                    return;
                }
                if (!window.confirm("Delete ALL conversations on your meta.ai account? This cannot be undone.")) return;
                const tid = toast.loading("Wiping all meta.ai conversations...");
                try {
                    // Try the direct HF Space endpoint first (matches the
                    // example contract: { confirm, cookies }). Fall back to
                    // the server proxy if the direct call is blocked by
                    // CORS so the button still works in restricted setups.
                    let deleted: number | string | undefined;
                    try {
                        const dr = await axios.post(`${EXOCORE_BASE}/delete/all`, {
                            confirm: true,
                            cookies: cookieRef.current,
                        }, { timeout: 180000 });
                        const data = dr.data || {};
                        if (data.ok === false) throw new Error(data.detail || data.error || 'delete failed');
                        deleted = Array.isArray(data.deleted) ? data.deleted.length : data.deleted;
                    } catch (directErr: any) {
                        const r = await rpc.call<any>('ai.metaDeleteAll', withMeta({ confirm: true }), { timeoutMs: 180000 });
                        if (!r?.ok) throw new Error(r?.detail || r?.error || directErr?.message || 'delete failed');
                        deleted = r?.deleted;
                    }
                    docIdRef.current = null;
                    setSessionId(null);
                    setMessages([]);
                    await Promise.all([
                        del(idbChatKey(projectId)).catch(() => {}),
                        del(idbDocKey(projectId)).catch(() => {}),
                    ]);
                    toast.success(typeof deleted === 'number' ? `Deleted ${deleted} conversation(s)` : "All conversations deleted", { id: tid });
                } catch (err: any) {
                    const detail = err?.response?.data?.detail || err?.response?.data?.error || err.message;
                    toast.error(`Delete-all failed: ${detail}`, { id: tid });
                }
            };

            // Open a file from an action card in the editor's main pane.
            const openFileInEditor = async (filePath: string) => {
                try {
                    const { rpc } = await import('../access/rpcClient');
                    const r = await rpc.call<any>('coding.read', { projectId, filePath });
                    const node = { name: filePath.split('/').pop() || filePath, path: filePath, type: 'file' as const };
                    setActiveFile(node as any, r?.content ?? '');
                } catch {
                    toast.error(`Could not open ${filePath}`);
                }
            };

            // REST-only: no persistent WebSocket needed

            const refreshFileTree = async () => {
                try {
                    const { rpc } = await import('../access/rpcClient');
                    const res = await rpc.call<any>('coding.files', { projectId });
                    setFiles(res.files);
                } catch (err) {}
            };

            // @ts-expect-error reserved for future WS integration
            const handleWsEvent = async (payload: { type: string; data: any }) => {
                setMessages((prev) => {
                    const newMessages = [...prev];
                    const lastMsg = newMessages[newMessages.length - 1];

                    if (payload.type === 'greeting') {
                        if (lastMsg && lastMsg.role === 'ai' && lastMsg.isGenerating) {
                            lastMsg.text = payload.data;
                            return newMessages;
                        }
                        return [...prev, { id: Date.now().toString(), role: 'ai', text: payload.data, isGenerating: false, provider: 'exocore' }];
                    }

                    if (!lastMsg || lastMsg.role !== 'ai' || !lastMsg.isGenerating) return prev;

                    const ensureActions = () => { if (!lastMsg.actions) lastMsg.actions = []; };

                    switch (payload.type) {
                        case 'step':
                        case 'language':
                            lastMsg.steps = [...(lastMsg.steps || []), typeof payload.data === 'string' ? payload.data : JSON.stringify(payload.data)];
                            break;
                        case 'plan_done':
                            ensureActions();
                            payload.data.files.forEach((f: string) => lastMsg.actions!.push({ type: 'file_create', target: f, status: 'pending' }));
                            break;
                        case 'file_done':
                            if (lastMsg.actions) {
                                const action = lastMsg.actions.find(a => a.type === 'file_create' && a.target === payload.data.file);
                                if (action) action.status = 'done';
                            }
                            break;
                        case 'delete_file':
                            ensureActions();
                            lastMsg.actions!.push({ type: 'file_delete', target: payload.data.file, status: 'done' });
                            break;
                        case 'terminal_command':
                            ensureActions();
                            lastMsg.actions!.push({ type: 'terminal', target: payload.data.command, status: 'pending', showOutput: false });
                            break;
                        case 'done':
                            lastMsg.isGenerating = false;
                            break;
                    }
                    return newMessages;
                });

                if (payload.type === 'file_done') await autoCreateFile(payload.data.file, payload.data.code);
                if (payload.type === 'delete_file') await executeDeleteFile(payload.data.file);
            };

                const autoCreateFile = async (filePath: string, code: string) => {
                    const { rpc } = await import('../access/rpcClient');
                    try {
                        await rpc.call('coding.save', { projectId, filePath, content: code });
                        await refreshFileTree();
                    } catch (error) {
                        try {
                            await rpc.call('coding.create', { projectId, filePath, type: 'file' });
                            await rpc.call('coding.save', { projectId, filePath, content: code });
                            await refreshFileTree();
                        } catch (fallbackError) {}
                    }
                };

                const executeDeleteFile = async (filePath: string) => {
                    try {
                        const { rpc } = await import('../access/rpcClient');
                        await rpc.call('coding.delete', { projectId, filePath });
                        await refreshFileTree();
                    } catch (err) {}
                };

                
                const saveKiloConfig = async () => {
                    await set('kilo_provider', kiloProvider);
                    await set('kilo_model', kiloModel);
                    await set('kilo_key', kiloKey);
                    setShowKiloSetup(false);
                    toast.success(`Key Saved!`);
                };

                const removeKiloConfig = async () => {
                    await del('kilo_key');
                    setKiloKey('');
                    toast.success(`Key Removed.`);
                };

                const saveRestConfig = async () => {
                    if (!restEndpoint) return toast.error("Endpoint URL is required");
                    await set('rest_endpoint', restEndpoint);
                    await set('rest_query_param', restQueryParam);
                    await set('rest_data_path', restDataPath);
                    setShowRestSetup(false);
                    toast.success(`REST API Config Applied!`);
                };

                const saveRestPreset = async () => {
                    if (!restEndpoint) return toast.error("Endpoint URL is required");
                    let name = "Custom API";
                    try { name = new URL(restEndpoint).hostname; } catch (e) {}

                    const newPreset: RestPreset = {
                        id: Date.now().toString(),
                        name: name,
                        endpoint: restEndpoint,
                        queryParam: restQueryParam,
                        dataPath: restDataPath
                    };

                    const newPresets = [...restPresets, newPreset];
                    setRestPresets(newPresets);
                    await set('rest_presets', newPresets);

                    await saveRestConfig();
                    toast.success("Saved to your API Presets!");
                };

                const loadRestPreset = (id: string) => {
                    if (!id) return;
                    const p = restPresets.find(x => x.id === id);
                    if (p) {
                        setRestEndpoint(p.endpoint);
                        setRestQueryParam(p.queryParam);
                        setRestDataPath(p.dataPath);
                        toast.success(`Loaded ${p.name}`);
                    }
                };

                const deleteRestPreset = async (id: string) => {
                    const newPresets = restPresets.filter(x => x.id !== id);
                    setRestPresets(newPresets);
                    await set('rest_presets', newPresets);
                    toast.success("Preset deleted.");
                };

                const buildWorkspaceContext = async () => {
                    let treeOutput = "Project Tree:\n";
                    let filesOutput = "File Contents:\n";
                    const allowedExts = ['.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.json', '.txt'];

                    const traverse = async (nodes: any[], pathPrefix = '') => {
                        for (const node of nodes) {
                            if (['node_modules', '.git', 'dist', 'build'].includes(node.name)) continue;
                            treeOutput += `${pathPrefix}├── ${node.name}\n`;
                            if (node.type === 'directory' && node.children) {
                                await traverse(node.children, pathPrefix + '│   ');
                            } else if (node.type !== 'directory') {
                                const ext = '.' + node.name.split('.').pop()?.toLowerCase();
                                if (allowedExts.includes(ext)) {
                                    try {
                                        const { rpc } = await import('../access/rpcClient');
                                        const res = await rpc.call<any>('coding.read', { projectId, filePath: node.path });
                                        filesOutput += `\n--- ${node.path} ---\n\`\`\`${ext.slice(1)}\n${res?.content}\n\`\`\`\n`;
                                    } catch (e) {}
                                }
                            }
                        }
                    };

                    if (projectTree) await traverse(projectTree);
                    return `${treeOutput}\n\n${filesOutput}`;
                };

                
                const handleSend = async () => {
                    if (!input.trim()) return;

                    if (aiMode === 'kilo' && kiloProvider !== 'meta' && !kiloKey) {
                        setShowKiloSetup(true);
                        return toast.error("Configure Custom Key first.");
                    }
                    if (aiMode === 'rest' && !restEndpoint) {
                        setShowRestSetup(true);
                        return toast.error("Configure REST API Endpoint first.");
                    }
                    

                    const userText = input;
                    lastUserPromptRef.current = userText;
                    setInput('');

                    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: userText };
                    const aiMsg: Message = { id: (Date.now() + 1).toString(), role: 'ai', steps: [], actions: [], isGenerating: true, provider: aiMode };
                    setMessages(prev => [...prev, userMsg, aiMsg]);

                    let finalPrompt = userText;
                    const lowerInput = userText.toLowerCase();

                    
                    if (/(read|install|add|delete|remove|check|ls|dir|command)/i.test(lowerInput)) {
                        toast.loading("Reading workspace...", { id: 'ctx' });
                        const workspaceData = await buildWorkspaceContext();
                        finalPrompt = `User Request: ${userText}\n\n[WORKSPACE CONTEXT]:\n${workspaceData}`;
                        toast.success("Workspace loaded!", { id: 'ctx' });
                    }

                    
                    if (aiMode === 'rest') {
                        try {
                            const res = await axios.get(restEndpoint, {
                                params: { [restQueryParam]: finalPrompt }
                            });

                            const keys = restDataPath.split('.');
                            let aiResponseData = res.data;
                            for (const k of keys) {
                                if (aiResponseData && aiResponseData[k] !== undefined) {
                                    aiResponseData = aiResponseData[k];
                                } else {
                                    aiResponseData = null;
                                    break;
                                }
                            }

                            if (!aiResponseData || typeof aiResponseData !== 'string') {
                                throw new Error(`Data path '${restDataPath}' not found or is not text.`);
                            }

                            setMessages(prev => {
                                const newMsgs = [...prev];
                                const last = newMsgs[newMsgs.length - 1];
                                last.text = aiResponseData;
                                last.isGenerating = false;
                                return newMsgs;
                            });
                        } catch (err: any) {
                            setMessages(prev => {
                                const newMsgs = [...prev];
                                const last = newMsgs[newMsgs.length - 1];
                                last.text = `REST API Error: ${err.message || 'Something went wrong.'}`;
                                last.isGenerating = false;
                                return newMsgs;
                            });
                            toast.error("REST API Request Failed");
                        }
                        return;
                    }

                    // === EXTRA PROVIDERS (Deep / Hez / Pixe) — Tapos multi-AI wrapper ===
                    if (aiMode === 'exocore' && provider !== 'meta') {
                        try {
                            const body: Record<string, unknown> = { prompt: finalPrompt };
                            if (provider === 'hez') {
                                if (!hezToken.trim()) {
                                    setShowProviderMenu(true);
                                    throw new Error('Paste your chat.z.ai token in the provider menu first.');
                                }
                                body.token = hezToken.trim();
                            }
                            const res = await rpc.call<any>('ai.extra', { provider, ...body }, { timeoutMs: 120000 });
                            if (!res?.ok) throw new Error(res?.detail || res?.error || `${provider} failed`);
                            setMessages(prev => {
                                const msgs = [...prev];
                                const last = msgs[msgs.length - 1];
                                last.text = res.reply || 'No response.';
                                last.isGenerating = false;
                                return msgs;
                            });
                        } catch (err: any) {
                            const detail = err?.response?.data?.detail || err?.response?.data?.error || err.message || 'Request failed.';
                            setMessages(prev => {
                                const msgs = [...prev];
                                const last = msgs[msgs.length - 1];
                                last.text = `${PROVIDER_LABEL[provider]} error: ${detail}`;
                                last.isGenerating = false;
                                return msgs;
                            });
                            toast.error(`${PROVIDER_LABEL[provider]} failed`);
                        }
                        return;
                    }

                    // === EXOCORE LLAMA (https://exocore-llama.hf.space/) ===
                    if (aiMode === 'exocore') {
                        // Detect intent: image, agent (multi-step file/cmd/edit), or plain chat.
                        const imageMatch = userText.match(/^\s*(?:\/(?:image|img|generate)\s+|image:\s*)(.+)$/i);
                        // English + Tagalog action verbs, plus shell-y prompts so
                        // "cmd ls", "run npm install" or just "ls" all route to
                        // the agent (which can emit terminal actions).
                        const wantsAgent =
                            /\b(create|build|scaffold|generate|make|setup|set up|initialize|init|add|install|delete|remove|fix|refactor|run|edit|update|change|rename|open|close|read|show|list|find|run|exec|execute|gawa|gawin|gumawa|ayusin|baguhin|tanggalin|alisin|ipakita|buksan|isara|hanapin|ilista|i-install|i-edit|i-run)\b/i.test(userText)
                            || /^\s*(?:\/?cmd\s+|\/run\s+|\$\s+|>\s+)/i.test(userText)
                            || /^\s*(?:ls|pwd|cd\s|cat\s|find\s|grep\s|mkdir\s|rm\s|touch\s|npm\s|pnpm\s|yarn\s|node\s|python\s|pip\s|git\s|echo\s)/i.test(userText);

                        try {
                            if (imageMatch) {
                                setMessages(prev => {
                                    const msgs = [...prev];
                                    const last = msgs[msgs.length - 1];
                                    last.kind = 'image';
                                    return msgs;
                                });
                                const imgRes = await rpc.call<any>('ai.metaImage', withMeta({
                                    prompt: imageMatch[1].trim(),
                                    orientation: 'SQUARE',
                                }), { timeoutMs: 180000 });
                                if (!imgRes?.ok) throw new Error(imgRes?.detail || imgRes?.error || 'image failed');
                                trackConv(imgRes?.conversationId);
                                setMessages(prev => {
                                    const msgs = [...prev];
                                    const last = msgs[msgs.length - 1];
                                    last.images = imgRes.images || [];
                                    last.text = last.images && last.images.length
                                        ? `Generated ${last.images.length} image${last.images.length > 1 ? 's' : ''} for: "${imageMatch[1].trim()}"`
                                        : 'No images returned.';
                                    last.isGenerating = false;
                                    return msgs;
                                });
                            } else if (wantsAgent) {
                                setMessages(prev => {
                                    const msgs = [...prev];
                                    const last = msgs[msgs.length - 1];
                                    last.kind = 'agent';
                                    last.steps = ['Scanning project (find ./)...', 'Asking Llama for an action plan...'];
                                    return msgs;
                                });
                                const agentRes = await rpc.call<any>('ai.metaAgent', withMeta({
                                    prompt: userText,
                                    projectId,
                                }), { timeoutMs: 180000 });
                                if (!agentRes?.ok) throw new Error(agentRes?.detail || agentRes?.error || 'agent failed');
                                trackConv(agentRes?.conversationId);

                                const planned = (agentRes.actions || []).map((a: any) => {
                                    if (a.type === 'file_create') return { type: 'file_create', target: a.path, status: 'pending', content: a.content };
                                    if (a.type === 'file_edit')   return { type: 'file_edit',   target: a.path, status: 'pending', oldText: a.old || a.oldText || '', newText: a.new || a.newText || '', showOutput: true };
                                    if (a.type === 'file_delete') return { type: 'file_delete', target: a.path, status: 'pending' };
                                    if (a.type === 'terminal')    return { type: 'terminal',    target: a.command, status: 'pending', showOutput: false };
                                    return null;
                                }).filter(Boolean);

                                // Build a friendly per-step plan list so the
                                // user sees "1. Create index.js, 2. Install
                                // express, 3. Run node index.js" before the
                                // executor starts firing actions.
                                const planSteps = planned.map((a: any, i: number) => {
                                    const verb = a.type === 'file_create' ? 'Create' : a.type === 'file_edit' ? 'Edit' : a.type === 'file_delete' ? 'Delete' : 'Run';
                                    return `${i + 1}. ${verb} ${a.type === 'terminal' ? '`' + a.target + '`' : a.target}`;
                                });

                                // Lazily seed exo.md the first time the agent
                                // does any work in a project (mirrors replit.md).
                                ensureExoMd();

                                setMessages(prev => {
                                    const msgs = [...prev];
                                    const last = msgs[msgs.length - 1];
                                    last.text = agentRes.message || 'Plan ready.';
                                    last.actions = planned;
                                    last.steps = [
                                        ...(last.steps || []),
                                        `Plan ready — ${planned.length} step${planned.length === 1 ? '' : 's'}`,
                                        ...planSteps,
                                    ];
                                    last.isGenerating = false;
                                    return msgs;
                                });
                            } else {
                                const res = await rpc.call<any>('ai.meta', withMeta({
                                    prompt: finalPrompt,
                                }), { timeoutMs: 95000 });
                                if (!res?.ok) throw new Error(res?.detail || res?.error || 'chat failed');
                                trackConv(res?.conversationId);
                                setMessages(prev => {
                                    const msgs = [...prev];
                                    const last = msgs[msgs.length - 1];
                                    last.text = res.reply || 'No response.';
                                    last.isGenerating = false;
                                    return msgs;
                                });
                            }
                        } catch (err: any) {
                            const detail = err?.response?.data?.detail || err?.response?.data?.error || err.message || 'Request failed.';
                            setMessages(prev => {
                                const msgs = [...prev];
                                const last = msgs[msgs.length - 1];
                                last.text = `Exocore Llama error: ${detail}`;
                                last.isGenerating = false;
                                return msgs;
                            });
                            if (/no_cookies/i.test(detail)) {
                                toast.error('Paste your meta.ai cookies in the cookie menu first.');
                                setShowCookieMenu(true);
                            } else {
                                toast.error('Exocore Llama failed');
                            }
                        }
                        return;
                    }

                    // === KILO REST ===
                    try {
                        let reply = '';
                        if (kiloProvider === 'meta') {
                            const metaRes = await rpc.call<any>('ai.meta', {
                                prompt: finalPrompt,
                            }, { timeoutMs: 95000 });
                            if (metaRes?.ok) {
                                reply = metaRes.reply || 'No response.';
                            } else {
                                throw new Error(metaRes?.detail || metaRes?.error || 'Meta AI failed');
                            }
                        } else if (kiloProvider === 'gemini') {
                            const gemUrl = `https://generativelanguage.googleapis.com/v1beta/models/${kiloModel}:generateContent?key=${kiloKey}`;
                            const gemRes = await axios.post(gemUrl, {
                                contents: [{ parts: [{ text: finalPrompt }] }]
                            }, { timeout: 60000 });
                            reply = gemRes.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response.';
                        } else if (kiloProvider === 'openai') {
                            const oaiRes = await axios.post('https://api.openai.com/v1/chat/completions', {
                                model: kiloModel,
                                messages: [{ role: 'user', content: finalPrompt }],
                            }, { headers: { Authorization: `Bearer ${kiloKey}` }, timeout: 60000 });
                            reply = oaiRes.data?.choices?.[0]?.message?.content ?? 'No response.';
                        } else if (kiloProvider === 'claude') {
                            const clRes = await axios.post('https://api.anthropic.com/v1/messages', {
                                model: kiloModel || 'claude-3-5-sonnet-20241022',
                                max_tokens: 4096,
                                messages: [{ role: 'user', content: finalPrompt }],
                            }, { headers: { 'x-api-key': kiloKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, timeout: 60000 });
                            reply = clRes.data?.content?.[0]?.text ?? 'No response.';
                        } else {
                            reply = 'Unknown provider.';
                        }
                        setMessages(prev => {
                            const msgs = [...prev];
                            const last = msgs[msgs.length - 1];
                            last.text = reply;
                            last.isGenerating = false;
                            return msgs;
                        });
                    } catch (err: any) {
                        const errMsg = err?.response?.data?.error?.message || err.message || 'Request failed.';
                        setMessages(prev => {
                            const msgs = [...prev];
                            const last = msgs[msgs.length - 1];
                            last.text = `Custom Key Error: ${errMsg}`;
                            last.isGenerating = false;
                            return msgs;
                        });
                        toast.error('Custom Key API failed');
                    }
                };

                return (
                    <div className="exo-ai-pane">
                    <div className="ai-header" ref={toggleRef}>
                        <div className="ai-header-row brand-row">
                            <div className="meta-brand">
                                <span className="brand-dot" />
                                <div className="brand-stack">
                                    <span className="brand-name">{PROVIDER_LABEL[provider]}</span>
                                    <span className="brand-sub">
                                        {provider === 'meta' ? (
                                            <>
                                                <span className={`status-dot ${cookieMap ? 'ok' : 'warn'}`} />
                                                {cookieMap ? (sessionId ? `pinned · #${sessionId.slice(0, 6)}` : 'connected') : 'no cookies'}
                                            </>
                                        ) : provider === 'hez' ? (
                                            <>
                                                <span className={`status-dot ${hezToken ? 'ok' : 'warn'}`} />
                                                {hezToken ? 'token saved' : 'no token'}
                                            </>
                                        ) : (
                                            <>
                                                <span className="status-dot ok" />
                                                {provider === 'deep' ? 'free · no auth' : 'cookies optional'}
                                            </>
                                        )}
                                    </span>
                                </div>
                            </div>
                            <div className="brand-actions">
                                <button
                                    className={`chip provider-chip ${provider}`}
                                    onClick={() => { setShowProviderMenu(v => !v); setShowCookieMenu(false); setShowActionsMenu(false); }}
                                    title={`AI provider: ${PROVIDER_LABEL[provider]}`}
                                    aria-label="Pick AI provider">
                                    <Sparkles size={13} />
                                    <span className="chip-label">{PROVIDER_LABEL[provider]}</span>
                                </button>
                                <button
                                    className={`chip cookie-chip ${cookieMap ? 'ok' : 'warn'}`}
                                    onClick={() => { setShowCookieMenu(v => !v); setShowActionsMenu(false); }}
                                    title={cookieMap ? `Cookies active (${Object.keys(cookieMap).length})` : 'Paste meta.ai cookies'}
                                    aria-label="Cookies">
                                    <KeyRound size={13} />
                                    <span className="chip-label">{cookieMap ? 'Cookies' : 'Add cookies'}</span>
                                </button>
                                <button
                                    className={`chip create-chip ${sessionId ? 'pinned' : ''}`}
                                    onClick={createSession}
                                    disabled={busySession || !cookieMap}
                                    title={sessionId
                                        ? `Convo pinned: #${sessionId.slice(0, 8)} — every message reuses this same thread on meta.ai`
                                        : 'Create ONE conversation on meta.ai and pin its id'}
                                    aria-label="Create convo">
                                    {sessionId ? <Check size={13} /> : <Sparkles size={13} />}
                                    <span className="chip-label">{sessionId ? 'Pinned' : 'Create'}</span>
                                </button>
                                <button
                                    className={`icon-only-btn ${showActionsMenu ? 'open' : ''}`}
                                    onClick={() => { setShowActionsMenu(v => !v); setShowCookieMenu(false); }}
                                    title="More actions"
                                    aria-label="More actions"
                                    aria-expanded={showActionsMenu}>
                                    <MoreHorizontal size={16} />
                                </button>
                            </div>
                        </div>

                        <div className="ai-header-row mode-row">
                            <div className="mode-switch" role="tablist" aria-label="Reasoning mode">
                                <button
                                    className={`mode-switch-btn ${sessionMode === 'think_fast' ? 'active fast' : ''}`}
                                    onClick={() => switchMode('think_fast')}
                                    disabled={busySession}
                                    role="tab"
                                    aria-selected={sessionMode === 'think_fast'}
                                    title="Fast — instant replies, lower latency">
                                    <Gauge size={13} />
                                    <span>Fast</span>
                                </button>
                                <button
                                    className={`mode-switch-btn ${sessionMode === 'think_hard' ? 'active thinking' : ''}`}
                                    onClick={() => switchMode('think_hard')}
                                    disabled={busySession}
                                    role="tab"
                                    aria-selected={sessionMode === 'think_hard'}
                                    title="Thinking — extended chain-of-thought reasoning">
                                    <Brain size={13} />
                                    <span>Thinking</span>
                                </button>
                            </div>
                        </div>

                        {showActionsMenu && (
                            <div className="actions-menu" onClick={(e) => e.stopPropagation()}>
                                <button className="action-item" onClick={() => { setShowActionsMenu(false); warmupSession(); }} disabled={busySession || !sessionId}>
                                    <Zap size={14} color="#f1c40f" />
                                    <span>Pre-warm convo</span>
                                    <span className="action-hint">faster next reply</span>
                                </button>
                                <button className="action-item" onClick={() => { setShowActionsMenu(false); resetSession(); }} disabled={busySession}>
                                    <RotateCcw size={14} color="#3498db" />
                                    <span>Reset convo</span>
                                    <span className="action-hint">delete pinned thread</span>
                                </button>
                                {messages.length > 0 && (
                                    <button className="action-item" onClick={() => { setShowActionsMenu(false); clearChat(); }}>
                                        <Trash2 size={14} color={theme.textMuted} />
                                        <span>Clear chat</span>
                                        <span className="action-hint">local history only</span>
                                    </button>
                                )}
                                <button className="action-item danger" onClick={() => { setShowActionsMenu(false); deleteAllConversations(); }}>
                                    <Trash size={14} />
                                    <span>Clear all on meta.ai</span>
                                    <span className="action-hint">wipe every convo</span>
                                </button>
                                <div className="action-sep" />
                                <button className="action-item" onClick={() => { setShowActionsMenu(false); setShowKiloSetup(!showKiloSetup); }}>
                                    <Settings2 size={14} color={theme.textMain} />
                                    <span>{showKiloSetup ? 'Close setup' : 'Cookie setup'}</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {showCookieMenu && (
                        <div className="cookie-menu">
                            <div className="cookie-menu-title">
                                <KeyRound size={14} /> Meta.ai cookies (stored in IndexedDB)
                                <button className="cookie-menu-close" onClick={() => setShowCookieMenu(false)} title="Close">
                                    <X size={12} />
                                </button>
                            </div>
                            {cookieMap ? (
                                <div className="cookie-active">
                                    <Check size={12} /> Active: {Object.keys(cookieMap).join(', ')}
                                </div>
                            ) : (
                                <div className="cookie-empty">No cookies saved yet — paste them below.</div>
                            )}
                            <textarea
                                value={cookiePaste}
                                onChange={(e) => setCookiePaste(e.target.value)}
                                placeholder={'Paste .meta.ai cookies (Facebook OR Instagram login) — JSON, browser export, or "name=value; ..."'}
                                rows={5}
                                className="cookie-textarea custom-scrollbar"
                            />
                            <div className="cookie-menu-actions">
                                <button className="cookie-btn primary" onClick={saveCookiesFromPaste} disabled={cookieBusy || !cookiePaste.trim()}
                                    title="Verify and save these cookies to this browser">
                                    <Plus size={12} /> {cookieBusy ? 'Testing…' : 'Create / Save'}
                                </button>
                                <button className="cookie-btn" onClick={() => window.open('https://www.meta.ai/', '_blank', 'noopener,width=900,height=720')}
                                    title="Open meta.ai in a new tab — if you see the chatbox (not the login screen), your cookies are alive">
                                    <KeyRound size={12} /> Verify login
                                </button>
                                <button className="cookie-btn warn" onClick={eraseCookies} disabled={cookieBusy || !cookieMap}
                                    title="Erase saved cookies from this browser only">
                                    <Eraser size={12} /> Remove cookies
                                </button>
                                <button className="cookie-btn danger" onClick={deleteAllConversations} disabled={cookieBusy || !cookieMap}
                                    title="Wipe ALL conversations on your meta.ai account">
                                    <Trash size={12} /> Clear all conversations
                                </button>
                            </div>
                            <p className="cookie-hint">
                                Login flows: <b>Facebook</b> needs <code>abra_sess</code> (+ optionally <code>c_user</code>, <code>xs</code>). <b>Instagram</b> needs <code>abra_sess</code> on <code>.meta.ai</code> after clicking <i>Continue with Instagram</i> (+ optionally <code>i_user</code>, <code>sessionid</code>). The 5 anonymous cookies (<code>datr</code>, <code>dpr</code>, <code>ecto_1_sess</code>, <code>rd_challenge</code>, <code>wd</code>) alone are NOT enough — they're set even when logged out. Cookies are stored only in this browser's IndexedDB.
                            </p>
                        </div>
                    )}

                    {showProviderMenu && (
                        <div className="cookie-menu">
                            <div className="cookie-menu-title">
                                <Sparkles size={14} /> Pick an AI provider
                                <button className="cookie-menu-close" onClick={() => setShowProviderMenu(false)} title="Close">
                                    <X size={12} />
                                </button>
                            </div>
                            <div className="provider-grid">
                                {(['meta','deep','hez','pixe'] as Provider[]).map(p => (
                                    <button
                                        key={p}
                                        className={`provider-pick ${provider === p ? 'active' : ''}`}
                                        onClick={() => {
                                            setProvider(p);
                                            toast.success(`Switched to ${PROVIDER_LABEL[p]}`);
                                            if (p !== 'hez') setShowProviderMenu(false);
                                        }}
                                        title={PROVIDER_LABEL[p]}>
                                        <span className="provider-name">{PROVIDER_LABEL[p]}</span>
                                        <span className="provider-sub">
                                            {p === 'meta' && 'meta.ai · cookies needed'}
                                            {p === 'deep' && 'DeepAI · free, no auth'}
                                            {p === 'hez' && 'chat.z.ai · token needed'}
                                            {p === 'pixe' && 'Perplexity · cookies optional'}
                                        </span>
                                    </button>
                                ))}
                            </div>
                            {provider === 'hez' && (
                                <div className="form-group" style={{ gap: 6 }}>
                                    <label>chat.z.ai token</label>
                                    <input
                                        type="password"
                                        value={hezToken}
                                        onChange={(e) => setHezToken(e.target.value)}
                                        placeholder="Paste your token (stored in IndexedDB only)"
                                    />
                                </div>
                            )}
                            <p className="cookie-hint">Provider choice is stored in this browser only. Switching providers does NOT touch your meta.ai conversation.</p>
                        </div>
                    )}

                    {showKiloSetup && (
                        <ExoSetupPanel
                            theme={theme}
                            kiloProvider={kiloProvider}
                            kiloModel={kiloModel}
                            kiloKey={kiloKey}
                            onProviderChange={(p) => { setKiloProvider(p); setKiloModel(''); }}
                            onModelChange={setKiloModel}
                            onKeyChange={setKiloKey}
                            onSave={saveKiloConfig}
                            onRemove={removeKiloConfig}
                        />
                    )}

                    <div className="ai-chat-area custom-scrollbar" style={{ display: showKiloSetup ? 'none' : 'flex' }}>
                    {messages.length === 0 && (
                        <div className="empty-chat-state">
                        <Zap size={32} />
                        <p>Ask Meta AI to write, analyze, or manage code.</p>
                        <span className="hint-text">💡 Try: "Create an Express API", "/image a red apple", or "Install lodash"</span>
                        </div>
                    )}
                    {messages.map((msg) => (
                        <ChatMessage
                            key={msg.id}
                            msg={msg}
                            onToggleActionOutput={toggleActionOutput}
                            onOpenFile={openFileInEditor}
                            onConfirmOverwrite={confirmOverwrite}
                        />
                    ))}
                    <div ref={messagesEndRef} />
                    </div>

                    <div className="ai-input-area" style={{ display: (showKiloSetup || showRestSetup) ? 'none' : 'block' }}>
                    <div className={`input-wrapper ${aiMode}`}>
                    <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder={provider === 'meta' ? `Message Meta AI (${sessionMode})...` : `Message ${PROVIDER_LABEL[provider]}...`} className="custom-scrollbar" />
                    <button onClick={handleSend} disabled={(aiMode !== 'rest' && !isConnected) || !input.trim() || messages[messages.length - 1]?.isGenerating}>
                    <Send size={16} />
                    </button>
                    </div>
                    </div>

                    <style>{`
                        .exo-ai-pane { display: flex; flex-direction: column; height: 100%; background: ${theme.surface}; color: ${theme.textMain}; font-family: 'Inter', sans-serif; position: relative; }

                        /* ===== HEADER — 2026 clean redesign ===== */
                        .ai-header {
                            position: relative;
                            display: flex; flex-direction: column; gap: 10px;
                            padding: 12px 14px 10px;
                            border-bottom: 1px solid ${theme.border};
                            background:
                                linear-gradient(180deg, rgba(168,85,247,0.06), rgba(0,132,255,0.03) 50%, transparent 100%),
                                rgba(255,255,255,0.015);
                            backdrop-filter: blur(14px);
                            -webkit-backdrop-filter: blur(14px);
                        }
                        .ai-header-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
                        .brand-row { justify-content: space-between; }

                        /* Brand cluster */
                        .meta-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
                        .meta-brand .brand-dot {
                            width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
                            background: conic-gradient(from 0deg, #0084ff, #a855f7, #ec4899, #0084ff);
                            box-shadow: 0 0 12px rgba(168,85,247,0.55), 0 0 24px rgba(0,132,255,0.25);
                            animation: brand-spin 6s linear infinite;
                        }
                        @keyframes brand-spin { to { transform: rotate(360deg); } }
                        .brand-stack { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
                        .brand-name {
                            font-size: 13px; font-weight: 700; letter-spacing: -0.1px; line-height: 1.1;
                            background: linear-gradient(135deg, #fff 0%, #c084fc 60%, #0084ff 100%);
                            -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
                        }
                        .brand-sub {
                            display: inline-flex; align-items: center; gap: 5px;
                            font-size: 10px; font-weight: 500; color: ${theme.textMuted}; letter-spacing: 0.1px;
                            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                        }
                        .status-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
                        .status-dot.ok { background: #2ecc71; box-shadow: 0 0 6px rgba(46,204,113,0.7); }
                        .status-dot.warn { background: #f1c40f; box-shadow: 0 0 6px rgba(241,196,15,0.6); }
                        .status-dot.online { background: #00e676; box-shadow: 0 0 8px #00e676; }
                        .status-dot.offline { background: #ff5555; }

                        /* Brand-row right side: chips + overflow */
                        .brand-actions { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; }

                        /* Generic chip (cookies / create) */
                        .chip {
                            display: inline-flex; align-items: center; gap: 5px;
                            height: 30px; padding: 0 10px;
                            border-radius: 999px;
                            font-size: 11px; font-weight: 600; letter-spacing: 0.1px;
                            background: rgba(255,255,255,0.04);
                            color: ${theme.textMain};
                            border: 1px solid ${theme.border};
                            cursor: pointer; transition: all 0.18s ease;
                            white-space: nowrap;
                        }
                        .chip:hover:not(:disabled) { background: rgba(255,255,255,0.08); transform: translateY(-1px); }
                        .chip:active:not(:disabled) { transform: translateY(0); }
                        .chip:disabled { opacity: 0.4; cursor: not-allowed; }
                        .chip .chip-label { font-size: 11px; }

                        .cookie-chip.ok { color: #6ee7b7; background: rgba(16,185,129,0.10); border-color: rgba(16,185,129,0.35); }
                        .cookie-chip.warn { color: #fcd34d; background: rgba(245,158,11,0.10); border-color: rgba(245,158,11,0.40); }
                        .create-chip { color: #c4b5fd; background: linear-gradient(135deg, rgba(168,85,247,0.10), rgba(236,72,153,0.08)); border-color: rgba(168,85,247,0.40); }
                        .create-chip:hover:not(:disabled) { background: linear-gradient(135deg, rgba(168,85,247,0.18), rgba(236,72,153,0.14)); }
                        .create-chip.pinned { color: #6ee7b7; background: rgba(16,185,129,0.10); border-color: rgba(16,185,129,0.40); }
                        .create-chip.pinned:hover:not(:disabled) { background: rgba(16,185,129,0.18); }
                        .provider-chip { color: #fde68a; background: rgba(245,158,11,0.10); border-color: rgba(245,158,11,0.35); }
                        .provider-chip:hover:not(:disabled) { background: rgba(245,158,11,0.18); }
                        .provider-chip.deep { color: #93c5fd; background: rgba(59,130,246,0.10); border-color: rgba(59,130,246,0.35); }
                        .provider-chip.hez  { color: #f9a8d4; background: rgba(236,72,153,0.10); border-color: rgba(236,72,153,0.35); }
                        .provider-chip.pixe { color: #6ee7b7; background: rgba(16,185,129,0.10); border-color: rgba(16,185,129,0.35); }
                        .provider-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
                        .provider-pick { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 8px 10px; background: rgba(255,255,255,0.04); border: 1px solid ${theme.border}; border-radius: 8px; color: ${theme.textMain}; cursor: pointer; transition: 0.15s; text-align: left; }
                        .provider-pick:hover { background: rgba(255,255,255,0.08); }
                        .provider-pick.active { border-color: ${theme.accent}; background: rgba(0,161,255,0.08); }
                        .provider-name { font-size: 12px; font-weight: 700; }
                        .provider-sub { font-size: 10px; color: ${theme.textMuted}; opacity: 0.85; }

                        /* Overflow menu trigger */
                        .icon-only-btn {
                            display: inline-flex; align-items: center; justify-content: center;
                            width: 30px; height: 30px;
                            background: rgba(255,255,255,0.04);
                            border: 1px solid ${theme.border};
                            border-radius: 999px;
                            color: ${theme.textMain};
                            cursor: pointer; transition: all 0.18s ease;
                        }
                        .icon-only-btn:hover { background: rgba(255,255,255,0.10); }
                        .icon-only-btn.open { background: rgba(0,132,255,0.15); border-color: rgba(0,132,255,0.45); color: #60a5fa; }

                        /* Mode segmented control (Fast / Thinking) — full row */
                        .mode-row { padding-top: 2px; }
                        .mode-switch {
                            display: inline-flex; flex: 1 1 auto;
                            background: rgba(0,0,0,0.28);
                            border: 1px solid ${theme.border};
                            border-radius: 999px;
                            padding: 3px; gap: 2px;
                            position: relative;
                        }
                        .mode-switch-btn {
                            flex: 1 1 0; min-width: 0;
                            display: inline-flex; align-items: center; justify-content: center; gap: 6px;
                            background: transparent; border: none;
                            color: ${theme.textMuted};
                            font-size: 11px; font-weight: 600; letter-spacing: 0.2px;
                            padding: 7px 12px; border-radius: 999px;
                            cursor: pointer; transition: all 0.2s ease;
                            white-space: nowrap;
                        }
                        .mode-switch-btn:hover:not(:disabled):not(.active) { color: ${theme.textMain}; background: rgba(255,255,255,0.05); }
                        .mode-switch-btn.active.fast { background: linear-gradient(135deg, #38bdf8, #0084ff); color: #fff; box-shadow: 0 4px 14px rgba(0,132,255,0.35), inset 0 1px 0 rgba(255,255,255,0.2); }
                        .mode-switch-btn.active.thinking { background: linear-gradient(135deg, #a855f7, #ec4899); color: #fff; box-shadow: 0 4px 14px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.2); }
                        .mode-switch-btn:disabled { opacity: 0.45; cursor: not-allowed; }

                        /* Actions overflow popover */
                        .actions-menu {
                            position: absolute; top: calc(100% - 6px); right: 14px; z-index: 50;
                            min-width: 240px; max-width: calc(100vw - 28px);
                            display: flex; flex-direction: column; gap: 2px;
                            padding: 6px;
                            background: rgba(18, 20, 28, 0.98);
                            border: 1px solid ${theme.border};
                            border-radius: 12px;
                            box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.02);
                            backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
                            animation: actions-pop 0.16s ease-out;
                        }
                        @keyframes actions-pop { from { opacity: 0; transform: translateY(-4px) scale(0.98); } to { opacity: 1; transform: none; } }
                        .action-item {
                            display: flex; align-items: center; gap: 10px;
                            padding: 9px 10px; border-radius: 8px;
                            background: transparent; border: none; cursor: pointer;
                            color: ${theme.textMain};
                            font-size: 12px; font-weight: 500; text-align: left;
                            transition: background 0.12s ease;
                            width: 100%;
                        }
                        .action-item:hover:not(:disabled) { background: rgba(255,255,255,0.06); }
                        .action-item:disabled { opacity: 0.4; cursor: not-allowed; }
                        .action-item span:nth-of-type(1) { flex: 1 1 auto; }
                        .action-item .action-hint { font-size: 10px; color: ${theme.textMuted}; opacity: 0.7; font-weight: 400; flex: 0 0 auto; }
                        .action-item.danger { color: #ff8888; }
                        .action-item.danger:hover:not(:disabled) { background: rgba(255,80,80,0.12); }
                        .action-sep { height: 1px; background: ${theme.border}; margin: 4px 2px; }

                        /* Mobile tweaks */
                        @media (max-width: 520px) {
                            .ai-header { padding: 10px 12px 8px; }
                            .chip .chip-label { display: none; }
                            .chip { padding: 0 8px; width: 30px; justify-content: center; }
                            .brand-name { font-size: 12px; }
                            .brand-sub { font-size: 9px; }
                            .mode-switch-btn { font-size: 10px; padding: 7px 8px; }
                            .actions-menu { right: 8px; left: 8px; min-width: 0; }
                        }
                        .cookie-menu { background: rgba(0,0,0,0.35); border: 1px solid ${theme.border}; border-radius: 8px; padding: 10px 12px; margin: 6px 10px; display: flex; flex-direction: column; gap: 8px; }
                        .cookie-menu-title { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: ${theme.textMain}; }
                        .cookie-menu-close { margin-left: auto; background: transparent; border: none; color: ${theme.textMuted}; cursor: pointer; padding: 2px; display: inline-flex; }
                        .cookie-menu-close:hover { color: #ff7777; }
                        .cookie-active { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #2ecc71; background: rgba(46,204,113,0.08); border: 1px solid rgba(46,204,113,0.25); padding: 4px 8px; border-radius: 6px; }
                        .cookie-empty { font-size: 11px; color: ${theme.textMuted}; opacity: 0.8; }
                        .cookie-textarea { width: 100%; font-family: monospace; font-size: 11px; padding: 8px; border-radius: 6px; background: rgba(0,0,0,0.3); color: #ddd; border: 1px solid ${theme.border}; resize: vertical; }
                        .cookie-menu-actions { display: flex; flex-wrap: wrap; gap: 6px; }
                        .cookie-btn { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; padding: 6px 10px; border-radius: 6px; background: rgba(255,255,255,0.06); color: ${theme.textMain}; border: 1px solid ${theme.border}; cursor: pointer; transition: 0.15s; }
                        .cookie-btn:hover:not(:disabled) { background: rgba(255,255,255,0.12); }
                        .cookie-btn:disabled { opacity: 0.4; cursor: not-allowed; }
                        .cookie-btn.primary { background: ${theme.accent}; color: #000; border-color: ${theme.accent}; }
                        .cookie-btn.primary:hover:not(:disabled) { filter: brightness(1.1); }
                        .cookie-btn.warn { background: rgba(241,196,15,0.1); color: #f1c40f; border-color: rgba(241,196,15,0.35); }
                        .cookie-btn.warn:hover:not(:disabled) { background: rgba(241,196,15,0.18); }
                        .cookie-btn.danger { background: rgba(255,80,80,0.12); color: #ff7777; border-color: rgba(255,80,80,0.4); }
                        .cookie-btn.danger:hover:not(:disabled) { background: rgba(255,80,80,0.2); }
                        .cookie-hint { font-size: 10px; color: ${theme.textMuted}; opacity: 0.75; margin: 0; }
                        .meta-brand .convo-id { font-family: monospace; font-size: 10px; color: ${theme.textMuted}; opacity: 0.7; }
                        .icon-btn:disabled { opacity: 0.35; cursor: not-allowed; }
                        .status-badge { display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 600; padding: 4px 8px; background: rgba(0, 161, 255, 0.1); color: ${theme.accent}; border-radius: 4px; border: 1px solid rgba(0, 161, 255, 0.2); }
                        .status-dot { width: 6px; height: 6px; border-radius: 50%; }
                        .status-dot.online { background: #00e676; box-shadow: 0 0 8px #00e676; }
                        .status-dot.offline { background: #ff5555; }
                        .icon-btn { background: none; border: none; cursor: pointer; padding: 6px; border-radius: 4px; transition: 0.2s; display: flex; align-items: center; justify-content: center; }
                        .icon-btn:hover { background: rgba(255,255,255,0.1); }
                        .clear-btn:hover { background: rgba(255,85,85,0.1) !important; }
                        .clear-btn:hover svg { stroke: #ff5555 !important; }

                        /* SETUP PANELS */
                        .setup-panel { flex: 1; padding: 24px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
                        .setup-title { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 800; color: ${theme.textMain}; }
                        .setup-desc { font-size: 12px; color: ${theme.textMuted}; line-height: 1.5; margin-bottom: 5px; }
                        .form-group { display: flex; flex-direction: column; gap: 8px; }
                        .form-group label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: ${theme.textMuted}; }
                        .form-group select, .form-group input { background: ${theme.bg}; border: 1px solid ${theme.border}; color: ${theme.textMain}; padding: 10px 12px; border-radius: 6px; font-size: 13px; outline: none; transition: 0.2s; }
                        .form-group select:focus, .form-group input:focus { border-color: ${theme.accent}; }
                        .form-group .hint { font-size: 10px; color: ${theme.textMuted}; opacity: 0.8; margin-top: -4px;}

                        .setup-actions { display: flex; gap: 10px; margin-top: 10px; }
                        .save-btn { flex: 1; background: ${theme.accent}; color: #000; font-weight: 700; font-size: 12px; padding: 12px; border: none; border-radius: 6px; cursor: pointer; transition: 0.2s; }
                        .secondary-btn { flex: 1; background: rgba(255,255,255,0.05); color: ${theme.textMain}; border: 1px solid ${theme.border}; font-weight: 600; font-size: 12px; padding: 12px; border-radius: 6px; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px;}
                        .secondary-btn:hover { background: rgba(255,255,255,0.1); }
                        .remove-btn { background: rgba(255, 85, 85, 0.1); border: 1px solid rgba(255, 85, 85, 0.3); color: #ff5555; padding: 0 15px; border-radius: 6px; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; }
                        .remove-btn:hover { background: #ff5555; color: #fff; }

                        /* PRESETS LIST */
                        .preset-row { display: flex; gap: 8px; align-items: center; }
                        .preset-row select { flex: 1; }
                        .manage-presets { display: flex; flex-direction: column; gap: 6px; background: rgba(0,0,0,0.1); padding: 10px; border-radius: 6px; border: 1px dashed ${theme.border}; margin-top: 10px; }
                        .preset-item { display: flex; justify-content: space-between; align-items: center; font-size: 12px; padding: 6px 10px; background: rgba(255,255,255,0.03); border-radius: 4px; border: 1px solid rgba(255,255,255,0.05); }
                        .preset-item button { background: none; border: none; color: #ff5555; cursor: pointer; padding: 4px; border-radius: 4px; display: flex; align-items: center; justify-content: center; }
                        .preset-item button:hover { background: rgba(255,85,85,0.2); }

                        /* CHAT AREA */
                        .ai-chat-area { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; }
                        .empty-chat-state { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0.4; gap: 12px; text-align: center; font-size: 12px; font-weight: 500; }
                        .hint-text { font-style: italic; opacity: 0.7; margin-top: 10px; background: rgba(255,255,255,0.05); padding: 6px 12px; border-radius: 20px; }
                        .chat-bubble-wrapper { display: flex; gap: 10px; align-items: flex-start; max-width: 100%; }
                        .chat-bubble-wrapper.user { flex-direction: row-reverse; }
                        .avatar.ai { width: 26px; height: 26px; border-radius: 6px; border: 1px solid ${theme.border}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
                        .avatar.ai.exocore { background: ${theme.bg}; color: ${theme.accent}; }
                        .avatar.ai.kilo { background: linear-gradient(135deg, #a855f7, #ec4899); color: #fff; border: none; }
                        .avatar.ai.rest { background: linear-gradient(135deg, #0ea5e9, #10b981); color: #fff; border: none; }
                        .chat-bubble { display: flex; flex-direction: column; gap: 8px; max-width: 85%; width: 100%; }
                        .user .chat-bubble { background: ${theme.accent}; color: #000; padding: 10px 14px; border-radius: 12px 12px 0 12px; font-size: 13px; font-weight: 500; width: auto; }
                        .text-content.ai-text { font-size: 13px; line-height: 1.5; color: ${theme.textMain}; opacity: 0.9; white-space: pre-wrap; }
                        .loading-text { display: flex; align-items: center; gap: 8px; opacity: 0.6; font-style: italic; }

                        /* ENGINE LOGS */
                        .terminal-thinking { background: #050505; border: 1px solid #222; border-radius: 8px; overflow: hidden; width: 100%; font-family: 'JetBrains Mono', monospace; }
                        .terminal-thinking .term-header { display: flex; align-items: center; gap: 6px; padding: 6px 12px; background: #111; font-size: 10px; color: #666; border-bottom: 1px solid #222; }
                        .terminal-thinking .term-body { padding: 10px 12px; font-size: 11px; max-height: 150px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
                        .term-line { color: #aaa; display: flex; align-items: flex-start; gap: 6px; }
                        .term-line .prompt { color: ${theme.accent}; font-weight: bold; }

                        /* ACTIONS LIST */
                        .generated-actions-list { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }

                        /* IMAGE GRID (from /image endpoint) */
                        .generated-image-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; margin-top: 6px; }
                        .img-tile { position: relative; display: block; border-radius: 8px; overflow: hidden; border: 1px solid ${theme.border}; background: rgba(0,0,0,0.2); aspect-ratio: 1/1; }
                        .img-tile img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.2s; }
                        .img-tile:hover img { transform: scale(1.04); }
                        .img-badge { position: absolute; top: 6px; left: 6px; display: flex; align-items: center; gap: 4px; background: rgba(0,0,0,0.6); color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 4px; }

                        /* NORMAL FILE ACTIONS */
                        .action-item { display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 6px; padding: 8px 12px; }
                        .action-info { display: flex; align-items: center; gap: 8px; font-family: 'JetBrains Mono', monospace; font-size: 12px; opacity: 0.9; }
                        .action-status { display: flex; align-items: center; }
                        .action-item.file_delete { background: rgba(255, 85, 85, 0.05); border-color: rgba(255, 85, 85, 0.1); }
                        .action-item.file_delete .path { text-decoration: line-through; color: #ff5555; opacity: 0.8; }
                        .del-badge { font-size: 9px; background: #ff5555; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold; }

                        /* REPLIT STYLE TERMINAL BLOCK */
                        .replit-terminal-box { background: #0E1117; border: 1px solid #30363D; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                        .replit-terminal-box .term-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: #161B22; border-bottom: 1px solid #30363D; cursor: pointer; transition: 0.2s; }
                        .replit-terminal-box .term-header:hover { background: #1C2128; }
                        .term-left { display: flex; align-items: center; gap: 8px; }
                        .cmd-text { font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 600; color: #E6EDF3; }
                        .term-right { display: flex; align-items: center; gap: 8px; }
                        .chevron { color: #8B949E; display: flex; align-items: center; }
                        .term-output { padding: 12px; background: #0D1117; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #C9D1D9; white-space: pre-wrap; word-break: break-all; max-height: 250px; overflow-y: auto; line-height: 1.5; }

                        /* AGENT ACTION CARDS (cute terminal/file blocks) */
                        .agent-action-list { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
                        .agent-action-card { background: #0E1117; border: 1px solid #30363D; border-radius: 8px; overflow: hidden; }
                        .agent-action-card.failed { border-color: rgba(255, 85, 85, 0.4); }
                        .agent-action-card.awaiting_confirm { border-color: rgba(255, 184, 108, 0.5); }
                        .agent-action-card.skipped { opacity: 0.6; }
                        .agent-action-head { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #161B22; transition: 0.2s; }
                        .agent-action-head:hover { background: #1C2128; }
                        .head-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
                        .head-icon { display: flex; align-items: center; flex-shrink: 0; }
                        .head-title { font-size: 12px; font-weight: 600; color: #E6EDF3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                        .head-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
                        .head-status { display: flex; align-items: center; }
                        .open-file-btn { display: flex; align-items: center; gap: 4px; background: rgba(88, 166, 255, 0.12); color: #58a6ff; border: 1px solid rgba(88, 166, 255, 0.3); border-radius: 4px; font-size: 10px; padding: 3px 7px; cursor: pointer; transition: 0.2s; }
                        .open-file-btn:hover { background: rgba(88, 166, 255, 0.25); }

                        .agent-action-cmdline { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: #0D1117; border-top: 1px solid #21262D; font-family: 'JetBrains Mono', monospace; font-size: 11px; }
                        .agent-action-cmdline .cmd-label { color: #8B949E; font-weight: 600; flex-shrink: 0; }
                        .agent-action-cmdline code { color: #C9D1D9; background: transparent; word-break: break-all; }

                        .agent-action-body { padding: 10px 12px; background: #0D1117; border-top: 1px solid #21262D; max-height: 280px; overflow-y: auto; }
                        .agent-action-body .logs-divider { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #6E7681; margin-bottom: 6px; letter-spacing: 0.5px; }
                        .agent-action-body pre { margin: 0; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #C9D1D9; white-space: pre-wrap; word-break: break-word; line-height: 1.5; }

                        /* DIFF VIEW (file_edit) — only show changed lines, no full file */
                        .diff-view { font-family: 'JetBrains Mono', monospace; font-size: 11px; line-height: 1.55; }
                        .diff-line { display: flex; gap: 6px; padding: 0 4px; border-radius: 2px; }
                        .diff-line.del { background: rgba(255, 85, 85, 0.10); color: #ffb3b3; }
                        .diff-line.add { background: rgba(0, 230, 118, 0.10); color: #b8f5d0; }
                        .diff-marker { color: #6E7681; flex-shrink: 0; width: 10px; text-align: center; user-select: none; }
                        .diff-line.del .diff-marker { color: #ff6b6b; }
                        .diff-line.add .diff-marker { color: #00e676; }
                        .diff-text { white-space: pre-wrap; word-break: break-word; flex: 1; }

                        .agent-confirm-box { padding: 10px 12px; background: rgba(255, 184, 108, 0.06); border-top: 1px solid rgba(255, 184, 108, 0.25); display: flex; flex-direction: column; gap: 8px; }
                        .agent-confirm-box .confirm-msg { font-size: 12px; color: #E6EDF3; }
                        .agent-confirm-box .confirm-msg strong { color: #ffb86c; font-family: 'JetBrains Mono', monospace; font-size: 11px; }
                        .agent-confirm-box .confirm-actions { display: flex; gap: 6px; }
                        .confirm-btn { font-size: 11px; font-weight: 600; padding: 6px 12px; border-radius: 5px; cursor: pointer; transition: 0.2s; border: 1px solid transparent; }
                        .confirm-btn.yes { background: ${theme.accent}; color: #000; }
                        .confirm-btn.yes:hover { filter: brightness(1.1); }
                        .confirm-btn.no { background: transparent; color: #C9D1D9; border-color: #30363D; }
                        .confirm-btn.no:hover { background: rgba(255,255,255,0.05); }

                        .agent-steps { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; padding: 8px 10px; background: rgba(255,255,255,0.02); border: 1px dashed ${theme.border}; border-radius: 6px; }
                        .agent-step-line { display: flex; align-items: center; gap: 6px; font-size: 11px; color: ${theme.textMuted}; font-style: italic; }
                        .spin { animation: spin 1s linear infinite; }
                        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

                        @media (max-width: 768px) {
                            .cmd-text { font-size: 12px; }
                            .term-output { font-size: 11px; padding: 10px; max-height: 200px; }
                            .chat-bubble { max-width: 95%; }
                            .action-info { font-size: 11px; }
                            .head-title { font-size: 11px; }
                            .agent-action-body pre { font-size: 10px; }
                        }

                        /* INPUT AREA */
                        .ai-input-area { padding: 12px 16px; border-top: 1px solid ${theme.border}; background: ${theme.bg}; }
                        .input-wrapper { display: flex; align-items: flex-end; gap: 8px; background: ${theme.surface}; border: 1px solid ${theme.border}; border-radius: 12px; padding: 8px; transition: 0.2s; }
                        .input-wrapper.exocore:focus-within { border-color: ${theme.accent}; box-shadow: 0 0 0 2px rgba(0, 161, 255, 0.2); }
                        .input-wrapper.kilo:focus-within { border-color: #a855f7; box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.2); }
                        .input-wrapper.rest:focus-within { border-color: #0ea5e9; box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.2); }
                        .input-wrapper textarea { flex: 1; background: transparent; border: none; color: ${theme.textMain}; font-size: 13px; outline: none; resize: none; max-height: 120px; min-height: 40px; padding: 4px; }
                        .input-wrapper button { background: ${theme.accent}; color: #000; border: none; width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s; }
                        .input-wrapper.kilo button { background: linear-gradient(135deg, #a855f7, #ec4899); color: #fff; }
                        .input-wrapper.rest button { background: linear-gradient(135deg, #0ea5e9, #10b981); color: #fff; }
                        .input-wrapper button:disabled { opacity: 0.5; cursor: not-allowed; }
                        `}</style>
                        </div>
                );
};
