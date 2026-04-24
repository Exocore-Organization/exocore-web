import { WebSocketServer, WebSocket } from 'ws';
import { spawn, exec, ChildProcess } from 'child_process';

let pty: typeof import('node-pty') | null = null;
try { pty = require('node-pty'); } catch { pty = null; }
import os from 'os';
import path from 'path';
import { existsSync, readFileSync, writeFileSync, realpathSync } from 'fs';
import { Router } from 'express';
import { parseExoConfig, serializeExoConfig } from '../../server/lib/exoConfig';

const getShell = () => {
    if (os.platform() === 'win32') return process.env.COMSPEC || 'powershell.exe';
    const fishPath = '/usr/bin/fish';
    if (existsSync(fishPath)) return fishPath;
    return process.env.SHELL || '/bin/bash';
};

const getListeningPorts = (): Promise<Set<string>> => {
    return new Promise((resolve) => {
        const isWin = os.platform() === 'win32';
        const cmd = isWin ? 'netstat -ano | findstr LISTEN' : 'ss -lnt || netstat -lnt';
        exec(cmd, (_err, stdout) => {
            const ports = new Set<string>();
            if (stdout) {
                const lines = stdout.split('\n');
                for (const line of lines) {
                    if (line.toLowerCase().includes('listen')) {
                        const tokens = line.trim().split(/\s+/);
                        for (const token of tokens) {
                            const portMatch = token.match(/(?:[0-9\.]+|::|\[::\]|\*)[:\.](\d+)$/);
                            if (portMatch && parseInt(portMatch[1]) > 1024) ports.add(portMatch[1]);
                        }
                    }
                }
            }
            resolve(ports);
        });
    });
};

const RAPID_EXIT_THRESHOLD_MS = 8000;
const MAX_RAPID_RESTARTS = 3;
const PAUSE_AFTER_RAPID_RESTARTS_MS = 30000;

export interface ConsoleAdapter {
    send: (data: string) => void;
}

export interface ConsoleHandle {
    sendInput: (text: string) => void | Promise<void>;
    close: () => void;
}

interface ActiveConsole {
    process: ChildProcess;
    history: string;
    tunnelProcess?: ChildProcess;
    localUrl?: string;
    tunnelUrl?: string;
    detectedPort?: string;
    isRestarting?: boolean;
    isUserStopped?: boolean;
    cwd: string;
    runCmd: string;
    listeners: Set<WebSocket>;
    adapterListeners: Set<ConsoleAdapter>;
    startedAt?: number;
    rapidRestartCount: number;
    pausedUntil?: number;
}

let terminalManagerSingleton: TerminalManager | null = null;
export function getTerminalManager(): TerminalManager | null {
    return terminalManagerSingleton;
}

export interface PtyHandle {
    sendInput: (text: string) => void;
    resize: (cols: number, rows: number) => void;
    close: () => void;
}

/** Spawn an interactive PTY (or fall back to a child shell when node-pty is
 *  unavailable) and stream output to the adapter. Mirrors the non-`console`
 *  branch of TerminalManager.initRoutes — kept as a standalone export so the
 *  RPC `editor.shell.pty` stream can call it without touching the WSS path. */
