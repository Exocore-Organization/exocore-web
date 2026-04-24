import { useState, useEffect, useRef, useCallback } from 'react';
import { parse } from '@babel/parser';
import { checkSource } from './tsChecker';
import { muxCarrier } from '../access/wsMux';

export interface Diagnostic {
    line: number;
    column: number;
    /** length of the underlined span (chars) — used for inline squiggles */
    length?: number;
    /** end position for multi-line spans (1-indexed line, 0-indexed col) */
    endLine?: number;
    endColumn?: number;
    message: string;
    severity: 'error' | 'warning' | 'info';
    code?: number;
    source?: string;
}

/* ─── JS/JSX static analysis (Babel) ──────────────────────────────────── */

const GLOBALS = new Set([
    'console','require','module','process','__dirname','__filename',
    'exports','window','document','setTimeout','setInterval','clearTimeout',
    'clearInterval','clearImmediate','setImmediate','http','https','fs','path',
    'os','Promise','JSON','Math','Date','Array','Object','String','Number',
    'Boolean','Error','Map','Set','Symbol','fetch','URL','URLSearchParams',
    'Buffer','global','globalThis','React','undefined','null','NaN','Infinity',
    'parseInt','parseFloat','isNaN','isFinite','encodeURIComponent',
    'decodeURIComponent','queueMicrotask','structuredClone','crypto',
    'performance','AbortController','AbortSignal','FormData','Headers',
    'Request','Response','ReadableStream','WritableStream','TextEncoder',
    'TextDecoder','EventTarget','Event','CustomEvent','MessageChannel',
    'MessagePort','Worker','SharedArrayBuffer','Atomics','Proxy','Reflect',
    'WeakMap','WeakSet','WeakRef','FinalizationRegistry','Iterator',
    'AsyncIterator','Generator','AsyncGenerator','RegExp','Function',
    'arguments','eval','TypeError','RangeError','SyntaxError','ReferenceError',
    'URIError','EvalError','AggregateError',
    'app','express','router','req','res','next','err','db','io',
    '__esModule','default',
]);

type DeclMap = Map<string, { line: number; col: number; type: string }>;
type RefList  = Array<{ name: string; line: number; col: number }>;

function walkPattern(n: any, d: DeclMap, r: RefList, e: Diagnostic[], w: (n:any)=>void) {
    if (!n) return;
    if (n.type === 'Identifier') { d.set(n.name, { line: n.loc.start.line, col: n.loc.start.column, type: 'var' }); }
    else if (n.type === 'ObjectPattern') n.properties?.forEach((p: any) => p.type === 'RestElement' ? walkPattern(p.argument,d,r,e,w) : walkPattern(p.value,d,r,e,w));
    else if (n.type === 'ArrayPattern')  n.elements?.forEach((el: any) => el && walkPattern(el,d,r,e,w));
    else if (n.type === 'AssignmentPattern') { walkPattern(n.left,d,r,e,w); w(n.right); }
    else if (n.type === 'RestElement')   walkPattern(n.argument,d,r,e,w);
    else if (n.type === 'ObjectProperty') walkPattern(n.value,d,r,e,w);
}

