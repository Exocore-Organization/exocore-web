import { Router, Request, Response, RequestHandler } from 'express';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const PROJECTS_DIR = path.join(process.cwd(), 'projects');

// Resolve a working pip command once. Tries `pip`, then `pip3`, then `python -m pip`.
let cachedPipCmd: string | null = null;
async function resolvePipCmd(): Promise<string> {
    if (cachedPipCmd) return cachedPipCmd;
    const candidates = ['pip', 'pip3', 'python3 -m pip', 'python -m pip'];
    for (const c of candidates) {
        try {
            await execAsync(`${c} --version`, { timeout: 10000 });
            cachedPipCmd = c;
            return c;
        } catch {}
    }
    throw new Error('pip not found on system (tried pip, pip3, python -m pip)');
}

interface PyPiResult {
    name: string;
    version: string;
    summary: string;
}

// Cached PyPI package name index (refreshed every 6 hours)
let pypiIndexCache: { names: string[]; lower: string[]; ts: number } | null = null;
const PYPI_INDEX_TTL = 6 * 60 * 60 * 1000;

async function loadPyPiIndex(): Promise<{ names: string[]; lower: string[] }> {
    const now = Date.now();
    if (pypiIndexCache && (now - pypiIndexCache.ts) < PYPI_INDEX_TTL) {
        return pypiIndexCache;
    }
    try {
        const r = await fetch('https://pypi.org/simple/', {
            headers: { 'Accept': 'application/vnd.pypi.simple.v1+json' },
        });
        if (r.ok) {
            const data: any = await r.json();
            const names: string[] = (data.projects || []).map((p: any) => p.name).filter(Boolean);
            const lower = names.map(n => n.toLowerCase());
            pypiIndexCache = { names, lower, ts: now };
            return pypiIndexCache;
        }
    } catch {}
    // Fallback: empty
    pypiIndexCache = pypiIndexCache || { names: [], lower: [], ts: now };
    return pypiIndexCache;
}

function rankMatches(query: string, names: string[], lower: string[], limit = 25): string[] {
    const q = query.toLowerCase();
    const exact: string[] = [];
    const prefix: string[] = [];
    const substr: string[] = [];
    for (let i = 0; i < lower.length; i++) {
        const n = lower[i];
        if (n === q) exact.push(names[i]);
        else if (n.startsWith(q)) prefix.push(names[i]);
        else if (n.includes(q)) substr.push(names[i]);
        if (exact.length + prefix.length > limit * 4) break;
    }
    // Sort prefix/substr by length (shorter = more relevant)
    prefix.sort((a, b) => a.length - b.length);
    substr.sort((a, b) => a.length - b.length);
    const merged = [...exact, ...prefix, ...substr];
    // Dedupe (case-insensitive)
    const seen = new Set<string>();
    const out: string[] = [];
    for (const n of merged) {
        const k = n.toLowerCase();
        if (!seen.has(k)) { seen.add(k); out.push(n); }
        if (out.length >= limit) break;
    }
    return out;
}

