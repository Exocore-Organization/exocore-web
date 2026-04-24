import { Router, Request, Response, RequestHandler } from "express";
import fs from "fs/promises";
import { existsSync, unlinkSync, readFileSync } from "fs";
import path from "path";
import { parseExoConfig, serializeExoConfig, createDefaultExoConfig } from "../../server/lib/exoConfig";
import type { ExoConfig } from "../../types/dashboard";

export class ProjectsRoute {
    public router: Router;
    private projectsDir: string;
    private archiveDir: string;

    constructor() {
        this.router = Router();
        this.projectsDir = path.join(process.cwd(), "projects");
        this.archiveDir = path.join(process.cwd(), "projects_archive");

        this.ensureDirectories();
        this.initRoutes();
    }

    private async ensureDirectories() {
        try {
            if (!existsSync(this.projectsDir)) await fs.mkdir(this.projectsDir, { recursive: true });
            if (!existsSync(this.archiveDir)) await fs.mkdir(this.archiveDir, { recursive: true });
        } catch (err) {
            console.error("🔥 Error creating directories:", err);
        }
    }

    private initRoutes() {
        this.router.get("/list", this.listProjects);
        this.router.post("/create", this.createProject);
        this.router.post("/archive", this.archiveProject);
        this.router.post("/unarchive", this.unarchiveProject);
        this.router.post("/delete", this.deleteProject);
        this.router.post("/rename", this.renameProject);
    }

    private sanitizeName(name: string): string {
        return name.replace(/[^a-zA-Z0-9_-]/g, "");
    }

    private async migrateToExo(dirPath: string, dirName: string): Promise<void> {
        const legacyPath = path.join(dirPath, ".exocore.json");
        const exoPath = path.join(dirPath, "system.exo");

        if (!existsSync(legacyPath)) return;

        try {
            const raw = await fs.readFile(legacyPath, "utf-8");
            const json = JSON.parse(raw) as {
                name?: string;
                author?: string;
                description?: string;
                run?: string;
                port?: number;
            };

            const config = createDefaultExoConfig(json.name ?? dirName, json.author ?? "Developer");
            config.project.description = json.description ?? "No description";
            config.runtime.run = json.run ?? "npm start";
            config.runtime.port = json.port ?? 3001;

            await fs.writeFile(exoPath, serializeExoConfig(config), "utf-8");
            unlinkSync(legacyPath);
            console.log(`[PROJECTS] Migrated ${dirName}: .exocore.json → system.exo`);
        } catch (err) {
            console.warn(`[PROJECTS] Failed to migrate ${dirName}:`, err);
        }
    }

    private async readExoConfig(dirPath: string, dirName: string): Promise<ExoConfig | null> {
        const exoPath = path.join(dirPath, "system.exo");
        if (!existsSync(exoPath)) return null;
        try {
            const content = await fs.readFile(exoPath, "utf-8");
            return parseExoConfig(content);
        } catch {
            return createDefaultExoConfig(dirName);
        }
    }

    private resolveBaseUrl(): string {
        const serverPort = process.env.PORT || '5000';
        if (process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS) {
            const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS;
            return `https://${domain}`;
        }
        if (process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL) {
            const domain = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL;
            return `https://${domain}`;
        }
        if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
        if (process.env.SPACE_HOST) return `https://${process.env.SPACE_HOST}`;
        if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
        return `http://localhost:${serverPort}`;
    }

