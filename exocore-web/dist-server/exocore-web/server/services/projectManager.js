"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectManager = void 0;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
class ProjectManager {
    processes = new Map();
    projectsDir;
    constructor() {
        this.projectsDir = path_1.default.join(process.cwd(), "projects");
    }
    start(options) {
        return new Promise((resolve, reject) => {
            const { projectId, command, port, cwd } = options;
            if (this.processes.has(projectId)) {
                const existing = this.processes.get(projectId);
                if (existing.status === "running") {
                    return reject(new Error(`Project ${projectId} is already running`));
                }
                this.cleanupProcess(projectId);
            }
            const [cmd, ...args] = command.split(" ");
            const child = (0, child_process_1.spawn)(cmd, args, {
                cwd,
                env: { ...process.env, PORT: String(port) },
                stdio: "pipe",
            });
            const runningProject = {
                pid: child.pid,
                process: child,
                port,
                status: "running",
                startedAt: new Date(),
                restartCount: 0,
            };
            this.processes.set(projectId, runningProject);
            child.on("exit", () => {
                const proj = this.processes.get(projectId);
                if (proj)
                    proj.status = "stopped";
            });
            resolve(runningProject);
        });
    }
    stop(projectId) {
        const proj = this.processes.get(projectId);
        if (!proj)
            return false;
        proj.status = "stopped";
        if (!proj.process.killed) {
            proj.process.kill("SIGTERM");
            setTimeout(() => {
                if (!proj.process.killed)
                    proj.process.kill("SIGKILL");
            }, 5000);
        }
        this.cleanupProcess(projectId);
        return true;
    }
    async restart(options) {
        this.stop(options.projectId);
        await new Promise((r) => setTimeout(r, 1000));
        return this.start(options);
    }
    getStatus(projectId) {
        return this.processes.get(projectId) ?? null;
    }
    listRunning() {
        return Array.from(this.processes.entries()).map(([id, proj]) => ({
            id,
            pid: proj.pid,
            port: proj.port,
            status: proj.status,
            startedAt: proj.startedAt,
        }));
    }
    isRunning(projectId) {
        const proj = this.processes.get(projectId);
        return proj?.status === "running";
    }
    cleanupProcess(projectId) {
        this.processes.delete(projectId);
    }
    getExoConfigPath(projectId) {
        return path_1.default.join(this.projectsDir, projectId, "system.exo");
    }
    getLegacyConfigPath(projectId) {
        return path_1.default.join(this.projectsDir, projectId, ".exocore.json");
    }
    resolveProjectCwd(projectId) {
        return path_1.default.join(this.projectsDir, projectId);
    }
    projectExists(projectId) {
        return fs_1.default.existsSync(this.resolveProjectCwd(projectId));
    }
}
exports.projectManager = new ProjectManager();
