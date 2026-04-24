import { Router, Request, Response, RequestHandler } from "express";
import path from "path";
import { projectManager } from "../../server/services/projectManager";

import { parseExoConfig } from "../../server/lib/exoConfig";
import fs from "fs/promises";
import { existsSync } from "fs";

export class RuntimeRoute {
    public router: Router;

    constructor() {
        this.router = Router();
        this.initRoutes();
    }

    private initRoutes(): void {
        this.router.post("/start", this.startProject);
        this.router.post("/stop", this.stopProject);
        this.router.post("/kill", this.killProject);
        this.router.post("/restart", this.restartProject);
        this.router.get("/status/:projectId", this.getStatus);
        this.router.get("/list", this.listRunning);
        this.router.get("/config/:projectId", this.getConfig);
        this.router.post("/config/:projectId", this.saveConfig);
    }

    private startProject: RequestHandler = async (req: Request, res: Response) => {
        try {
            const { projectId, command, port } = req.body as {
                projectId: string;
                command?: string;
                port?: number;
            };

            if (!projectId) return res.status(400).json({ error: "projectId is required" });
            if (!projectManager.projectExists(projectId)) return res.status(404).json({ error: "Project not found" });

            const configPath = projectManager.getExoConfigPath(projectId);
            let finalCommand = command;
            let finalPort = port;

            if (existsSync(configPath)) {
                const configContent = await fs.readFile(configPath, "utf-8");
                const config = parseExoConfig(configContent);
                finalCommand = finalCommand || (config.runtime.run as string);
                finalPort = finalPort || (config.runtime.port as number);
            }

            if (!finalCommand) return res.status(400).json({ error: "command is required" });
            if (!finalPort) return res.status(400).json({ error: "port is required" });

            const cwd = projectManager.resolveProjectCwd(projectId);
            const project = await projectManager.start({
                projectId,
                command: finalCommand,
                port: finalPort,
                cwd,
            });

            
            return res.json({ success: true, pid: project.pid, port: project.port });
        } catch (err) {
            const error = err instanceof Error ? err.message : "unknown error";
            return res.status(500).json({ error: "start_failed", message: error });
        }
    };

    private stopProject: RequestHandler = async (req: Request, res: Response) => {
        try {
            const { projectId } = req.body as { projectId: string };
            if (!projectId) return res.status(400).json({ error: "projectId is required" });

            const success = projectManager.stop(projectId);
            return res.json({ success });
        } catch (err) {
            const error = err instanceof Error ? err.message : "unknown error";
            return res.status(500).json({ error: "stop_failed", message: error });
        }
    };

    private killProject: RequestHandler = async (req: Request, res: Response) => {
        try {
            const { projectId } = req.body as { projectId: string };
            if (!projectId) return res.status(400).json({ error: "projectId is required" });

            const success = projectManager.stop(projectId);
            return res.json({ success });
        } catch (err) {
            const error = err instanceof Error ? err.message : "unknown error";
            return res.status(500).json({ error: "kill_failed", message: error });
        }
    };

    private restartProject: RequestHandler = async (req: Request, res: Response) => {
        try {
            const { projectId } = req.body as { projectId: string };
            if (!projectId) return res.status(400).json({ error: "projectId is required" });

            const cwd = projectManager.resolveProjectCwd(projectId);
            const configPath = projectManager.getExoConfigPath(projectId);

            let command = "npm start";
            let port = 3001;

            if (existsSync(configPath)) {
                const configContent = await fs.readFile(configPath, "utf-8");
                const config = parseExoConfig(configContent);
                command = (config.runtime.run as string) || command;
                port = (config.runtime.port as number) || port;
            }

            const project = await projectManager.restart({ projectId, command, port, cwd });
            return res.json({ success: true, pid: project.pid, port: project.port });
        } catch (err) {
            const error = err instanceof Error ? err.message : "unknown error";
            return res.status(500).json({ error: "restart_failed", message: error });
        }
    };

    private getStatus: RequestHandler = async (req: Request, res: Response) => {
        try {
            
            const projectId = req.params.projectId as string;
            if (!projectId) return res.status(400).json({ error: "projectId is required" });

            const status = projectManager.getStatus(projectId);
            return res.json(status ? { status: status.status, port: status.port } : { status: "stopped" });
        } catch (err) {
            const error = err instanceof Error ? err.message : "unknown error";
            return res.status(500).json({ error: "status_failed", message: error });
        }
    };

    private listRunning: RequestHandler = async (_req: Request, res: Response) => {
        return res.json(projectManager.listRunning());
    };

    private getConfig: RequestHandler = async (req: Request, res: Response) => {
        try {
            
            const projectId = req.params.projectId as string;

            if (!projectManager.projectExists(projectId)) {
                return res.status(404).json({ error: "Project not found" });
            }

            const exoPath = projectManager.getExoConfigPath(projectId);
            const legacyPath = projectManager.getLegacyConfigPath(projectId);

            if (existsSync(exoPath)) {
                const content = await fs.readFile(exoPath, "utf-8");
                return res.json(parseExoConfig(content));
            } else if (existsSync(legacyPath)) {
                const content = await fs.readFile(legacyPath, "utf-8");
                return res.json(JSON.parse(content));
            }

            return res.json({ error: "No configuration found" });
        } catch (err) {
            const error = err instanceof Error ? err.message : "unknown error";
            return res.status(500).json({ error: "config_read_failed", message: error });
        }
    };

    private saveConfig: RequestHandler = async (req: Request, res: Response) => {
        try {
            
            const projectId = req.params.projectId as string;
            const { config } = req.body as { config: Record<string, unknown> };

            if (!projectManager.projectExists(projectId)) {
                return res.status(404).json({ error: "Project not found" });
            }

            const exoPath = projectManager.getExoConfigPath(projectId);
            const projectDir = path.dirname(exoPath);

            const exoContent = `project {\n  name = ${(config.name as string) ?? projectId}\n  author = ${(config.author as string) ?? "Developer"}\n  description = ${(config.description as string) ?? "No description"}\n}\n\nruntime {\n  run = ${(config.run as string) ?? "npm start"}\n  port = ${(config.port as number) ?? 3001}\n  autoStart = ${(config.autoStart as boolean) ?? false}\n}\n\nstate {\n  status = stopped\n}\n`;

            await fs.mkdir(projectDir, { recursive: true });
            await fs.writeFile(exoPath, exoContent, "utf-8");

            return res.json({ success: true });
        } catch (err) {
            const error = err instanceof Error ? err.message : "unknown error";
            return res.status(500).json({ error: "config_save_failed", message: error });
        }
    };
}