    private detectLanguage(projPath: string): { language: string; runtime: string; icon?: string } {
        const has = (f: string) => existsSync(path.join(projPath, f));
        if (has('package.json')) {
            // Sniff package.json deps to give a more specific framework icon
            let icon: string | undefined;
            try {
                const pkg = JSON.parse(readFileSync(path.join(projPath, 'package.json'), 'utf-8'));
                const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) } as Record<string, string>;
                const FRAMEWORK_ICON: Array<[string, string]> = [
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
                    if (deps[dep]) { icon = ic; break; }
                }
            } catch {}
            if (has('bun.lockb') || has('bun.lock')) return { language: 'ts', runtime: 'bun', icon: icon ?? 'bun' };
            if (has('deno.json') || has('deno.jsonc')) return { language: 'ts', runtime: 'deno', icon: icon ?? 'deno' };
            return { language: 'nodejs', runtime: 'node', icon: icon ?? 'node' };
        }
        if (has('deno.json') || has('deno.jsonc')) return { language: 'ts', runtime: 'deno', icon: 'deno' };
        if (has('requirements.txt') || has('pyproject.toml') || has('Pipfile')) return { language: 'python', runtime: 'python', icon: 'python' };
        if (has('Cargo.toml')) return { language: 'rust', runtime: 'cargo', icon: 'rust' };
        if (has('go.mod')) return { language: 'go', runtime: 'go', icon: 'go' };
        if (has('pom.xml') || has('build.gradle') || has('build.gradle.kts')) return { language: 'java', runtime: 'java', icon: 'java' };
        if (has('Gemfile')) return { language: 'ruby', runtime: 'ruby', icon: 'ruby' };
        if (has('composer.json')) return { language: 'php', runtime: 'php', icon: 'php' };
        if (has('mix.exs')) return { language: 'elixir', runtime: 'elixir', icon: 'elixir' };
        if (has('Makefile')) return { language: 'c', runtime: 'gcc', icon: 'c' };
        if (has('CMakeLists.txt')) return { language: 'cpp', runtime: 'cmake', icon: 'cpp' };
        if (has('*.csproj') || has('*.sln')) return { language: 'csharp', runtime: 'dotnet', icon: 'csharp' };
        return { language: 'nodejs', runtime: 'node', icon: 'node' };
    }

    private async getProjectsFromDir(dirPath: string, isArchived: boolean) {
        if (!existsSync(dirPath)) return [];
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        return await Promise.all(
            entries.filter(dirent => dirent.isDirectory()).map(async (dirent) => {
                const fullPath = path.join(dirPath, dirent.name);
                const stat = await fs.stat(fullPath);

                await this.migrateToExo(fullPath, dirent.name);

                const config = await this.readExoConfig(fullPath, dirent.name);
                const createdAt = stat.birthtime.toLocaleDateString("en-US", {
                    month: "long", day: "numeric", year: "numeric"
                });

                const displayName = isArchived
                    ? dirent.name.replace(/-\d+$/, "")
                    : (config?.project.name ?? dirent.name);

                const status = isArchived ? "Archived" : (config?.state.status ?? "stopped");

                let localUrl: string | null = null;
                let tunnelUrl: string | null = null;

                if (!isArchived && (status === "running")) {
                    const portFile = path.join(fullPath, '.exocore-port');
                    const tunnelFile = path.join(fullPath, '.exocore-tunnel');
                    if (existsSync(portFile)) {
                        try {
                            const port = readFileSync(portFile, 'utf-8').trim();
                            if (port) localUrl = `${this.resolveBaseUrl()}/exocore/port/${port}/`;
                        } catch {}
                    }
                    if (existsSync(tunnelFile)) {
                        try {
                            const t = readFileSync(tunnelFile, 'utf-8').trim();
                            if (t) tunnelUrl = t;
                        } catch {}
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
            })
        );
    }

    private listProjects: RequestHandler = async (_req: Request, res: Response) => {
        try {
            const active = await this.getProjectsFromDir(this.projectsDir, false);
            const archived = await this.getProjectsFromDir(this.archiveDir, true);
            return res.status(200).json({ projects: [...active, ...archived] });
        } catch {
            return res.status(500).json({ error: "failed_to_fetch_projects" });
        }
    };

    private createProject: RequestHandler = async (req: Request, res: Response) => {
        try {
            const { name, author, description, run, port, files, language, runtime } = req.body as {
                name: string;
                author?: string;
                description?: string;
                run?: string;
                port?: number;
                files?: Record<string, string>;
                language?: string;
                runtime?: string;
            };

            if (!name) return res.status(400).json({ error: "Project name is required" });

            const safeName = this.sanitizeName(name);
            const projPath = path.join(this.projectsDir, safeName);

            if (existsSync(projPath)) return res.status(400).json({ error: "Project already exists" });

            await fs.mkdir(projPath, { recursive: true });

            const config = createDefaultExoConfig(safeName, author ?? "Developer");
            config.project.description = description ?? "No description provided.";
            config.project.language = language ?? "nodejs";
            config.project.runtime = runtime ?? "node";
            config.runtime.run = run ?? "npm start";
            config.runtime.port = port ?? 3001;

            await fs.writeFile(path.join(projPath, "system.exo"), serializeExoConfig(config), "utf-8");

            if (files && typeof files === "object") {
                for (const [filename, content] of Object.entries(files)) {
                    const safeFileName = path.basename(filename);
                    const filePath = path.join(projPath, safeFileName);
                    await fs.writeFile(filePath, content, "utf-8");
                }
            }

            return res.status(200).json({ success: true, projectId: safeName });
        } catch (err) {
            console.error("🔥 Error creating project:", err);
            return res.status(500).json({ error: "create_failed" });
        }
    };

    private archiveProject: RequestHandler = async (req: Request, res: Response) => {
        try {
            const { projectId } = req.body as { projectId: string };
            const safeName = this.sanitizeName(projectId);
            const oldPath = path.join(this.projectsDir, safeName);
            const archiveName = `${safeName}-${Date.now()}`;
            const newPath = path.join(this.archiveDir, archiveName);

            if (!existsSync(oldPath)) return res.status(404).json({ error: "Project not found" });

            await fs.rename(oldPath, newPath);
            return res.status(200).json({ success: true });
        } catch {
            return res.status(500).json({ error: "archive_failed" });
        }
    };

    private unarchiveProject: RequestHandler = async (req: Request, res: Response) => {
        try {
            const { projectId } = req.body as { projectId: string };
            const oldPath = path.join(this.archiveDir, projectId);
            const originalName = projectId.replace(/-\d+$/, "");
            const newPath = path.join(this.projectsDir, originalName);

            if (!existsSync(oldPath)) return res.status(404).json({ error: "Archived project not found" });
            if (existsSync(newPath)) return res.status(400).json({ error: "A project with this name already exists." });

            await fs.rename(oldPath, newPath);
            return res.status(200).json({ success: true });
        } catch {
            return res.status(500).json({ error: "unarchive_failed" });
        }
    };

    private deleteProject: RequestHandler = async (req: Request, res: Response) => {
        try {
            const { projectId, isArchived } = req.body as { projectId: string; isArchived?: boolean };
            const targetDir = isArchived ? this.archiveDir : this.projectsDir;
            const projPath = path.join(targetDir, projectId);

            if (!existsSync(projPath)) return res.status(404).json({ error: "Project not found" });

            await fs.rm(projPath, { recursive: true, force: true });
            return res.status(200).json({ success: true });
        } catch {
            return res.status(500).json({ error: "delete_failed" });
        }
    };

    private renameProject: RequestHandler = async (req: Request, res: Response) => {
        try {
            const { projectId, newName } = req.body as { projectId: string; newName: string };
            const safeOldName = this.sanitizeName(projectId);
            const safeNewName = this.sanitizeName(newName);

            const oldPath = path.join(this.projectsDir, safeOldName);
            const newPath = path.join(this.projectsDir, safeNewName);

            if (!existsSync(oldPath)) return res.status(404).json({ error: "Project not found" });
            if (existsSync(newPath)) return res.status(400).json({ error: "Name already exists" });

            await fs.rename(oldPath, newPath);

            const exoPath = path.join(newPath, "system.exo");
            if (existsSync(exoPath)) {
                const content = await fs.readFile(exoPath, "utf-8");
                const config = parseExoConfig(content);
                config.project.name = safeNewName;
                await fs.writeFile(exoPath, serializeExoConfig(config), "utf-8");
            }

            return res.status(200).json({ success: true });
        } catch {
            return res.status(500).json({ error: "rename_failed" });
        }
    };
}
