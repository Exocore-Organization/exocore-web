import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { ProjectStatus } from "../../types/dashboard";

interface RunningProject {
  pid: number;
  process: ChildProcess;
  port: number;
  status: ProjectStatus;
  startedAt: Date;
  restartCount: number;
}

interface StartOptions {
  projectId: string;
  command: string;
  port: number;
  cwd: string;
  autoRestart?: boolean;
}

class ProjectManager {
  private readonly processes: Map<string, RunningProject> = new Map();
  private readonly projectsDir: string;

  constructor() {
    this.projectsDir = path.join(process.cwd(), "projects");
  }

  start(options: StartOptions): Promise<RunningProject> {
    return new Promise((resolve, reject) => {
      const { projectId, command, port, cwd } = options;

      if (this.processes.has(projectId)) {
        const existing = this.processes.get(projectId)!;
        if (existing.status === "running") {
          return reject(new Error(`Project ${projectId} is already running`));
        }
        this.cleanupProcess(projectId);
      }

      const [cmd, ...args] = command.split(" ");
      const child = spawn(cmd, args, {
        cwd,
        env: { ...process.env, PORT: String(port) },
                          stdio: "pipe",
      });

      const runningProject: RunningProject = {
        pid: child.pid!,
        process: child,
        port,
        status: "running",
        startedAt: new Date(),
                       restartCount: 0,
      };

      this.processes.set(projectId, runningProject);

      child.on("exit", () => {
        const proj = this.processes.get(projectId);
        if (proj) proj.status = "stopped";
      });

        resolve(runningProject);
    });
  }

  stop(projectId: string): boolean {
    const proj = this.processes.get(projectId);
    if (!proj) return false;

    proj.status = "stopped";
    if (!proj.process.killed) {
      proj.process.kill("SIGTERM");
      setTimeout(() => {
        if (!proj.process.killed) proj.process.kill("SIGKILL");
      }, 5000);
    }

    this.cleanupProcess(projectId);
    return true;
  }

  async restart(options: StartOptions): Promise<RunningProject> {
    this.stop(options.projectId);
    await new Promise((r) => setTimeout(r, 1000));
    return this.start(options);
  }

  getStatus(projectId: string): RunningProject | null {
    return this.processes.get(projectId) ?? null;
  }

  listRunning(): Array<{ id: string; pid: number; port: number; status: ProjectStatus; startedAt: Date }> {
    return Array.from(this.processes.entries()).map(([id, proj]) => ({
      id,
      pid: proj.pid,
      port: proj.port,
      status: proj.status,
      startedAt: proj.startedAt,
    }));
  }

  isRunning(projectId: string): boolean {
    const proj = this.processes.get(projectId);
    
    return proj?.status === "running";
  }

  private cleanupProcess(projectId: string): void {
    this.processes.delete(projectId);
  }

  getExoConfigPath(projectId: string): string {
    return path.join(this.projectsDir, projectId, "system.exo");
  }

  getLegacyConfigPath(projectId: string): string {
    return path.join(this.projectsDir, projectId, ".exocore.json");
  }

  resolveProjectCwd(projectId: string): string {
    return path.join(this.projectsDir, projectId);
  }

  projectExists(projectId: string): boolean {
    return fs.existsSync(this.resolveProjectCwd(projectId));
  }
}

export const projectManager = new ProjectManager();
