import { Router, Request, Response, RequestHandler } from 'express';
import path from 'path';
import fs from 'fs';
import { parseExoConfig, serializeExoConfig, createDefaultExoConfig } from '../../server/lib/exoConfig';
import {
    getTemplateList,
    copyTemplateToProject,
    type TemplateJson,
} from '../../server/services/templateService';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

// Track in-flight project creations so duplicate requests (React StrictMode
// double-fire, browser retries, network glitches, etc.) don't spam errors.
const inFlightCreates = new Set<string>();

function sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

export class TemplatesRoute {
    public router: Router;

    constructor() {
        this.router = Router();
        this.initRoutes();
    }

    private initRoutes(): void {
        this.router.get('/list', this.listTemplates);
        this.router.post('/create-from-template', this.createFromTemplate);
    }

    private listTemplates: RequestHandler = (_req: Request, res: Response) => {
        try {
            const templates = getTemplateList();
            return res.json({ templates });
        } catch (err) {
            return res.status(500).json({ error: 'Failed to list templates' });
        }
    };

    private createFromTemplate: RequestHandler = async (req: Request, res: Response) => {
        const { templateId, projectName, author, description } = req.body as {
            templateId?: string;
            projectName?: string;
            author?: string;
            description?: string;
        };

        if (!templateId || !projectName) {
            return res.status(400).json({ error: 'templateId and projectName are required' });
        }

        const safeName = sanitizeName(projectName);
        const projectPath = path.join(PROJECTS_DIR, safeName);

        // Reject duplicate concurrent requests for the same project name.
        if (inFlightCreates.has(safeName)) {
            return res.status(409).json({ error: 'A project with this name is already being created. Please wait.' });
        }

        if (fs.existsSync(projectPath)) {
            // Distinguish a real existing project from a stale/orphaned folder
            // (e.g. a previous create that crashed before writing system.exo).
            let entries: string[] = [];
            try { entries = fs.readdirSync(projectPath); } catch {}
            const hasConfig = entries.includes('system.exo') || entries.includes('.exocore.json');
            const isEmpty = entries.length === 0;
            if (hasConfig) {
                return res.status(400).json({ error: 'A project with this name already exists' });
            }
            // Empty or orphaned folder — clean it up and proceed.
            try { fs.rmSync(projectPath, { recursive: true, force: true }); } catch {}
            if (fs.existsSync(projectPath) && !isEmpty) {
                return res.status(400).json({ error: 'A folder with this name exists and could not be cleaned up. Please remove it manually.' });
            }
        }

        // Track files we created so we can roll back on mid-create failure.
        let createdProjectFolder = false;
        inFlightCreates.add(safeName);

        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        // Tell nginx / Replit's proxy NOT to buffer this response.
        res.setHeader('X-Accel-Buffering', 'no');
        // Defensively disable any downstream compression (gzip/brotli) for SSE.
        res.setHeader('Content-Encoding', 'identity');
        res.flushHeaders();

        const send = (status: 'installing' | 'done' | 'error', log: string): void => {
            const payload = JSON.stringify({ status, log });
            res.write(`data: ${payload}\n\n`);
            // Force-flush each event so the browser receives output in real time
            // instead of after the whole install finishes (express buffering /
            // compression middleware otherwise hold chunks back).
            const anyRes = res as unknown as { flush?: () => void };
            if (typeof anyRes.flush === 'function') anyRes.flush();
        };

        // Heartbeat (SSE comment line) every 15s to keep proxies from closing
        // the connection during long npm/pip installs.
        const heartbeat = setInterval(() => {
            try { res.write(': ping\n\n'); } catch {}
        }, 15_000);
        res.on('close', () => clearInterval(heartbeat));

        try {
            send('installing', `[Exocore] Creating project "${safeName}" from template "${templateId}"...\n`);
            await copyTemplateToProject(templateId, safeName);
            createdProjectFolder = true;
            send('installing', `[Exocore] Template files copied.\n`);

            const templateListEntry = getTemplateList().find((t) => t.id === templateId);
            const meta: TemplateJson | null = templateListEntry?.meta ?? null;

            const config = createDefaultExoConfig(safeName, author ?? 'Developer');
            config.project.description = description ?? meta?.description ?? 'No description';
            config.project.language = meta?.language ?? 'nodejs';
            config.project.runtime = meta?.runtime ?? 'node';
            config.project.icon = meta?.icon ?? meta?.language ?? undefined;
            config.runtime.run = meta?.run ?? 'npm start';
            config.runtime.port = meta?.port ?? 3000;

            const exoPath = path.join(projectPath, 'system.exo');
            fs.writeFileSync(exoPath, serializeExoConfig(config), 'utf-8');
            send('installing', '[Exocore] Project configuration written.\n');

            // NOTE: install.sh is intentionally NOT executed here anymore.
            // Dependencies are installed inside the project's own terminal
            // (KittyTerminal) right after the editor opens, so the user sees
            // the real shell output instead of a dashboard log stream and can
            // freely Ctrl-C, retry, or interact with prompts.
            const installScriptPath = path.join(projectPath, 'install.sh');
            if (fs.existsSync(installScriptPath)) {
                try { fs.chmodSync(installScriptPath, 0o755); } catch {}
                send('installing', '[Exocore] install.sh detected — will run inside the project terminal after open.\n');
            }

            send('done', `\n[Exocore] ✓ Project "${safeName}" ready. Opening editor...\n`);
            res.end();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            // Roll back the partial project folder so the user can retry
            // without hitting "already exists" on the next attempt.
            if (createdProjectFolder) {
                try { fs.rmSync(projectPath, { recursive: true, force: true }); } catch {}
            }
            send('error', `[Exocore] Error: ${msg}\n`);
            res.end();
        } finally {
            inFlightCreates.delete(safeName);
        }
    };
}