export function attachPty(
    opts: { cols?: number; rows?: number; user?: string; projectId?: string; cwd?: string },
    adapter: ConsoleAdapter,
): PtyHandle {
    if (!pty) {
        adapter.send('\x1b[33m[Exocore] Interactive terminal unavailable: node-pty is not compiled for this platform.\r\nUse the Console (Logs) tab to run your project.\x1b[0m\r\n');
        return { sendInput: () => {}, resize: () => {}, close: () => {} };
    }
    const cols = Math.max(1, Math.min(500, opts.cols ?? 80));
    const rows = Math.max(1, Math.min(200, opts.rows ?? 24));
    const promptUser = (opts.user || 'guest').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 32) || 'guest';

    let cwd = opts.cwd || process.cwd();
    if (opts.projectId && !opts.cwd) {
        const projectsDir = path.resolve(process.cwd(), 'projects');
        const candidate = path.join(projectsDir, opts.projectId);
        if (existsSync(candidate)) cwd = candidate;
    }

    const shell = getShell();
    const BL = '\\[\\e[1;34m\\]';
    const RS = '\\[\\e[0m\\]';
    const bashPS1 = `${BL}${promptUser}@exocore${RS} ${BL}\\w${RS} $ `;
    const zshPS1  = `%F{blue}%B${promptUser}@exocore%b%f %F{blue}%~%f $ `;
    const fishPrompt = `function fish_prompt; set_color -o blue; echo -n '${promptUser}@exocore '; set_color blue; echo -n (prompt_pwd); set_color normal; echo -n ' $ '; end`;

    const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols, rows,
        cwd,
        env: {
            ...process.env,
            PS1: bashPS1,
            PROMPT: zshPS1,
            TERM: 'xterm-256color',
            EXO_USER: promptUser,
        },
    });

    setTimeout(() => {
        try {
            const shellName = (shell.split('/').pop() || '').toLowerCase();
            if (shellName.includes('zsh')) {
                ptyProcess.write(`PROMPT='${zshPS1}'\rclear\r`);
            } else if (shellName.includes('fish')) {
                ptyProcess.write(`${fishPrompt}\rclear\r`);
            } else {
                ptyProcess.write(`export PS1='${bashPS1}'\rclear\r`);
            }
        } catch {}
    }, 250);

    let closed = false;
    ptyProcess.onData((data: string) => { if (!closed) try { adapter.send(data); } catch {} });
    ptyProcess.onExit?.(() => { closed = true; });

    return {
        sendInput: (text: string) => { if (!closed) try { ptyProcess.write(text); } catch {} },
        resize: (c: number, r: number) => {
            if (closed) return;
            try { ptyProcess.resize(Math.max(1, c | 0), Math.max(1, r | 0)); } catch {}
        },
        close: () => {
            if (closed) return;
            closed = true;
            try { ptyProcess.kill(); } catch {}
        },
    };
}

export class TerminalManager {
    private wss: WebSocketServer;
    private projectsDir: string;
    public router: Router;
    private activeConsoles: Map<string, ActiveConsole> = new Map();

    constructor() {
        this.projectsDir = path.resolve(process.cwd(), "projects");
        this.router = Router();
        this.wss = new WebSocketServer({ noServer: true });
        this.initRoutes();
        terminalManagerSingleton = this;
    }

    public getWss() { return this.wss; }

    private updateProjectStatus(cwd: string, status: "running" | "stopped") {
        const exoPath = path.join(cwd, 'system.exo');
        if (existsSync(exoPath)) {
            try {
                const config = parseExoConfig(readFileSync(exoPath, 'utf-8'));
                config.state.status = status;
                writeFileSync(exoPath, serializeExoConfig(config), 'utf-8');
            } catch (e) { console.error("[shell] system.exo status update failed:", e); }
        }
    }

    private broadcast(projectId: string, data: string) {
        const active = this.activeConsoles.get(projectId);
        if (!active) return;
        for (const ws of active.listeners) {
            if (ws.readyState === WebSocket.OPEN) ws.send(data);
        }
        for (const ad of active.adapterListeners) {
            try { ad.send(data); } catch {}
        }
    }

