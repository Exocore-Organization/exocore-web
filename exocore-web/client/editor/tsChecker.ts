/* In-browser TypeScript / JavaScript diagnostics.
 * Uses the official `typescript` package — runs locally so it works on
 * mobile without any LSP WebSocket connection.
 *
 * Behaviour:
 *  - .ts/.mts/.cts/.tsx → full TS type-check
 *  - .js/.mjs/.cjs/.jsx → JS check + JSDoc type inference (checkJs: true)
 *  - Auto-detects tsconfig.json or jsconfig.json from the user's project
 *    (via /exocore/api/editor/coding/read) and merges its compilerOptions.
 */
import type * as TS from 'typescript';
import { preloadLibs, getLib, hasLib } from './tsLibs';

export interface TsDiagnostic {
    line: number;
    column: number;
    length?: number;
    endLine?: number;
    endColumn?: number;
    message: string;
    severity: 'error' | 'warning' | 'info';
    code?: number;
    source?: string;
}

let tsModule: typeof TS | null = null;
let tsLoading: Promise<typeof TS> | null = null;

async function loadTs(): Promise<typeof TS> {
    if (tsModule) return tsModule;
    if (tsLoading) return tsLoading;
    tsLoading = import('typescript').then(m => {
        tsModule = (m as any).default ?? m;
        return tsModule!;
    });
    return tsLoading;
}

const TS_EXTS = new Set(['ts', 'tsx', 'mts', 'cts']);
const JS_EXTS = new Set(['js', 'jsx', 'mjs', 'cjs']);

export function isCheckable(ext: string): boolean {
    return TS_EXTS.has(ext) || JS_EXTS.has(ext);
}

function getScriptKind(ts: typeof TS, ext: string): TS.ScriptKind {
    switch (ext) {
        case 'tsx': return ts.ScriptKind.TSX;
        case 'jsx': return ts.ScriptKind.JSX;
        case 'js':
        case 'mjs':
        case 'cjs': return ts.ScriptKind.JS;
        case 'ts':
        case 'mts':
        case 'cts':
        default:    return ts.ScriptKind.TS;
    }
}

function flatten(ts: typeof TS, m: string | TS.DiagnosticMessageChain): string {
    return ts.flattenDiagnosticMessageText(m as any, '\n');
}

/* ─── Project config (tsconfig.json / jsconfig.json) auto-detection ──── */

interface ProjectConfig {
    /** Which file we loaded ('tsconfig.json' | 'jsconfig.json' | null). */
    source: 'tsconfig.json' | 'jsconfig.json' | null;
    /** Raw compilerOptions object as parsed from the file. */
    raw: Record<string, any>;
}

const EMPTY_CONFIG: ProjectConfig = { source: null, raw: {} };
const configCache = new Map<string, { ts: number; cfg: ProjectConfig }>();
const CONFIG_TTL_MS = 5_000;

async function fetchConfigFile(projectId: string, name: string): Promise<string | null> {
    try {
        const { rpc } = await import('../access/rpcClient');
        const data = await rpc.call<any>('coding.read', { projectId, filePath: name });
        const content = data?.content ?? data?.data?.content ?? null;
        return typeof content === 'string' ? content : null;
    } catch { return null; }
}

/** Strip // and /* *\/ comments + trailing commas so JSON.parse can handle
 *  real-world tsconfig.json files. */
function parseJsonc(src: string): any | null {
    try {
        const stripped = src
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:\\])\/\/.*$/gm, '$1')
            .replace(/,(\s*[}\]])/g, '$1');
        return JSON.parse(stripped);
    } catch { return null; }
}

async function loadProjectConfig(projectId?: string): Promise<ProjectConfig> {
    if (!projectId) return EMPTY_CONFIG;
    const cached = configCache.get(projectId);
    const now = Date.now();
    if (cached && now - cached.ts < CONFIG_TTL_MS) return cached.cfg;

    let cfg: ProjectConfig = EMPTY_CONFIG;
    const tsRaw = await fetchConfigFile(projectId, 'tsconfig.json');
    if (tsRaw) {
        const parsed = parseJsonc(tsRaw);
        if (parsed) cfg = { source: 'tsconfig.json', raw: parsed.compilerOptions ?? {} };
    } else {
        const jsRaw = await fetchConfigFile(projectId, 'jsconfig.json');
        if (jsRaw) {
            const parsed = parseJsonc(jsRaw);
            if (parsed) cfg = { source: 'jsconfig.json', raw: parsed.compilerOptions ?? {} };
        }
    }
    configCache.set(projectId, { ts: now, cfg });
    return cfg;
}

export function invalidateProjectConfig(projectId?: string) {
    if (!projectId) configCache.clear();
    else configCache.delete(projectId);
}

