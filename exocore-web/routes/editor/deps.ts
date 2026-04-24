import { Router, Request, Response, RequestHandler } from 'express';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

interface DepInfo {
    name: string;
    version?: string;
    used: boolean;
}

async function walkSourceFiles(dir: string, exts: string[], out: string[] = [], depth = 0): Promise<string[]> {
    if (depth > 6) return out;
    let entries: fs.Dirent[] = [];
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
        if (e.name.startsWith('.') || ['node_modules', 'target', 'build', 'dist', 'vendor', '.git', 'venv'].includes(e.name)) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walkSourceFiles(full, exts, out, depth + 1);
        else if (exts.some(x => e.name.endsWith(x))) out.push(full);
    }
    return out;
}

async function readSources(dir: string, exts: string[]): Promise<string> {
    const files = await walkSourceFiles(dir, exts);
    const chunks: string[] = [];
    for (const f of files) {
        try { chunks.push(await fsp.readFile(f, 'utf-8')); } catch {}
    }
    return chunks.join('\n');
}

async function parseRustDeps(projDir: string): Promise<DepInfo[]> {
    const cargoPath = path.join(projDir, 'Cargo.toml');
    if (!fs.existsSync(cargoPath)) return [];
    const content = await fsp.readFile(cargoPath, 'utf-8');
    const sect = content.split('[dependencies]')[1]?.split('\n[')[0] || '';
    const deps: { name: string; version?: string }[] = [];
    sect.split('\n').forEach(line => {
        const m = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*"([^"]+)"/);
        if (m) deps.push({ name: m[1], version: m[2] });
        else {
            const m2 = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*\{/);
            if (m2) deps.push({ name: m2[1] });
        }
    });
    const src = await readSources(projDir, ['.rs']);
    return deps.map(d => ({
        ...d,
        used: new RegExp(`(?:use|extern crate)\\s+${d.name.replace(/-/g, '_')}\\b`).test(src),
    }));
}

async function parseGoDeps(projDir: string): Promise<DepInfo[]> {
    const goMod = path.join(projDir, 'go.mod');
    if (!fs.existsSync(goMod)) return [];
    const content = await fsp.readFile(goMod, 'utf-8');
    const reqRe = /(?:require\s*\(([\s\S]*?)\)|require\s+([^\s]+)\s+([^\s]+))/g;
    const deps: { name: string; version?: string }[] = [];
    let m;
    while ((m = reqRe.exec(content)) !== null) {
        if (m[1]) {
            m[1].split('\n').forEach(line => {
                const dm = line.trim().match(/^([^\s]+)\s+([^\s]+)/);
                if (dm) deps.push({ name: dm[1], version: dm[2] });
            });
        } else if (m[2]) {
            deps.push({ name: m[2], version: m[3] });
        }
    }
    const src = await readSources(projDir, ['.go']);
    return deps.map(d => ({ ...d, used: src.includes(`"${d.name}"`) || src.includes(`"${d.name}/`) }));
}

async function parseRubyDeps(projDir: string): Promise<DepInfo[]> {
    const gemfile = path.join(projDir, 'Gemfile');
    if (!fs.existsSync(gemfile)) return [];
    const content = await fsp.readFile(gemfile, 'utf-8');
    const deps: { name: string; version?: string }[] = [];
    content.split('\n').forEach(line => {
        const m = line.match(/^\s*gem\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/);
        if (m) deps.push({ name: m[1], version: m[2] });
    });
    const src = await readSources(projDir, ['.rb']);
    return deps.map(d => ({ ...d, used: new RegExp(`require\\s+['"]${d.name}`).test(src) }));
}

async function parsePhpDeps(projDir: string): Promise<DepInfo[]> {
    const composer = path.join(projDir, 'composer.json');
    if (!fs.existsSync(composer)) return [];
    try {
        const data = JSON.parse(await fsp.readFile(composer, 'utf-8'));
        const req = { ...(data.require || {}), ...(data['require-dev'] || {}) };
        const deps: { name: string; version: string }[] = Object.entries(req)
            .filter(([k]) => k !== 'php')
            .map(([name, version]) => ({ name, version: version as string }));
        const src = await readSources(projDir, ['.php']);
        return deps.map(d => {
            const ns = d.name.split('/').pop() || d.name;
            return { ...d, used: src.includes(d.name) || src.includes(ns) };
        });
    } catch { return []; }
}

async function parseJavaDeps(projDir: string): Promise<DepInfo[]> {
    const pom = path.join(projDir, 'pom.xml');
    if (!fs.existsSync(pom)) return [];
    const content = await fsp.readFile(pom, 'utf-8');
    const re = /<dependency>([\s\S]*?)<\/dependency>/g;
    const deps: { name: string; version?: string }[] = [];
    let m;
    while ((m = re.exec(content)) !== null) {
        const block = m[1];
        const aid = block.match(/<artifactId>([^<]+)<\/artifactId>/);
        const ver = block.match(/<version>([^<]+)<\/version>/);
        if (aid) deps.push({ name: aid[1], version: ver?.[1] });
    }
    const src = await readSources(projDir, ['.java']);
    return deps.map(d => ({ ...d, used: new RegExp(`\\b${d.name.replace(/-/g, '')}\\b`, 'i').test(src) }));
}

async function parseCargoLikeFromDir(projDir: string, language: string, runtime: string): Promise<DepInfo[]> {
    const lang = language.toLowerCase();
    const rt = runtime.toLowerCase();
    if (lang === 'rust' || rt === 'cargo') return parseRustDeps(projDir);
    if (lang === 'go' || rt === 'go') return parseGoDeps(projDir);
    if (lang === 'ruby' || rt === 'ruby') return parseRubyDeps(projDir);
    if (lang === 'php' || rt === 'php') return parsePhpDeps(projDir);
    if (lang === 'java' || rt === 'java') return parseJavaDeps(projDir);
    return [];
}

export class DepsRoute {
    public router: Router;

    constructor() {
        this.router = Router();
        this.router.get('/list', this.list);
    }

    private list: RequestHandler = async (req: Request, res: Response) => {
        const projectId = String(req.query.projectId || '').replace(/[^a-zA-Z0-9_-]/g, '');
        const language = String(req.query.language || '');
        const runtime = String(req.query.runtime || '');
        const projDir = path.join(PROJECTS_DIR, projectId);
        if (!fs.existsSync(projDir)) return res.status(404).json({ error: 'project_not_found' });
        try {
            const packages = await parseCargoLikeFromDir(projDir, language, runtime);
            return res.json({ packages });
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'failed';
            return res.status(500).json({ packages: [], error: msg });
        }
    };
}