    /** Attach a non-WebSocket consumer (e.g. RPC stream) to the project's
     *  console. Mirrors the `type === 'console'` branch in initRoutes but
     *  accepts a generic adapter so the same machinery powers both the
     *  legacy WSS endpoint and the new `editor.shell.console` RPC stream. */
    public async attachConsole(
        projectId: string,
        adapter: ConsoleAdapter,
        opts?: { forceRestart?: boolean },
    ): Promise<ConsoleHandle> {
        if (!projectId) throw new Error("projectId required");

        let cwd = process.cwd();
        const projectPath = path.join(this.projectsDir, projectId);
        if (existsSync(projectPath)) cwd = projectPath;

        if (opts?.forceRestart && this.activeConsoles.has(projectId)) {
            const a = this.activeConsoles.get(projectId)!;
            a.isUserStopped = true;
            await this.killProcessTree(a.process, a.detectedPort);
            if (a.tunnelProcess) await this.killProcessTree(a.tunnelProcess);
            this.activeConsoles.delete(projectId);
        }

        if (this.activeConsoles.has(projectId)) {
            const active = this.activeConsoles.get(projectId)!;
            active.adapterListeners.add(adapter);
            if (active.history) adapter.send(active.history);
            if (active.localUrl) adapter.send(`\r\n[EXOCORE_LOCAL_URL:${active.localUrl}]\r\n`);
            if (active.tunnelUrl) adapter.send(`\r\n[EXOCORE_TUNNEL_URL:${active.tunnelUrl}]\r\n`);
            return {
                sendInput: async (text: string) => {
                    if (text === '\x03') {
                        active.isUserStopped = true;
                        await this.killProcessTree(active.process, active.detectedPort);
                    } else {
                        active.process.stdin?.write(text);
                    }
                },
                close: () => { active.adapterListeners.delete(adapter); },
            };
        }

        const exoPath = path.join(cwd, 'system.exo');
        let runCmd = '';
        if (existsSync(exoPath)) {
            try { runCmd = parseExoConfig(readFileSync(exoPath, 'utf-8')).runtime.run ?? ''; } catch {}
        }
        if (!runCmd) {
            adapter.send('\x1b[31m[Exocore] No "run" command in system.exo. Edit runtime.run to fix.\x1b[0m');
            return { sendInput: () => {}, close: () => {} };
        }

        const active: ActiveConsole = {
            process: {} as ChildProcess,
            history: '',
            cwd,
            runCmd,
            listeners: new Set(),
            adapterListeners: new Set([adapter]),
            rapidRestartCount: 0,
        };
        this.activeConsoles.set(projectId, active);
        this.startProcess(projectId);

        return {
            sendInput: async (text: string) => {
                if (text === '\x03') {
                    active.isUserStopped = true;
                    await this.killProcessTree(active.process, active.detectedPort);
                } else {
                    active.process.stdin?.write(text);
                }
            },
            close: () => { active.adapterListeners.delete(adapter); },
        };
    }

    private async killProcessTree(cp: ChildProcess, port?: string) {
        if (!cp || !cp.pid) return;
        if (port) await this.killProcessByPort(port);
        try {
            if (os.platform() === 'win32') exec(`taskkill /pid ${cp.pid} /f /t`);
            else process.kill(-cp.pid, 'SIGKILL');
        } catch (e) {}
    }

    private killOrphanProcesses(cwd: string): Promise<void> {
        if (os.platform() === 'win32') {
            return new Promise((resolve) => {
                exec(`wmic process get ProcessId,ExecutablePath 2>NUL`, (_err, stdout) => {
                    const kills: Promise<void>[] = [];
                    for (const line of stdout.split('\n').slice(1)) {
                        const parts = line.trim().split(/\s+/);
                        const pid = parts[parts.length - 1];
                        const exePath = parts.slice(0, -1).join(' ');
                        if (pid && exePath && exePath.startsWith(cwd) && parseInt(pid) !== process.pid) {
                            kills.push(new Promise<void>(r => {
                                exec(`taskkill /f /pid ${pid} 2>NUL`, () => r());
                            }));
                        }
                    }
                    Promise.all(kills).then(() => resolve());
                });
            });
        }
        return new Promise((resolve) => {
            exec(`ls /proc/*/cwd 2>/dev/null`, (_err, stdout) => {
                const lines = stdout.split('\n').filter(Boolean);
                const kills: Promise<void>[] = [];
                for (const line of lines) {
                    try {
                        const realPath = realpathSync(line);
                        if (realPath === cwd) {
                            const pid = line.match(/\/proc\/(\d+)\/cwd/)?.[1];
                            if (pid && parseInt(pid) !== process.pid) {
                                kills.push(new Promise<void>(r => {
                                    exec(`kill -9 ${pid} 2>/dev/null || true`, () => r());
                                }));
                            }
                        }
                    } catch {}
                }
                Promise.all(kills).then(() => resolve());
            });
        });
    }

    private killProcessByPort(port: string): Promise<void> {
        if (parseInt(port) < 1024) return Promise.resolve();
        return new Promise((resolve) => {
            const cmd = os.platform() === 'win32'
                ? `for /f "tokens=5" %a in ('netstat -aon ^| findstr :${port} ^| findstr LISTENING') do taskkill /f /pid %a`
                : `fuser -k ${port}/tcp || true`;
            exec(cmd, () => resolve());
        });
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
        if (process.env.RENDER_EXTERNAL_URL) {
            return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
        }
        if (process.env.SPACE_HOST) {
            return `https://${process.env.SPACE_HOST}`;
        }
        if (process.env.VERCEL_URL) {
            return `https://${process.env.VERCEL_URL}`;
        }
        return `http://localhost:${serverPort}`;
    }