/* Translate a string compilerOptions value (from JSON) to its TS enum. */
function applyUserOptions(ts: typeof TS, base: TS.CompilerOptions, raw: Record<string, any>): TS.CompilerOptions {
    if (!raw || typeof raw !== 'object') return base;
    const out: TS.CompilerOptions = { ...base };
    const set = (k: keyof TS.CompilerOptions, v: any) => { if (v !== undefined) (out as any)[k] = v; };

    /* boolean / number / string passthroughs */
    const passthrough = [
        'allowJs','checkJs','strict','noImplicitAny','noImplicitThis','noImplicitReturns',
        'strictNullChecks','strictFunctionTypes','strictBindCallApply','strictPropertyInitialization',
        'alwaysStrict','noUnusedLocals','noUnusedParameters','noFallthroughCasesInSwitch',
        'noUncheckedIndexedAccess','noImplicitOverride','exactOptionalPropertyTypes',
        'allowSyntheticDefaultImports','esModuleInterop','resolveJsonModule','isolatedModules',
        'skipLibCheck','skipDefaultLibCheck','useDefineForClassFields','experimentalDecorators',
        'emitDecoratorMetadata','allowImportingTsExtensions','verbatimModuleSyntax',
        'forceConsistentCasingInFileNames','allowUmdGlobalAccess',
    ] as const;
    for (const k of passthrough) if (raw[k] !== undefined) set(k as any, raw[k]);

    /* enum-typed options that come in as strings in JSON */
    if (typeof raw.target === 'string') {
        const v = (ts.ScriptTarget as any)[raw.target] ?? (ts.ScriptTarget as any)[raw.target.replace(/^ES/i, 'ES')];
        if (v !== undefined) out.target = v;
    }
    if (typeof raw.module === 'string') {
        const v = (ts.ModuleKind as any)[raw.module] ?? (ts.ModuleKind as any)[raw.module.replace(/^ES/i, 'ES')];
        if (v !== undefined) out.module = v;
    }
    if (typeof raw.moduleResolution === 'string') {
        const map: Record<string, TS.ModuleResolutionKind> = {
            node: ts.ModuleResolutionKind.NodeJs,
            node10: ts.ModuleResolutionKind.NodeJs,
            node16: (ts.ModuleResolutionKind as any).Node16 ?? ts.ModuleResolutionKind.NodeJs,
            nodenext: (ts.ModuleResolutionKind as any).NodeNext ?? ts.ModuleResolutionKind.NodeJs,
            bundler: ts.ModuleResolutionKind.Bundler,
            classic: ts.ModuleResolutionKind.Classic,
        };
        const v = map[String(raw.moduleResolution).toLowerCase()];
        if (v !== undefined) out.moduleResolution = v;
    }
    if (typeof raw.jsx === 'string') {
        const map: Record<string, TS.JsxEmit> = {
            preserve: ts.JsxEmit.Preserve,
            react: ts.JsxEmit.React,
            'react-jsx': ts.JsxEmit.ReactJSX,
            'react-jsxdev': ts.JsxEmit.ReactJSXDev,
            'react-native': ts.JsxEmit.ReactNative,
            none: ts.JsxEmit.None,
        };
        const v = map[String(raw.jsx).toLowerCase()];
        if (v !== undefined) out.jsx = v;
    }
    if (Array.isArray(raw.lib)) {
        out.lib = (raw.lib as string[]).map(l =>
            l.startsWith('lib.') ? l : `lib.${l.toLowerCase()}.d.ts`,
        );
    }
    return out;
}

/* JSDoc heuristic — used when no jsconfig is present so we can still
 * surface JSDoc-driven types if the file actually uses them. */
const JSDOC_RE = /\/\*\*[\s\S]*?@(type|param|returns?|typedef|callback|template|enum|extends|implements|throws|see|deprecated|since|example|description|public|private|protected|readonly|abstract|override|virtual|method|memberof|namespace|module|class|interface|property|prop|arg|argument|access|kind|name|alias)\b/;

