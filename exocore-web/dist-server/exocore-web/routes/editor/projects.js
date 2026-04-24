"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectsRoute = void 0;
const express_1 = require("express");
const promises_1 = __importDefault(require("fs/promises"));
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const exoConfig_1 = require("../../server/lib/exoConfig");
class ProjectsRoute {
    router;
    projectsDir;
    archiveDir;
    constructor() {
        this.router = (0, express_1.Router)();
        this.projectsDir = path_1.default.join(process.cwd(), "projects");
        this.archiveDir = path_1.default.join(process.cwd(), "projects_archive");
        this.ensureDirectories();
        this.initRoutes();
    }
    async ensureDirectories() {
        try {
            if (!(0, fs_1.existsSync)(this.projectsDir))
                await promises_1.default.mkdir(this.projectsDir, { recursive: true });
            if (!(0, fs_1.existsSync)(this.archiveDir))
                await promises_1.default.mkdir(this.archiveDir, { recursive: true });
        }
        catch (err) {
            console.error("🔥 Error creating directories:", err);
        }
    }
    initRoutes() {
        this.router.get("/list", this.listProjects);
        this.router.post("/create", this.createProject);
        this.router.post("/archive", this.archiveProject);
        this.router.post("/unarchive", this.unarchiveProject);
        this.router.post("/delete", this.deleteProject);
        this.router.post("/rename", this.renameProject);
    }
    sanitizeName(name) {
        return name.replace(/[^a-zA-Z0-9_-]/g, "");
    }
    async migrateToExo(dirPath, dirName) {
        const legacyPath = path_1.default.join(dirPath, ".exocore.json");
        const exoPath = path_1.default.join(dirPath, "system.exo");
        if (!(0, fs_1.existsSync)(legacyPath))
            return;
        try {
            const raw = await promises_1.default.readFile(legacyPath, "utf-8");
            const json = JSON.parse(raw);
            const config = (0, exoConfig_1.createDefaultExoConfig)(json.name ?? dirName, json.author ?? "Developer");
            config.project.description = json.description ?? "No description";
            config.runtime.run = json.run ?? "npm start";
            config.runtime.port = json.port ?? 3001;
            await promises_1.default.writeFile(exoPath, (0, exoConfig_1.serializeExoConfig)(config), "utf-8");
            (0, fs_1.unlinkSync)(legacyPath);
            console.log(`[PROJECTS] Migrated ${dirName}: .exocore.json → system.exo`);
        }
        catch (err) {
            console.warn(`[PROJECTS] Failed to migrate ${dirName}:`, err);
        }
    }
    async readExoConfig(dirPath, dirName) {
        const exoPath = path_1.default.join(dirPath, "system.exo");
        if (!(0, fs_1.existsSync)(exoPath))
            return null;
        try {
            const content = await promises_1.default.readFile(exoPath, "utf-8");
            return (0, exoConfig_1.parseExoConfig)(content);
        }
        catch {
            return (0, exoConfig_1.createDefaultExoConfig)(dirName);
        }
    }
    resolveBaseUrl() {
        const serverPort = process.env.PORT || '5000';
        if (process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS) {
            const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS;
            return `https://${domain}`;
        }
        if (process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL) {
            const domain = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL;
            return `https://${domain}`;
        }
        if (process.env.RENDER_EXTERNAL_URL)
            return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
        if (process.env.SPACE_HOST)
            return `https://${process.env.SPACE_HOST}`;
        if (process.env.VERCEL_URL)
            return `https://${process.env.VERCEL_URL}`;
        return `http://localhost:${serverPort}`;
    }
    detectLanguage(projPath) {
        const has = (f) => (0, fs_1.existsSync)(path_1.default.join(projPath, f));
        if (has('package.json')) {
            // Sniff package.json deps to give a more specific framework icon
            let icon;
            try {
                const pkg = JSON.parse((0, fs_1.readFileSync)(path_1.default.join(projPath, 'package.json'), 'utf-8'));
                const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
                const FRAMEWORK_ICON = [
                    ['next', 'nextjs'], ['nuxt', 'nuxt'], ['@remix-run/react', 'remix'],
                    ['@nestjs/core', 'nestjs'], ['express', 'express'], ['fastify', 'fastify'],
                    ['hono', 'hono'], ['koa', 'koa'], ['@sveltejs/kit', 'sveltekit'],
                    ['svelte', 'svelte'], ['vue', 'vue'], ['@angular/core', 'angular'],
                    ['solid-js', 'solid'], ['preact', 'preact'], ['@builder.io/qwik', 'qwik'],
                    ['gatsby', 'gatsby'], ['astro', 'astro'], ['react-native', 'react'],
                    ['expo', 'react'], ['electron', 'electron'], ['@tauri-apps/api', 'tauri'],
                    ['discord.js', 'discord'], ['telegraf', 'telegram'],
                    ['whatsapp-web.js', 'whatsapp'], ['openai', 'openai'],
                    ['react', 'react'],
                ];
                for (const [dep, ic] of FRAMEWORK_ICON) {
                    if (deps[dep]) {
                        icon = ic;
                        break;
                    }
                }
            }
            catch { }
            if (has('bun.lockb') || has('bun.lock'))
                return { language: 'ts', runtime: 'bun', icon: icon ?? 'bun' };
            if (has('deno.json') || has('deno.jsonc'))
                return { language: 'ts', runtime: 'deno', icon: icon ?? 'deno' };
            return { language: 'nodejs', runtime: 'node', icon: icon ?? 'node' };
        }
        if (has('deno.json') || has('deno.jsonc'))
            return { language: 'ts', runtime: 'deno', icon: 'deno' };
        if (has('requirements.txt') || has('pyproject.toml') || has('Pipfile'))
            return { language: 'python', runtime: 'python', icon: 'python' };
        if (has('Cargo.toml'))
            return { language: 'rust', runtime: 'cargo', icon: 'rust' };
        if (has('go.mod'))
            return { language: 'go', runtime: 'go', icon: 'go' };
        if (has('pom.xml') || has('build.gradle') || has('build.gradle.kts'))
            return { language: 'java', runtime: 'java', icon: 'java' };
        if (has('Gemfile'))
            return { language: 'ruby', runtime: 'ruby', icon: 'ruby' };
        if (has('composer.json'))
            return { language: 'php', runtime: 'php', icon: 'php' };
        if (has('mix.exs'))
            return { language: 'elixir', runtime: 'elixir', icon: 'elixir' };
        if (has('Makefile'))
            return { language: 'c', runtime: 'gcc', icon: 'c' };
        if (has('CMakeLists.txt'))
            return { language: 'cpp', runtime: 'cmake', icon: 'cpp' };
        if (has('*.csproj') || has('*.sln'))
            return { language: 'csharp', runtime: 'dotnet', icon: 'csharp' };
        return { language: 'nodejs', runtime: 'node', icon: 'node' };
    }
    async getProjectsFromDir(dirPath, isArchived) {
        if (!(0, fs_1.existsSync)(dirPath))
            return [];
        const entries = await promises_1.default.readdir(dirPath, { withFileTypes: true });
        return await Promise.all(entries.filter(dirent => dirent.isDirectory()).map(async (dirent) => {
            const fullPath = path_1.default.join(dirPath, dirent.name);
            const stat = await promises_1.default.stat(fullPath);
            await this.migrateToExo(fullPath, dirent.name);
            const config = await this.readExoConfig(fullPath, dirent.name);
            const createdAt = stat.birthtime.toLocaleDateString("en-US", {
                month: "long", day: "numeric", year: "numeric"
            });
            const displayName = isArchived
                ? dirent.name.replace(/-\d+$/, "")
                : (config?.project.name ?? dirent.name);
            const status = isArchived ? "Archived" : (config?.state.status ?? "stopped");
            let localUrl = null;
            let tunnelUrl = null;
            if (!isArchived && (status === "running")) {
                const portFile = path_1.default.join(fullPath, '.exocore-port');
                const tunnelFile = path_1.default.join(fullPath, '.exocore-tunnel');
                if ((0, fs_1.existsSync)(portFile)) {
                    try {
                        const port = (0, fs_1.readFileSync)(portFile, 'utf-8').trim();
                        if (port)
                            localUrl = `${this.resolveBaseUrl()}/exocore/port/${port}/`;
                    }
                    catch { }
                }
                if ((0, fs_1.existsSync)(tunnelFile)) {
                    try {
                        const t = (0, fs_1.readFileSync)(tunnelFile, 'utf-8').trim();
                        if (t)
                            tunnelUrl = t;
                    }
                    catch { }
                }
            }
            const detected = this.detectLanguage(fullPath);
            const language = config?.project.language && config.project.language !== "nodejs"
                ? config.project.language
                : detected.language;
            const runtime = config?.project.runtime && config.project.runtime !== "node"
                ? config.project.runtime
                : detected.runtime;
            const icon = config?.project.icon ?? detected.icon ?? language;
            return {
                id: dirent.name,
                name: displayName,
                author: config?.project.author ?? "Unknown",
                description: config?.project.description ?? "No description",
                language,
                runtime,
                icon,
                run: config?.runtime.run ?? "npm start",
                port: config?.runtime.port ?? 3001,
                autoStart: config?.runtime.autoStart ?? false,
                createdAt,
                status,
                localUrl,
                tunnelUrl,
            };
        }));
    }
    listProjects = async (_req, res) => {
        try {
            const active = await this.getProjectsFromDir(this.projectsDir, false);
            const archived = await this.getProjectsFromDir(this.archiveDir, true);
            return res.status(200).json({ projects: [...active, ...archived] });
        }
        catch {
            return res.status(500).json({ error: "failed_to_fetch_projects" });
        }
    };
    createProject = async (req, res) => {
        try {
            const { name, author, description, run, port, files, language, runtime } = req.body;
            if (!name)
                return res.status(400).json({ error: "Project name is required" });
            const safeName = this.sanitizeName(name);
            const projPath = path_1.default.join(this.projectsDir, safeName);
            if ((0, fs_1.existsSync)(projPath))
                return res.status(400).json({ error: "Project already exists" });
            await promises_1.default.mkdir(projPath, { recursive: true });
            const config = (0, exoConfig_1.createDefaultExoConfig)(safeName, author ?? "Developer");
            config.project.description = description ?? "No description provided.";
            config.project.language = language ?? "nodejs";
            config.project.runtime = runtime ?? "node";
            config.runtime.run = run ?? "npm start";
            config.runtime.port = port ?? 3001;
            await promises_1.default.writeFile(path_1.default.join(projPath, "system.exo"), (0, exoConfig_1.serializeExoConfig)(config), "utf-8");
            if (files && typeof files === "object") {
                for (const [filename, content] of Object.entries(files)) {
                    const safeFileName = path_1.default.basename(filename);
                    const filePath = path_1.default.join(projPath, safeFileName);
                    await promises_1.default.writeFile(filePath, content, "utf-8");
                }
            }
            return res.status(200).json({ success: true, projectId: safeName });
        }
        catch (err) {
            console.error("🔥 Error creating project:", err);
            return res.status(500).json({ error: "create_failed" });
        }
    };
    archiveProject = async (req, res) => {
        try {
            const { projectId } = req.body;
            const safeName = this.sanitizeName(projectId);
            const oldPath = path_1.default.join(this.projectsDir, safeName);
            const archiveName = `${safeName}-${Date.now()}`;
            const newPath = path_1.default.join(this.archiveDir, archiveName);
            if (!(0, fs_1.existsSync)(oldPath))
                return res.status(404).json({ error: "Project not found" });
            await promises_1.default.rename(oldPath, newPath);
            return res.status(200).json({ success: true });
        }
        catch {
            return res.status(500).json({ error: "archive_failed" });
        }
    };
    unarchiveProject = async (req, res) => {
        try {
            const { projectId } = req.body;
            const oldPath = path_1.default.join(this.archiveDir, projectId);
            const originalName = projectId.replace(/-\d+$/, "");
            const newPath = path_1.default.join(this.projectsDir, originalName);
            if (!(0, fs_1.existsSync)(oldPath))
                return res.status(404).json({ error: "Archived project not found" });
            if ((0, fs_1.existsSync)(newPath))
                return res.status(400).json({ error: "A project with this name already exists." });
            await promises_1.default.rename(oldPath, newPath);
            return res.status(200).json({ success: true });
        }
        catch {
            return res.status(500).json({ error: "unarchive_failed" });
        }
    };
    deleteProject = async (req, res) => {
        try {
            const { projectId, isArchived } = req.body;
            const targetDir = isArchived ? this.archiveDir : this.projectsDir;
            const projPath = path_1.default.join(targetDir, projectId);
            if (!(0, fs_1.existsSync)(projPath))
                return res.status(404).json({ error: "Project not found" });
            await promises_1.default.rm(projPath, { recursive: true, force: true });
            return res.status(200).json({ success: true });
        }
        catch {
            return res.status(500).json({ error: "delete_failed" });
        }
    };
    renameProject = async (req, res) => {
        try {
            const { projectId, newName } = req.body;
            const safeOldName = this.sanitizeName(projectId);
            const safeNewName = this.sanitizeName(newName);
            const oldPath = path_1.default.join(this.projectsDir, safeOldName);
            const newPath = path_1.default.join(this.projectsDir, safeNewName);
            if (!(0, fs_1.existsSync)(oldPath))
                return res.status(404).json({ error: "Project not found" });
            if ((0, fs_1.existsSync)(newPath))
                return res.status(400).json({ error: "Name already exists" });
            await promises_1.default.rename(oldPath, newPath);
            const exoPath = path_1.default.join(newPath, "system.exo");
            if ((0, fs_1.existsSync)(exoPath)) {
                const content = await promises_1.default.readFile(exoPath, "utf-8");
                const config = (0, exoConfig_1.parseExoConfig)(content);
                config.project.name = safeNewName;
                await promises_1.default.writeFile(exoPath, (0, exoConfig_1.serializeExoConfig)(config), "utf-8");
            }
            return res.status(200).json({ success: true });
        }
        catch {
            return res.status(500).json({ error: "rename_failed" });
        }
    };
}
exports.ProjectsRoute = ProjectsRoute;