function walkNode(node: any, declared: DeclMap, refs: RefList, errors: Diagnostic[]): void {
    if (!node || typeof node !== 'object') return;
    const w = (n: any) => walkNode(n, declared, refs, errors);
    const wp = (n: any) => walkPattern(n, declared, refs, errors, w);
    switch (node.type) {
        case 'File': w(node.program); break;
        case 'Program': node.body?.forEach(w); break;
        case 'VariableDeclaration':
            if (node.kind === 'var') errors.push({ line: node.loc.start.line, column: node.loc.start.column, message: `Avoid 'var' — use 'let' or 'const' instead.`, severity: 'warning' });
            node.declarations?.forEach(w); break;
        case 'VariableDeclarator': wp(node.id); w(node.init); break;
        case 'FunctionDeclaration': case 'FunctionExpression':
            if (node.id) declared.set(node.id.name, { line: node.id.loc.start.line, col: node.id.loc.start.column, type: 'function' });
            node.params?.forEach(wp); w(node.body); break;
        case 'ArrowFunctionExpression': node.params?.forEach(wp); w(node.body); break;
        case 'ClassDeclaration': case 'ClassExpression':
            if (node.id) declared.set(node.id.name, { line: node.id.loc.start.line, col: node.id.loc.start.column, type: 'class' });
            w(node.superClass); w(node.body); break;
        case 'ClassBody': node.body?.forEach(w); break;
        case 'ClassMethod': case 'ClassPrivateMethod': node.params?.forEach(wp); w(node.body); break;
        case 'ClassProperty': case 'ClassPrivateProperty': w(node.value); break;
        case 'ImportDeclaration':
            node.specifiers?.forEach((s: any) => { if (s.local?.type === 'Identifier') declared.set(s.local.name, { line: s.local.loc.start.line, col: s.local.loc.start.column, type: 'import' }); }); break;
        case 'ExportNamedDeclaration': w(node.declaration); node.specifiers?.forEach((s: any) => w(s.local)); break;
        case 'ExportDefaultDeclaration': w(node.declaration); break;
        case 'ExpressionStatement': w(node.expression); break;
        case 'ReturnStatement': case 'ThrowStatement': w(node.argument); break;
        case 'IfStatement': w(node.test); w(node.consequent); w(node.alternate); break;
        case 'BlockStatement': case 'TSModuleBlock': node.body?.forEach(w); break;
        case 'WhileStatement': case 'DoWhileStatement': w(node.test); w(node.body); break;
        case 'ForStatement': w(node.init); w(node.test); w(node.update); w(node.body); break;
        case 'ForInStatement': case 'ForOfStatement': w(node.left); w(node.right); w(node.body); break;
        case 'TryStatement': w(node.block); if (node.handler) { wp(node.handler.param); w(node.handler.body); } w(node.finalizer); break;
        case 'SwitchStatement': w(node.discriminant); node.cases?.forEach((c: any) => { w(c.test); c.consequent?.forEach(w); }); break;
        case 'LabeledStatement': w(node.body); break;
        case 'AssignmentExpression': w(node.left); w(node.right); break;
        case 'BinaryExpression': case 'LogicalExpression':
            if (node.operator === '==' || node.operator === '!=') errors.push({ line: node.loc.start.line, column: node.loc.start.column, message: `Use '${node.operator}=' for strict equality.`, severity: 'warning' });
            w(node.left); w(node.right); break;
        case 'UnaryExpression': case 'UpdateExpression': case 'SpreadElement': case 'RestElement': case 'AwaitExpression': case 'YieldExpression': w(node.argument); break;
        case 'ConditionalExpression': w(node.test); w(node.consequent); w(node.alternate); break;
        case 'CallExpression': case 'OptionalCallExpression': case 'NewExpression': w(node.callee); node.arguments?.forEach(w); break;
        case 'MemberExpression': case 'OptionalMemberExpression': w(node.object); if (node.computed) w(node.property); break;
        case 'ChainExpression': w(node.expression); break;
        case 'ObjectExpression': case 'ObjectPattern': node.properties?.forEach(w); break;
        case 'ObjectProperty': case 'Property':
            if (node.computed) w(node.key);
            if (node.shorthand && node.key?.type === 'Identifier') refs.push({ name: node.key.name, line: node.key.loc.start.line, col: node.key.loc.start.column });
            else w(node.value); break;
        case 'ArrayExpression': case 'ArrayPattern': node.elements?.forEach((el: any) => el && w(el)); break;
        case 'TemplateLiteral': node.expressions?.forEach(w); break;
        case 'TaggedTemplateExpression': w(node.tag); w(node.quasi); break;
        case 'SequenceExpression': node.expressions?.forEach(w); break;
        case 'AssignmentPattern': wp(node.left); w(node.right); break;
        case 'Identifier': refs.push({ name: node.name, line: node.loc.start.line, col: node.loc.start.column }); break;
        case 'JSXOpeningElement': node.attributes?.forEach(w); break;
        case 'JSXAttribute': w(node.value); break;
        case 'JSXExpressionContainer': case 'JSXSpreadChild': w(node.expression); break;
        case 'JSXElement': case 'JSXFragment': w(node.openingElement); node.children?.forEach(w); break;
        default: break;
    }
}

