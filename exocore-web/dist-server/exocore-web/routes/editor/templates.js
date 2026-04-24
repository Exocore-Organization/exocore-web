"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplatesRoute = void 0;
const express_1 = require("express");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const exoConfig_1 = require("../../server/lib/exoConfig");
const templateService_1 = require("../../server/services/templateService");
const PROJECTS_DIR = path_1.default.join(process.cwd(), 'projects');
// Track in-flight project creations so duplicate requests (React StrictMode
// double-fire, browser retries, network glitches, etc.) don't spam errors.
const inFlightCreates = new Set();
function sanitizeName(name) {
    return name.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}
class TemplatesRoute {
    router;
    constructor() {
        this.router = (0, express_1.Router)();
        this.initRoutes();
    }
    initRoutes() {
        this.router.get('/list', this.listTemplates);
        this.router.post('/create-from-template', this.createFromTemplate);
    }
    listTemplates = (_req, res) => {
        try {
            const templates = (0, templateService_1.getTemplateList)();
            return res.json({ templates });
        }
        catch (err) {
            return res.status(500).json({ error: 'Failed to list templates' });
        }
    };
    createFromTemplate = async (req, res) => {
        const { templateId, projectName, author, description } = req.body;
        if (!templateId || !projectName) {
            return res.status(400).json({ error: 'templateId and projectName are required' });
        }
        const safeName = sanitizeName(projectName);
        const projectPath = path_1.default.join(PROJECTS_DIR, safeName);
        // Reject duplicate concurrent requests for the same project name.
        if (inFlightCreates.has(safeName)) {
            return res.status(409).json({ error: 'A project with this name is already being created. Please wait.' });
        }
        if (fs_1.default.existsSync(projectPath)) {
            // Distinguish a real existing project from a stale/orphaned folder
            // (e.g. a previous create that crashed before writing system.exo).
            let entries = [];
            try {
                entries = fs_1.default.readdirSync(projectPath);
            }
            catch { }
            const hasConfig = entries.includes('system.exo') || entries.includes('.exocore.json');
            const isEmpty = entries.length === 0;
            if (hasConfig) {
                return res.status(400).json({ error: 'A project with this name already exists' });
            }
            // Empty or orphaned folder — clean it up and proceed.
            try {
                fs_1.default.rmSync(projectPath, { recursive: true, force: true });
            }
            catch { }
            if (fs_1.default.existsSync(projectPath) && !isEmpty) {
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
        const send = (status, log) => {
            const payload = JSON.stringify({ status, log });
            res.write(`data: ${payload}\n\n`);
            // Force-flush each event so the browser receives output in real time
            // instead of after the whole install finishes (express buffering /
            // compression middleware otherwise hold chunks back).
            const anyRes = res;
            if (typeof anyRes.flush === 'function')
                anyRes.flush();
        };
        // Heartbeat (SSE comment line) every 15s to keep proxies from closing
        // the connection during long npm/pip installs.
        const heartbeat = setInterval(() => {
            try {
                res.write(': ping\n\n');
            }
            catch { }
        }, 15_000);
        res.on('close', () => clearInterval(heartbeat));
        try {
            send('installing', `[Exocore] Creating project "${safeName}" from template "${templateId}"...\n`);
            await (0, templateService_1.copyTemplateToProject)(templateId, safeName);
            createdProjectFolder = true;
            send('installing', `[Exocore] Template files copied.\n`);
            const templateListEntry = (0, templateService_1.getTemplateList)().find((t) => t.id === templateId);
            const meta = templateListEntry?.meta ?? null;
            const config = (0, exoConfig_1.createDefaultExoConfig)(safeName, author ?? 'Developer');
            config.project.description = description ?? meta?.description ?? 'No description';
            config.project.language = meta?.language ?? 'nodejs';
            config.project.runtime = meta?.runtime ?? 'node';
            config.project.icon = meta?.icon ?? meta?.language ?? undefined;
            config.runtime.run = meta?.run ?? 'npm start';
            config.runtime.port = meta?.port ?? 3000;
            const exoPath = path_1.default.join(projectPath, 'system.exo');
            fs_1.default.writeFileSync(exoPath, (0, exoConfig_1.serializeExoConfig)(config), 'utf-8');
            send('installing', '[Exocore] Project configuration written.\n');
            // NOTE: install.sh is intentionally NOT executed here anymore.
            // Dependencies are installed inside the project's own terminal
            // (KittyTerminal) right after the editor opens, so the user sees
            // the real shell output instead of a dashboard log stream and can
            // freely Ctrl-C, retry, or interact with prompts.
            const installScriptPath = path_1.default.join(projectPath, 'install.sh');
            if (fs_1.default.existsSync(installScriptPath)) {
                try {
                    fs_1.default.chmodSync(installScriptPath, 0o755);
                }
                catch { }
                send('installing', '[Exocore] install.sh detected — will run inside the project terminal after open.\n');
            }
            send('done', `\n[Exocore] ✓ Project "${safeName}" ready. Opening editor...\n`);
            res.end();
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            // Roll back the partial project folder so the user can retry
            // without hitting "already exists" on the next attempt.
            if (createdProjectFolder) {
                try {
                    fs_1.default.rmSync(projectPath, { recursive: true, force: true });
                }
                catch { }
            }
            send('error', `[Exocore] Error: ${msg}\n`);
            res.end();
        }
        finally {
            inFlightCreates.delete(safeName);
        }
    };
}
exports.TemplatesRoute = TemplatesRoute;