    private sendWebviewUrl(projectId: string, port: string) {
        const activeData = this.activeConsoles.get(projectId);
        if (!activeData) return;

        const proxyUrl = `${this.resolveBaseUrl()}/exocore/port/${port}/`;

        activeData.localUrl = proxyUrl;
        activeData.tunnelUrl = undefined;
        this.broadcast(projectId, `\r\n[EXOCORE_LOCAL_URL:${proxyUrl}]\r\n`);

        const tunnelProcess = spawn('cloudflared', ['tunnel', '--url', `http://127.0.0.1:${port}`], {
            detached: os.platform() !== 'win32',
        });

        activeData.tunnelProcess = tunnelProcess;
        tunnelProcess.on('error', () => {});

        tunnelProcess.stderr?.on('data', (data) => {
            const str = data.toString();
            const match = str.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
            if (match) {
                activeData.tunnelUrl = match[0];
                try { writeFileSync(path.join(this.projectsDir, projectId, '.exocore-tunnel'), match[0], 'utf-8'); } catch {}
                this.broadcast(projectId, `\r\n[EXOCORE_TUNNEL_URL:${match[0]}]\r\n`);
            }
        });
    }

    private async startProcess(projectId: string): Promise<void> {
        const active = this.activeConsoles.get(projectId);
        if (!active) return;

        if (active.pausedUntil && Date.now() < active.pausedUntil) {
            const remaining = Math.ceil((active.pausedUntil - Date.now()) / 1000);
            this.broadcast(projectId, `\r\n\x1b[31m[Auto-restart paused. Too many rapid exits. Retrying in ${remaining}s...]\x1b[0m\r\n\x1b[90mClick Restart to force start now.\x1b[0m\r\n`);
            setTimeout(() => {
                if (this.activeConsoles.has(projectId) && !active.isUserStopped) {
                    active.pausedUntil = undefined;
                    active.rapidRestartCount = 0;
                    this.startProcess(projectId);
                }
            }, active.pausedUntil - Date.now());
            return;
        }

        const { cwd, runCmd } = active;

        if (active.detectedPort) {
            this.killProcessByPort(active.detectedPort).catch(() => {});
        }

        const portFile = path.join(cwd, '.exocore-port');
        if (!active.detectedPort && existsSync(portFile)) {
            try {
                const savedPort = readFileSync(portFile, 'utf-8').trim();
                if (savedPort) await this.killProcessByPort(savedPort);
            } catch {}
        }

        this.killOrphanProcesses(cwd).catch(() => {});

        active.isRestarting = false;
        active.isUserStopped = false;
        active.detectedPort = undefined;
        active.startedAt = Date.now();

        this.broadcast(projectId, `\r\n\x1b[1;32m▶ Running: ${runCmd}\x1b[0m\r\n\r\n`);

        getListeningPorts().then(initialPorts => {
            if (!this.activeConsoles.has(projectId) || active.isUserStopped) return;

            const cp = spawn(runCmd, {
                shell: true,
                cwd,
                detached: os.platform() !== 'win32',
                stdio: ['ignore', 'pipe', 'pipe'],
                env: { ...process.env, FORCE_COLOR: '1' }
            });

            active.process = cp;
            this.updateProjectStatus(cwd, "running");

            let portFound = false;

            const portPoller = setInterval(async () => {
                if (portFound || !this.activeConsoles.has(projectId)) return clearInterval(portPoller);
                const currentPorts = await getListeningPorts();
                for (const port of currentPorts) {
                    if (!initialPorts.has(port)) {
                        portFound = true;
                        active.detectedPort = port;
                        active.rapidRestartCount = 0;
                        try { writeFileSync(path.join(cwd, '.exocore-port'), port, 'utf-8'); } catch {}
                        this.sendWebviewUrl(projectId, port);
                        clearInterval(portPoller);
                        break;
                    }
                }
            }, 2000);

            const handleOutput = (data: Buffer | string) => {
                const rawStr = data.toString();
                const formatted = rawStr.replace(/\n/g, '\r\n');
                active.history += formatted;

                if (rawStr.includes('EADDRINUSE') && !active.isRestarting) {
                    const portMatch = rawStr.match(/port:\s*(\d+)/i) || rawStr.match(/address already in use .*[:](\d+)/);
                    const busyPort = portMatch ? portMatch[1] : null;
                    if (busyPort) {
                        active.isRestarting = true;
                        this.broadcast(projectId, `\r\n\x1b[31m[!] Port ${busyPort} busy. Auto-cleaning...\x1b[0m\r\n`);
                        this.killProcessByPort(busyPort).then(() => {
                            this.killProcessTree(cp).then(() => {
                                setTimeout(() => {
                                    if (this.activeConsoles.has(projectId)) this.startProcess(projectId);
                                }, 2000);
                            });
                        });
                        return;
                    }
                }

                if (!active.detectedPort) {
                    const match = rawStr.match(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})/i)
                        || rawStr.match(/port\s+(\d{2,5})/i);
                    if (match && parseInt(match[1]) > 1024) {
                        portFound = true;
                        active.detectedPort = match[1];
                        active.rapidRestartCount = 0;
                        try { writeFileSync(path.join(cwd, '.exocore-port'), match[1], 'utf-8'); } catch {}
                        this.sendWebviewUrl(projectId, match[1]);
                    }
                }

                this.broadcast(projectId, formatted);
            };

            cp.stdout?.on('data', handleOutput);
            cp.stderr?.on('data', handleOutput);

            cp.on('exit', (code) => {
                clearInterval(portPoller);
                if (active.isRestarting) return;

                if (active.isUserStopped || code === 0) {
                    if (active.tunnelProcess) this.killProcessTree(active.tunnelProcess);
                    this.activeConsoles.delete(projectId);
                    this.updateProjectStatus(cwd, "stopped");
                    const msg = code === 0
                        ? '\r\n\x1b[33m[Process exited cleanly (code 0). Press Restart to run again.]\x1b[0m\r\n'
                        : '\r\n\x1b[31m[Process Stopped]\x1b[0m\r\n';
                    this.broadcast(projectId, msg);
                    return;
                }

                this.updateProjectStatus(cwd, "stopped");

                const uptime = Date.now() - (active.startedAt ?? Date.now());
                const isRapidExit = uptime < RAPID_EXIT_THRESHOLD_MS;

                if (isRapidExit) {
                    active.rapidRestartCount = (active.rapidRestartCount ?? 0) + 1;
                } else {
                    active.rapidRestartCount = 0;
                }

                if (active.rapidRestartCount >= MAX_RAPID_RESTARTS) {
                    active.pausedUntil = Date.now() + PAUSE_AFTER_RAPID_RESTARTS_MS;
                    this.broadcast(projectId, `\r\n\x1b[31m[Process keeps crashing (code ${code ?? '?'}). Auto-restart paused for 30s.]\x1b[0m\r\n\x1b[90mFix the issue or click Restart to try again.\x1b[0m\r\n`);
                    setTimeout(() => {
                        if (this.activeConsoles.has(projectId) && !active.isUserStopped) {
                            active.pausedUntil = undefined;
                            active.rapidRestartCount = 0;
                            this.startProcess(projectId);
                        }
                    }, PAUSE_AFTER_RAPID_RESTARTS_MS);
                    return;
                }

                const delay = isRapidExit ? 5000 : 3000;
                this.broadcast(projectId, `\r\n\x1b[33m[Process exited (code ${code ?? '?'}). Restarting in ${delay / 1000}s...]\x1b[0m\r\n`);

                setTimeout(() => {
                    if (this.activeConsoles.has(projectId) && !active.isUserStopped) {
                        active.history = '';
                        this.startProcess(projectId);
                    }
                }, delay);
            });
        });
    }

    private initRoutes() {
        this.wss.on('connection', async (ws: WebSocket, req) => {
            const url = new URL(req.url || '', `http://${req.headers.host}`);
            const projectId = url.searchParams.get('projectId');
            const type = url.searchParams.get('type') || 'terminal';
            const forceRestart = url.searchParams.get('forceRestart') === 'true';
            const promptUser = (url.searchParams.get('user') || 'guest').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 32) || 'guest';

            let cwd = process.cwd();
            if (projectId) {
                const projectPath = path.join(this.projectsDir, projectId);
                if (existsSync(projectPath)) cwd = projectPath;
            }

            if (type === 'console' && projectId) {
                if (forceRestart && this.activeConsoles.has(projectId)) {
                    const active = this.activeConsoles.get(projectId)!;
                    active.isUserStopped = true;
                    await this.killProcessTree(active.process, active.detectedPort);
                    if (active.tunnelProcess) await this.killProcessTree(active.tunnelProcess);
                    this.activeConsoles.delete(projectId);
                }

                if (this.activeConsoles.has(projectId)) {
                    const active = this.activeConsoles.get(projectId)!;
                    active.listeners.add(ws);

                    if (active.history) ws.send(active.history);
                    if (active.localUrl) ws.send(`\r\n[EXOCORE_LOCAL_URL:${active.localUrl}]\r\n`);
                    if (active.tunnelUrl) ws.send(`\r\n[EXOCORE_TUNNEL_URL:${active.tunnelUrl}]\r\n`);

                    ws.on('message', async (msg) => {
                        const text = msg.toString();
                        if (text === '\x03') {
                            active.isUserStopped = true;
                            await this.killProcessTree(active.process, active.detectedPort);
                        } else {
                            active.process.stdin?.write(text);
                        }
                    });

                    ws.on('close', () => {
                        active.listeners.delete(ws);
                    });

                    return;
                }

                const exoPath = path.join(cwd, 'system.exo');
                let runCmd = '';
                if (existsSync(exoPath)) {
                    try {
                        runCmd = parseExoConfig(readFileSync(exoPath, 'utf-8')).runtime.run ?? '';
                    } catch { }
                }

                if (!runCmd) {
                    ws.send('\x1b[31m[Exocore] No "run" command in system.exo. Edit runtime.run to fix.\x1b[0m');
                    return;
                }

                const active: ActiveConsole = {
                    process: {} as ChildProcess,
                    history: '',
                    cwd,
                    runCmd,
                    listeners: new Set([ws]),
                    adapterListeners: new Set(),
                    rapidRestartCount: 0,
                };
                this.activeConsoles.set(projectId, active);

                ws.on('message', async (msg) => {
                    const text = msg.toString();
                    if (text === '\x03') {
                        active.isUserStopped = true;
                        await this.killProcessTree(active.process, active.detectedPort);
                    } else {
                        active.process.stdin?.write(text);
                    }
                });

                ws.on('close', () => {
                    active.listeners.delete(ws);
                });

                this.startProcess(projectId);

            } else {
                if (!pty) {
                    ws.send('\x1b[33m[Exocore] Interactive terminal unavailable: node-pty is not compiled for this platform.\r\nUse the Console (Logs) tab to run your project.\x1b[0m\r\n');
                    ws.close();
                    return;
                }
                const shell = getShell();
                // Blue prompt: username@exocore <cwd> $
                const BL = '\\[\\e[1;34m\\]';
                const RS = '\\[\\e[0m\\]';
                const bashPS1 = `${BL}${promptUser}@exocore${RS} ${BL}\\w${RS} $ `;
                const zshPS1  = `%F{blue}%B${promptUser}@exocore%b%f %F{blue}%~%f $ `;
                const fishPrompt = `function fish_prompt; set_color -o blue; echo -n '${promptUser}@exocore '; set_color blue; echo -n (prompt_pwd); set_color normal; echo -n ' $ '; end`;

                const ptyProcess = pty.spawn(shell, [], {
                    name: 'xterm-256color',
                    cwd,
                    env: {
                        ...process.env,
                        PS1: bashPS1,
                        PROMPT: zshPS1,
                        TERM: 'xterm-256color',
                        EXO_USER: promptUser,
                    },
                });

                // Inject the prompt override after the shell has finished sourcing rc files,
                // then clear so the user sees only the clean prompt.
                setTimeout(() => {
                    try {
                        const shellName = (shell.split('/').pop() || '').toLowerCase();
                        if (shellName.includes('zsh')) {
                            ptyProcess.write(`PROMPT='${zshPS1}'\rclear\r`);
                        } else if (shellName.includes('fish')) {
                            ptyProcess.write(`${fishPrompt}\rclear\r`);
                        } else {
                            ptyProcess.write(`export PS1='${bashPS1}'\rclear\r`);
                        }
                    } catch {}
                }, 250);

                ptyProcess.onData((data) => { if (ws.readyState === WebSocket.OPEN) ws.send(data); });
                ws.on('message', (msg) => ptyProcess.write(msg.toString()));
                ws.on('close', () => ptyProcess.kill());
            }
        });
    }
}