function analyzeJs(code: string, ext: string): Diagnostic[] {
    const errors: Diagnostic[] = [];
    const isJsx = ext === 'jsx';
    try {
        const ast = parse(code, {
            sourceType: 'module', strictMode: false,
            allowImportExportEverywhere: true, allowReturnOutsideFunction: true,
            errorRecovery: false,
            plugins: [
                ...(isJsx ? ['jsx' as const] : []),
                'decorators-legacy', 'classProperties', 'classPrivateProperties',
                'classPrivateMethods', 'dynamicImport', 'nullishCoalescingOperator',
                'optionalChaining', 'optionalCatchBinding', 'logicalAssignment',
                'numericSeparator', 'bigInt', 'importMeta', 'topLevelAwait',
            ],
        });
        const declared: DeclMap = new Map();
        const refs: RefList = [];
        walkNode(ast, declared, refs, errors);
        refs.forEach(ref => {
            const decl = declared.get(ref.name);
            if (!decl) {
                if (!GLOBALS.has(ref.name) && !/^[A-Z_$]/.test(ref.name))
                    errors.push({ line: ref.line, column: ref.col, message: `'${ref.name}' is not defined.`, severity: 'error' });
            }
        });
    } catch (err: any) {
        const loc = err.loc ?? err.location;
        if (loc) errors.push({ line: loc.line ?? 1, column: loc.column ?? 0, message: err.message?.replace(/\s*\(\d+:\d+\)$/, '') ?? 'Syntax error', severity: 'error' });
    }
    return errors;
}

/* ─── TypeScript LSP diagnostics via WebSocket ─────────────────────────── */

const SEV_MAP: Record<number, 'error' | 'warning' | 'info'> = {
    1: 'error',
    2: 'warning',
    3: 'info',
    4: 'info',
};

function getLspChannelPath(projectId: string): string {
    return `/exocore/api/editor/lsp/ts?projectId=${encodeURIComponent(projectId)}`;
}

// @ts-expect-error reserved
function lspUri(projectId: string, filePath: string): string {
    return `file:///workspace/${projectId}/${filePath}`;
}

interface LspMessage {
    jsonrpc: string;
    id?: number | string;
    method?: string;
    params?: unknown;
    result?: unknown;
    error?: unknown;
}

// @ts-expect-error reserved for direct LSP usage
class LspDiagnosticsClient {
    private ws: WebSocket | null = null;
    private msgId = 1;
    private projectId: string;
    private fileUri = '';
    // @ts-expect-error reserved
    private fileLangId = 'typescript';
    private pendingOpen: { content: string; langId: string } | null = null;
    private initialized = false;
    private initSent = false;
    private onDiagnostics: (diags: Diagnostic[]) => void;

    constructor(projectId: string, onDiagnostics: (diags: Diagnostic[]) => void) {
        this.projectId = projectId;
        this.onDiagnostics = onDiagnostics;
    }

    connect() {
        try {
            this.ws = muxCarrier.openChannelInstance("lsp", getLspChannelPath(this.projectId)) as unknown as WebSocket;
        } catch {
            return;
        }
        this.ws.onopen  = () => this.sendInit();
        this.ws.onmessage = (e) => {
            const text = typeof e.data === "string"
                ? e.data
                : new TextDecoder("utf-8").decode(new Uint8Array(e.data as ArrayBuffer));
            this.handleMessage(text);
        };
        this.ws.onerror = () => {};
        this.ws.onclose = () => {
            this.ws = null;
            this.initialized = false;
            this.initSent = false;
        };
    }

