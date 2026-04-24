"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DepsRoute = void 0;
const express_1 = require("express");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const promises_1 = __importDefault(require("fs/promises"));
const PROJECTS_DIR = path_1.default.join(process.cwd(), 'projects');
async function walkSourceFiles(dir, exts, out = [], depth = 0) {
    if (depth > 6)
        return out;
    let entries = [];
    try {
        entries = await promises_1.default.readdir(dir, { withFileTypes: true });
    }
    catch {
        return out;
    }
    for (const e of entries) {
        if (e.name.startsWith('.') || ['node_modules', 'target', 'build', 'dist', 'vendor', '.git', 'venv'].includes(e.name))
            continue;
        const full = path_1.default.join(dir, e.name);
        if (e.isDirectory())
            await walkSourceFiles(full, exts, out, depth + 1);
        else if (exts.some(x => e.name.endsWith(x)))
            out.push(full);
    }
    return out;
}
async function readSources(dir, exts) {
    const files = await walkSourceFiles(dir, exts);
    const chunks = [];
    for (const f of files) {
        try {
            chunks.push(await promises_1.default.readFile(f, 'utf-8'));
        }
        catch { }
    }
    return chunks.join('\n');
}
async function parseRustDeps(projDir) {
    const cargoPath = path_1.default.join(projDir, 'Cargo.toml');
    if (!fs_1.default.existsSync(cargoPath))
        return [];
    const content = await promises_1.default.readFile(cargoPath, 'utf-8');
    const sect = content.split('[dependencies]')[1]?.split('\n[')[0] || '';
    const deps = [];
    sect.split('\n').forEach(line => {
        const m = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*"([^"]+)"/);
        if (m)
            deps.push({ name: m[1], version: m[2] });
        else {
            const m2 = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*\{/);
            if (m2)
                deps.push({ name: m2[1] });
        }
    });
    const src = await readSources(projDir, ['.rs']);
    return deps.map(d => ({
        ...d,
        used: new RegExp(`(?:use|extern crate)\\s+${d.name.replace(/-/g, '_')}\\b`).test(src),
    }));
}
async function parseGoDeps(projDir) {
    const goMod = path_1.default.join(projDir, 'go.mod');
    if (!fs_1.default.existsSync(goMod))
        return [];
    const content = await promises_1.default.readFile(goMod, 'utf-8');
    const reqRe = /(?:require\s*\(([\s\S]*?)\)|require\s+([^\s]+)\s+([^\s]+))/g;
    const deps = [];
    let m;
    while ((m = reqRe.exec(content)) !== null) {
        if (m[1]) {
            m[1].split('\n').forEach(line => {
                const dm = line.trim().match(/^([^\s]+)\s+([^\s]+)/);
                if (dm)
                    deps.push({ name: dm[1], version: dm[2] });
            });
        }
        else if (m[2]) {
            deps.push({ name: m[2], version: m[3] });
        }
    }
    const src = await readSources(projDir, ['.go']);
    return deps.map(d => ({ ...d, used: src.includes(`"${d.name}"`) || src.includes(`"${d.name}/`) }));
}
async function parseRubyDeps(projDir) {
    const gemfile = path_1.default.join(projDir, 'Gemfile');
    if (!fs_1.default.existsSync(gemfile))
        return [];
    const content = await promises_1.default.readFile(gemfile, 'utf-8');
    const deps = [];
    content.split('\n').forEach(line => {
        const m = line.match(/^\s*gem\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/);
        if (m)
            deps.push({ name: m[1], version: m[2] });
    });
    const src = await readSources(projDir, ['.rb']);
    return deps.map(d => ({ ...d, used: new RegExp(`require\\s+['"]${d.name}`).test(src) }));
}
async function parsePhpDeps(projDir) {
    const composer = path_1.default.join(projDir, 'composer.json');
    if (!fs_1.default.existsSync(composer))
        return [];
    try {
        const data = JSON.parse(await promises_1.default.readFile(composer, 'utf-8'));
        const req = { ...(data.require || {}), ...(data['require-dev'] || {}) };
        const deps = Object.entries(req)
            .filter(([k]) => k !== 'php')
            .map(([name, version]) => ({ name, version: version }));
        const src = await readSources(projDir, ['.php']);
        return deps.map(d => {
            const ns = d.name.split('/').pop() || d.name;
            return { ...d, used: src.includes(d.name) || src.includes(ns) };
        });
    }
    catch {
        return [];
    }
}
async function parseJavaDeps(projDir) {
    const pom = path_1.default.join(projDir, 'pom.xml');
    if (!fs_1.default.existsSync(pom))
        return [];
    const content = await promises_1.default.readFile(pom, 'utf-8');
    const re = /<dependency>([\s\S]*?)<\/dependency>/g;
    const deps = [];
    let m;
    while ((m = re.exec(content)) !== null) {
        const block = m[1];
        const aid = block.match(/<artifactId>([^<]+)<\/artifactId>/);
        const ver = block.match(/<version>([^<]+)<\/version>/);
        if (aid)
            deps.push({ name: aid[1], version: ver?.[1] });
    }
    const src = await readSources(projDir, ['.java']);
    return deps.map(d => ({ ...d, used: new RegExp(`\\b${d.name.replace(/-/g, '')}\\b`, 'i').test(src) }));
}
async function parseCargoLikeFromDir(projDir, language, runtime) {
    const lang = language.toLowerCase();
    const rt = runtime.toLowerCase();
    if (lang === 'rust' || rt === 'cargo')
        return parseRustDeps(projDir);
    if (lang === 'go' || rt === 'go')
        return parseGoDeps(projDir);
    if (lang === 'ruby' || rt === 'ruby')
        return parseRubyDeps(projDir);
    if (lang === 'php' || rt === 'php')
        return parsePhpDeps(projDir);
    if (lang === 'java' || rt === 'java')
        return parseJavaDeps(projDir);
    return [];
}
class DepsRoute {
    router;
    constructor() {
        this.router = (0, express_1.Router)();
        this.router.get('/list', this.list);
    }
    list = async (req, res) => {
        const projectId = String(req.query.projectId || '').replace(/[^a-zA-Z0-9_-]/g, '');
        const language = String(req.query.language || '');
        const runtime = String(req.query.runtime || '');
        const projDir = path_1.default.join(PROJECTS_DIR, projectId);
        if (!fs_1.default.existsSync(projDir))
            return res.status(404).json({ error: 'project_not_found' });
        try {
            const packages = await parseCargoLikeFromDir(projDir, language, runtime);
            return res.json({ packages });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'failed';
            return res.status(500).json({ packages: [], error: msg });
        }
    };
}
exports.DepsRoute = DepsRoute;