export async function checkSource(
    code: string,
    filename: string,
    projectId?: string,
): Promise<TsDiagnostic[]> {
    const ext = (filename.split('.').pop() ?? '').toLowerCase();
    if (!isCheckable(ext)) return [];

    const [ts, , userCfg] = await Promise.all([
        loadTs(),
        preloadLibs(),
        loadProjectConfig(projectId),
    ]);
    const isTs = TS_EXTS.has(ext);
    const isJs = JS_EXTS.has(ext);
    const scriptKind = getScriptKind(ts, ext);
    const fileName = `/__file__.${ext}`;

    /* checkJs auto-on when:
     *   - jsconfig.json was found, OR
     *   - tsconfig has checkJs: true, OR
     *   - file actually contains JSDoc type annotations. */
    const userCheckJs = userCfg.raw.checkJs;
    const hasJsdoc = isJs && JSDOC_RE.test(code);
    const checkJs = userCheckJs !== undefined
        ? !!userCheckJs
        : (userCfg.source === 'jsconfig.json' || hasJsdoc);

    const baseOptions: TS.CompilerOptions = {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        jsx: scriptKind === ts.ScriptKind.TSX || scriptKind === ts.ScriptKind.JSX
            ? ts.JsxEmit.Preserve : ts.JsxEmit.None,
        allowJs: true,
        checkJs,
        strict: isTs,           /* JS defaults loose; tsconfig can override   */
        noImplicitAny: isTs,
        noImplicitThis: isTs,
        noImplicitReturns: isTs,
        strictNullChecks: isTs,
        strictFunctionTypes: isTs,
        strictBindCallApply: isTs,
        noFallthroughCasesInSwitch: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        alwaysStrict: isTs,
        noEmit: true,
        isolatedModules: false,
        skipLibCheck: true,
        skipDefaultLibCheck: true,
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
        resolveJsonModule: true,
        lib: ['lib.es2020.full.d.ts'],
        types: [],
    };

    const compilerOptions = applyUserOptions(ts, baseOptions, userCfg.raw);
    const target = compilerOptions.target ?? ts.ScriptTarget.ES2020;

    const sourceFile = ts.createSourceFile(fileName, code, target, true, scriptKind);

    const out: TsDiagnostic[] = [];
    const pushDiag = (d: TS.Diagnostic, defaultSeverity: 'error' | 'warning') => {
        const sf = d.file ?? sourceFile;
        const start = d.start ?? 0;
        const length = d.length ?? 1;
        const startLc = sf.getLineAndCharacterOfPosition(start);
        const endLc = sf.getLineAndCharacterOfPosition(start + length);
        out.push({
            line: startLc.line + 1,
            column: startLc.character,
            length,
            endLine: endLc.line + 1,
            endColumn: endLc.character,
            message: flatten(ts, d.messageText),
            severity:
                d.category === ts.DiagnosticCategory.Error   ? 'error'   :
                d.category === ts.DiagnosticCategory.Warning ? 'warning' :
                d.category === ts.DiagnosticCategory.Suggestion ? 'info'  :
                defaultSeverity,
            code: d.code,
            source: isTs ? 'ts' : 'js',
        });
    };

    try {
        const libSfCache = (checkSource as any)._libSf as Map<string, TS.SourceFile> | undefined
            ?? new Map<string, TS.SourceFile>();
        (checkSource as any)._libSf = libSfCache;

        const resolveLib = (name: string): TS.SourceFile | undefined => {
            const text = getLib(name);
            if (text === undefined) return undefined;
            const cached = libSfCache.get(name);
            if (cached) return cached;
            const sf = ts.createSourceFile(name, text, target, false);
            libSfCache.set(name, sf);
            return sf;
        };

        const host: TS.CompilerHost = {
            getSourceFile: (name) => name === fileName ? sourceFile : resolveLib(name),
            writeFile: () => {},
            getDefaultLibFileName: () => 'lib.es2020.full.d.ts',
            useCaseSensitiveFileNames: () => true,
            getCanonicalFileName: (n) => n,
            getCurrentDirectory: () => '/',
            getNewLine: () => '\n',
            fileExists: (n) => n === fileName || hasLib(n),
            readFile: (n) => (n === fileName ? code : getLib(n)),
            directoryExists: () => true,
            getDirectories: () => [],
        };

        const program = ts.createProgram({
            rootNames: [fileName],
            options: compilerOptions,
            host,
        });

        program.getSyntacticDiagnostics(sourceFile).forEach((d) => pushDiag(d, 'error'));

        /* Semantic diagnostics. Run for TS always, and for JS when checkJs
         * is on (either via config or detected JSDoc). */
        if (isTs || checkJs) {
            const SKIP_NO_LIB = new Set<number>([
                2688, // Cannot find type definition file.
                1208, // Cannot be compiled under '--isolatedModules'.
            ]);
            const WARN_CODES = new Set<number>([
                6133, 6138, 6192, 6196, 6198, 6199, 7027, 7030,
                /* Module-resolution: can't reach node_modules from the browser */
                2305, 2307, 2792, 7016, 1259,
            ]);

            program.getSemanticDiagnostics(sourceFile).forEach((d) => {
                if (SKIP_NO_LIB.has(d.code)) return;
                pushDiag(d, WARN_CODES.has(d.code) ? 'warning' : 'error');
            });
        }
    } catch {
        const parseDiags = (sourceFile as any).parseDiagnostics as TS.Diagnostic[] | undefined;
        if (Array.isArray(parseDiags)) parseDiags.forEach((d) => pushDiag(d, 'error'));
    }

    /* Always include parse errors that live on the source file. */
    const parseDiags = (sourceFile as any).parseDiagnostics as TS.Diagnostic[] | undefined;
    if (Array.isArray(parseDiags) && parseDiags.length) {
        parseDiags.forEach((d) => pushDiag(d, 'error'));
    }

    /* dedupe by line+col+message */
    const seen = new Set<string>();
    return out.filter((d) => {
        const k = `${d.line}:${d.column}:${d.message}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}