    disconnect() {
        if (this.ws) { try { this.ws.close(); } catch {} this.ws = null; }
        this.initialized = false;
        this.initSent = false;
    }

    private send(msg: LspMessage) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    private sendInit() {
        if (this.initSent) return;
        this.initSent = true;
        this.send({
            jsonrpc: '2.0',
            id: this.msgId++,
            method: 'initialize',
            params: {
                processId: null,
                rootUri: `file:///workspace/${this.projectId}`,
                initializationOptions: {
                    preferences: {
                        includeInlayParameterNameHints: 'none',
                        includeInlayVariableTypeHints: false,
                        includeCompletionsForModuleExports: false,
                    },
                },
                capabilities: {
                    textDocument: {
                        synchronization: {
                            dynamicRegistration: false,
                            willSave: false,
                            willSaveWaitUntil: false,
                            didSave: false,
                        },
                        publishDiagnostics: {
                            relatedInformation: true,
                            versionSupport: true,
                            codeDescriptionSupport: true,
                            dataSupport: true,
                        },
                        codeAction: {
                            dynamicRegistration: false,
                            codeActionLiteralSupport: {
                                codeActionKind: { valueSet: ['quickfix', 'refactor'] },
                            },
                        },
                    },
                    workspace: {
                        configuration: true,
                        workspaceFolders: true,
                        didChangeConfiguration: { dynamicRegistration: false },
                    },
                },
                workspaceFolders: [{
                    uri: `file:///workspace/${this.projectId}`,
                    name: this.projectId,
                }],
            },
        });
    }

    private handleMessage(raw: string) {
        let msg: LspMessage;
        try { msg = JSON.parse(raw); } catch { return; }

        /* ── Server → client request (has id + method) → MUST respond ── */
        if (msg.id !== undefined && msg.method) {
            switch (msg.method) {
                case 'workspace/configuration': {
                    const items = (msg.params as any)?.items ?? [];
                    const result = items.map((item: any) => {
                        const section = item.section ?? '';
                        if (section === 'typescript' || section === 'javascript') {
                            return {
                                suggest: { completeFunctionCalls: false },
                                format: { enable: false },
                                validate: { enable: true },
                                implementationsCodeLens: { enable: false },
                                referencesCodeLens: { enable: false },
                                updateImportsOnFileMove: { enabled: 'never' },
                            };
                        }
                        return {};
                    });
                    this.send({ jsonrpc: '2.0', id: msg.id, result });
                    break;
                }
                case 'client/registerCapability':
                case 'client/unregisterCapability':
                    this.send({ jsonrpc: '2.0', id: msg.id, result: null });
                    break;
                case 'workspace/applyEdit':
                    this.send({ jsonrpc: '2.0', id: msg.id, result: { applied: false } });
                    break;
                default:
                    this.send({ jsonrpc: '2.0', id: msg.id, result: null });
                    break;
            }
            return;
        }

        /* ── Server notification (no id, has method) ── */
        if (msg.id === undefined && msg.method) {
            if (msg.method === 'textDocument/publishDiagnostics') {
                const p = msg.params as any;
                if (p?.uri === this.fileUri) {
                    const diags: Diagnostic[] = (p.diagnostics ?? []).map((d: any) => ({
                        line:     (d.range?.start?.line ?? 0) + 1,
                        column:   d.range?.start?.character ?? 0,
                        message:  typeof d.message === 'string' ? d.message : JSON.stringify(d.message),
                        severity: SEV_MAP[d.severity ?? 1] ?? 'error',
                        code:     typeof d.code === 'number' ? d.code : undefined,
                        source:   d.source,
                    }));
                    this.onDiagnostics(diags);
                }
            }
            return;
        }

        /* ── Server response to our request (has id, no method) ── */
        if (msg.id !== undefined && !msg.method && msg.result !== undefined) {
            if (!this.initialized) {
                this.initialized = true;
                this.send({ jsonrpc: '2.0', method: 'initialized', params: {} });
                if (this.pendingOpen) {
                    const { content, langId } = this.pendingOpen;
                    this.pendingOpen = null;
                    this._doOpen(content, langId);
                }
            }
        }
    }

