"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuntimeRoute = void 0;
const express_1 = require("express");
const path_1 = __importDefault(require("path"));
const projectManager_1 = require("../../server/services/projectManager");
const exoConfig_1 = require("../../server/lib/exoConfig");
const promises_1 = __importDefault(require("fs/promises"));
const fs_1 = require("fs");
class RuntimeRoute {
    router;
    constructor() {
        this.router = (0, express_1.Router)();
        this.initRoutes();
    }
    initRoutes() {
        this.router.post("/start", this.startProject);
        this.router.post("/stop", this.stopProject);
        this.router.post("/kill", this.killProject);
        this.router.post("/restart", this.restartProject);
        this.router.get("/status/:projectId", this.getStatus);
        this.router.get("/list", this.listRunning);
        this.router.get("/config/:projectId", this.getConfig);
        this.router.post("/config/:projectId", this.saveConfig);
    }
    startProject = async (req, res) => {
        try {
            const { projectId, command, port } = req.body;
            if (!projectId)
                return res.status(400).json({ error: "projectId is required" });
            if (!projectManager_1.projectManager.projectExists(projectId))
                return res.status(404).json({ error: "Project not found" });
            const configPath = projectManager_1.projectManager.getExoConfigPath(projectId);
            let finalCommand = command;
            let finalPort = port;
            if ((0, fs_1.existsSync)(configPath)) {
                const configContent = await promises_1.default.readFile(configPath, "utf-8");
                const config = (0, exoConfig_1.parseExoConfig)(configContent);
                finalCommand = finalCommand || config.runtime.run;
                finalPort = finalPort || config.runtime.port;
            }
            if (!finalCommand)
                return res.status(400).json({ error: "command is required" });
            if (!finalPort)
                return res.status(400).json({ error: "port is required" });
            const cwd = projectManager_1.projectManager.resolveProjectCwd(projectId);
            const project = await projectManager_1.projectManager.start({
                projectId,
                command: finalCommand,
                port: finalPort,
                cwd,
            });
            return res.json({ success: true, pid: project.pid, port: project.port });
        }
        catch (err) {
            const error = err instanceof Error ? err.message : "unknown error";
            return res.status(500).json({ error: "start_failed", message: error });
        }
    };
    stopProject = async (req, res) => {
        try {
            const { projectId } = req.body;
            if (!projectId)
                return res.status(400).json({ error: "projectId is required" });
            const success = projectManager_1.projectManager.stop(projectId);
            return res.json({ success });
        }
        catch (err) {
            const error = err instanceof Error ? err.message : "unknown error";
            return res.status(500).json({ error: "stop_failed", message: error });
        }
    };
    killProject = async (req, res) => {
        try {
            const { projectId } = req.body;
            if (!projectId)
                return res.status(400).json({ error: "projectId is required" });
            const success = projectManager_1.projectManager.stop(projectId);
            return res.json({ success });
        }
        catch (err) {
            const error = err instanceof Error ? err.message : "unknown error";
            return res.status(500).json({ error: "kill_failed", message: error });
        }
    };
    restartProject = async (req, res) => {
        try {
            const { projectId } = req.body;
            if (!projectId)
                return res.status(400).json({ error: "projectId is required" });
            const cwd = projectManager_1.projectManager.resolveProjectCwd(projectId);
            const configPath = projectManager_1.projectManager.getExoConfigPath(projectId);
            let command = "npm start";
            let port = 3001;
            if ((0, fs_1.existsSync)(configPath)) {
                const configContent = await promises_1.default.readFile(configPath, "utf-8");
                const config = (0, exoConfig_1.parseExoConfig)(configContent);
                command = config.runtime.run || command;
                port = config.runtime.port || port;
            }
            const project = await projectManager_1.projectManager.restart({ projectId, command, port, cwd });
            return res.json({ success: true, pid: project.pid, port: project.port });
        }
        catch (err) {
            const error = err instanceof Error ? err.message : "unknown error";
            return res.status(500).json({ error: "restart_failed", message: error });
        }
    };
    getStatus = async (req, res) => {
        try {
            const projectId = req.params.projectId;
            if (!projectId)
                return res.status(400).json({ error: "projectId is required" });
            const status = projectManager_1.projectManager.getStatus(projectId);
            return res.json(status ? { status: status.status, port: status.port } : { status: "stopped" });
        }
        catch (err) {
            const error = err instanceof Error ? err.message : "unknown error";
            return res.status(500).json({ error: "status_failed", message: error });
        }
    };
    listRunning = async (_req, res) => {
        return res.json(projectManager_1.projectManager.listRunning());
    };
    getConfig = async (req, res) => {
        try {
            const projectId = req.params.projectId;
            if (!projectManager_1.projectManager.projectExists(projectId)) {
                return res.status(404).json({ error: "Project not found" });
            }
            const exoPath = projectManager_1.projectManager.getExoConfigPath(projectId);
            const legacyPath = projectManager_1.projectManager.getLegacyConfigPath(projectId);
            if ((0, fs_1.existsSync)(exoPath)) {
                const content = await promises_1.default.readFile(exoPath, "utf-8");
                return res.json((0, exoConfig_1.parseExoConfig)(content));
            }
            else if ((0, fs_1.existsSync)(legacyPath)) {
                const content = await promises_1.default.readFile(legacyPath, "utf-8");
                return res.json(JSON.parse(content));
            }
            return res.json({ error: "No configuration found" });
        }
        catch (err) {
            const error = err instanceof Error ? err.message : "unknown error";
            return res.status(500).json({ error: "config_read_failed", message: error });
        }
    };
    saveConfig = async (req, res) => {
        try {
            const projectId = req.params.projectId;
            const { config } = req.body;
            if (!projectManager_1.projectManager.projectExists(projectId)) {
                return res.status(404).json({ error: "Project not found" });
            }
            const exoPath = projectManager_1.projectManager.getExoConfigPath(projectId);
            const projectDir = path_1.default.dirname(exoPath);
            const exoContent = `project {\n  name = ${config.name ?? projectId}\n  author = ${config.author ?? "Developer"}\n  description = ${config.description ?? "No description"}\n}\n\nruntime {\n  run = ${config.run ?? "npm start"}\n  port = ${config.port ?? 3001}\n  autoStart = ${config.autoStart ?? false}\n}\n\nstate {\n  status = stopped\n}\n`;
            await promises_1.default.mkdir(projectDir, { recursive: true });
            await promises_1.default.writeFile(exoPath, exoContent, "utf-8");
            return res.json({ success: true });
        }
        catch (err) {
            const error = err instanceof Error ? err.message : "unknown error";
            return res.status(500).json({ error: "config_save_failed", message: error });
        }
    };
}
exports.RuntimeRoute = RuntimeRoute;