async function fetchPyPiMeta(name: string): Promise<PyPiResult | null> {
    try {
        const r = await fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`);
        if (!r.ok) return null;
        const data: any = await r.json();
        return {
            name: data.info?.name || name,
            version: data.info?.version || '',
            summary: data.info?.summary || '',
        };
    } catch { return null; }
}

async function walkPyFiles(dir: string, out: string[] = [], depth = 0): Promise<string[]> {
    if (depth > 6) return out;
    let entries: fs.Dirent[] = [];
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
        if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'venv' || e.name === '__pycache__' || e.name === 'site-packages') continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walkPyFiles(full, out, depth + 1);
        else if (e.name.endsWith('.py')) out.push(full);
    }
    return out;
}

export class PyLibRoute {
    public router: Router;

    constructor() {
        this.router = Router();
        this.router.get('/search', this.search);
        this.router.get('/list', this.list);
        this.router.post('/install', this.install);
        this.router.post('/uninstall', this.uninstall);
    }

    private projectPath(projectId: string): string | null {
        const safe = projectId.replace(/[^a-zA-Z0-9_-]/g, '');
        const p = path.join(PROJECTS_DIR, safe);
        if (!fs.existsSync(p)) return null;
        return p;
    }

    /** Search PyPI: substring-match against the full package index, then enrich top hits with metadata. */
    private search: RequestHandler = async (req: Request, res: Response) => {
        const q = String(req.query.q || '').trim();
        if (!q) return res.json({ results: [] });

        const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 50);
        const seen = new Set<string>();
        const ordered: string[] = [];
        const pushName = (n: string) => {
            const k = n.toLowerCase();
            if (!seen.has(k)) { seen.add(k); ordered.push(n); }
        };

        // 1. Always include the exact name first (covers brand-new packages not yet in cache)
        pushName(q);

        // 2. Substring matches from the cached PyPI simple index
        try {
            const idx = await loadPyPiIndex();
            for (const n of rankMatches(q, idx.names, idx.lower, limit)) pushName(n);
        } catch {}

        // 3. Enrich the top candidates with version + summary in parallel.
        //    Drop entries whose JSON lookup 404s (package doesn't actually exist).
        const candidates = ordered.slice(0, limit);
        const metas = await Promise.all(candidates.map(fetchPyPiMeta));
        const results: PyPiResult[] = [];
        for (let i = 0; i < candidates.length; i++) {
            const m = metas[i];
            if (m) results.push(m);
        }

        return res.json({ results });
    };

    /** List installed packages from requirements.txt + check usage in .py files */
    private list: RequestHandler = async (req: Request, res: Response) => {
        const projectId = String(req.query.projectId || '');
        const projDir = this.projectPath(projectId);
        if (!projDir) return res.status(404).json({ error: 'project_not_found' });

        const reqPath = path.join(projDir, 'requirements.txt');
        const packages: { name: string; version?: string; used: boolean }[] = [];

        let lines: string[] = [];
        if (fs.existsSync(reqPath)) {
            const content = await fsp.readFile(reqPath, 'utf-8');
            lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
        }

        // Parse package names + versions
        const parsed = lines.map(line => {
            const m = line.match(/^([A-Za-z0-9_.\-]+)(?:\s*[=<>~!]+\s*([^\s;]+))?/);
            return m ? { name: m[1], version: m[2] } : null;
        }).filter(Boolean) as { name: string; version?: string }[];

        // Scan .py files for usage
        const pyFiles = await walkPyFiles(projDir);
        const sources: string[] = [];
        for (const f of pyFiles) {
            try { sources.push(await fsp.readFile(f, 'utf-8')); } catch {}
        }
        const allSrc = sources.join('\n');

        for (const p of parsed) {
            // Common rule: package name → import name (with normalization)
            const importNames = new Set<string>([
                p.name.toLowerCase().replace(/-/g, '_'),
                p.name.toLowerCase().replace(/-/g, ''),
                p.name.split('-')[0].toLowerCase(),
            ]);
            // Special cases
            const aliases: Record<string, string[]> = {
                'beautifulsoup4': ['bs4'],
                'pillow': ['PIL'],
                'pyyaml': ['yaml'],
                'scikit-learn': ['sklearn'],
                'opencv-python': ['cv2'],
                'python-dotenv': ['dotenv'],
                'discord.py': ['discord'],
            };
            if (aliases[p.name.toLowerCase()]) {
                aliases[p.name.toLowerCase()].forEach(a => importNames.add(a.toLowerCase()));
            }

            const used = Array.from(importNames).some(n => {
                const pattern = new RegExp(`(?:^|\\n)\\s*(?:import\\s+${n}|from\\s+${n})\\b`, 'im');
                return pattern.test(allSrc);
            });

            packages.push({ name: p.name, version: p.version, used });
        }

        return res.json({ packages });
    };

    private install: RequestHandler = async (req: Request, res: Response) => {
        const { projectId, packageName, version } = req.body as { projectId: string; packageName: string; version?: string };
        const projDir = this.projectPath(projectId);
        if (!projDir) return res.status(404).json({ error: 'project_not_found' });
        if (!packageName) return res.status(400).json({ error: 'packageName_required' });

        try {
            const spec = version ? `${packageName}==${version}` : packageName;
            const pip = await resolvePipCmd();
            await execAsync(`${pip} install ${spec}`, { cwd: projDir, timeout: 120000 });

            // Update requirements.txt
            const reqPath = path.join(projDir, 'requirements.txt');
            let content = '';
            if (fs.existsSync(reqPath)) content = await fsp.readFile(reqPath, 'utf-8');
            const lines = content.split('\n').filter(l => !l.toLowerCase().startsWith(packageName.toLowerCase()));
            lines.push(spec);
            await fsp.writeFile(reqPath, lines.filter(l => l.trim()).join('\n') + '\n', 'utf-8');

            return res.json({ success: true });
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'install_failed';
            return res.status(500).json({ success: false, error: msg });
        }
    };

    private uninstall: RequestHandler = async (req: Request, res: Response) => {
        const { projectId, packageName } = req.body as { projectId: string; packageName: string };
        const projDir = this.projectPath(projectId);
        if (!projDir) return res.status(404).json({ error: 'project_not_found' });
        if (!packageName) return res.status(400).json({ error: 'packageName_required' });

        try {
            const pip = await resolvePipCmd().catch(() => 'pip');
            await execAsync(`${pip} uninstall -y ${packageName}`, { cwd: projDir, timeout: 60000 }).catch(() => null);
            const reqPath = path.join(projDir, 'requirements.txt');
            if (fs.existsSync(reqPath)) {
                const content = await fsp.readFile(reqPath, 'utf-8');
                const lines = content.split('\n').filter(l => {
                    const name = l.split(/[=<>~!]+/)[0].trim().toLowerCase();
                    return name !== packageName.toLowerCase();
                });
                await fsp.writeFile(reqPath, lines.filter(l => l.trim()).join('\n') + '\n', 'utf-8');
            }
            return res.json({ success: true });
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'uninstall_failed';
            return res.status(500).json({ success: false, error: msg });
        }
    };
}