    private _doOpen(content: string, langId: string) {
        this.send({
            jsonrpc: '2.0',
            method: 'textDocument/didOpen',
            params: {
                textDocument: {
                    uri: this.fileUri,
                    languageId: langId,
                    version: 1,
                    text: content,
                },
            },
        });
    }

    openFile(uri: string, content: string, langId = 'typescript') {
        this.fileUri   = uri;
        this.fileLangId = langId;
        if (!this.initialized) {
            this.pendingOpen = { content, langId };
            return;
        }
        this._doOpen(content, langId);
    }

    changeFile(content: string, version: number) {
        if (!this.initialized || !this.fileUri) return;
        this.send({
            jsonrpc: '2.0',
            method: 'textDocument/didChange',
            params: {
                textDocument: { uri: this.fileUri, version },
                contentChanges: [{ text: content }],
            },
        });
    }

    closeFile() {
        if (!this.initialized || !this.fileUri) return;
        this.send({
            jsonrpc: '2.0',
            method: 'textDocument/didClose',
            params: { textDocument: { uri: this.fileUri } },
        });
        this.fileUri = '';
    }
}

/* ─── Public hook ──────────────────────────────────────────────────────── */

const TS_EXTS = new Set(['ts', 'tsx', 'mts', 'cts']);
const JS_EXTS = new Set(['js', 'jsx', 'mjs', 'cjs']);

function getExt(filename: string) {
    return filename.split('.').pop()?.toLowerCase() ?? '';
}

// @ts-expect-error reserved helper
function getLangId(ext: string): string {
    if (ext === 'tsx') return 'typescriptreact';
    if (ext === 'jsx') return 'javascriptreact';
    if (ext === 'mjs' || ext === 'cjs') return 'javascript';
    return TS_EXTS.has(ext) ? 'typescript' : 'javascript';
}

export const useLspClient = (code: string, filename: string, _projectId?: string) => {
    const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reqIdRef = useRef(0);

    const ext  = getExt(filename);
    const isTs = TS_EXTS.has(ext);
    const isJs = JS_EXTS.has(ext);

    const clearTimer = useCallback(() => {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    }, []);

    /* ── TS / TSX / JS / JSX (incl. JSDoc): in-browser TS checker ──
     * JS files get checkJs/JSDoc inference auto-enabled when the project
     * has a jsconfig.json or the file actually contains JSDoc tags. We
     * fall back to the lightweight Babel analyzer if the TS check fails. */
    useEffect(() => {
        if (!isTs && !isJs) return;
        clearTimer();
        const myId = ++reqIdRef.current;
        const delay = isTs ? 300 : 400;
        timerRef.current = setTimeout(() => {
            checkSource(code, filename, _projectId)
                .then((diags) => {
                    if (myId !== reqIdRef.current) return;
                    if (isJs && diags.length === 0) {
                        /* Supplement with Babel scope analysis for cheap
                         * undefined-variable / syntax catches. */
                        const fallback = analyzeJs(code, ext);
                        setDiagnostics(fallback);
                    } else {
                        setDiagnostics(diags);
                    }
                })
                .catch(() => {
                    if (myId !== reqIdRef.current) return;
                    setDiagnostics(isJs ? analyzeJs(code, ext) : []);
                });
        }, delay);
        return clearTimer;
    }, [code, filename, isTs, isJs, ext, _projectId, clearTimer]);

    /* ── Non-code files → no diagnostics ── */
    useEffect(() => {
        if (isTs || isJs) return;
        setDiagnostics([]);
    }, [filename, isTs, isJs]);

    return diagnostics;
};
