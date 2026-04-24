import { WebSocket, WebSocketServer } from 'ws';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';
import type { IncomingMessage } from 'http';

interface LspSession {
    proc: ChildProcess;
    ws: WebSocket;
    buffer: Buffer;
}

const PROJECTS_ROOT = path.join(process.cwd(), 'exocore-projects');

function resolveProjectDir(projectId: string): string {
    
    const safe = projectId.replace(/[^a-zA-Z0-9_\-]/g, '');
    const dir = path.join(PROJECTS_ROOT, safe);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
}

function spawnTypescriptLanguageServer(cwd: string): ChildProcess {
    const cmd = process.execPath; 
    const tsserverBin = require.resolve('typescript-language-server/lib/cli.mjs');
    const proc = spawn(cmd, [tsserverBin, '--stdio'], {
        cwd,
        env: { ...process.env, NODE_OPTIONS: '' },
        stdio: ['pipe', 'pipe', 'pipe'],
    });
    proc.stderr?.on('data', (d) => {
        
        if (process.env.LSP_DEBUG) console.error('[LSP stderr]', d.toString());
    });
    return proc;
}



function readLspMessages(buffer: Buffer): { messages: string[]; rest: Buffer } {
    const messages: string[] = [];
    let buf = buffer;
    while (true) {
        const headerEnd = buf.indexOf('\r\n\r\n');
        if (headerEnd === -1) break;
        const header = buf.slice(0, headerEnd).toString('ascii');
        const match = /Content-Length:\s*(\d+)/i.exec(header);
        if (!match) {
            
            buf = buf.slice(headerEnd + 4);
            continue;
        }
        const length = parseInt(match[1], 10);
        const totalNeeded = headerEnd + 4 + length;
        if (buf.length < totalNeeded) break;
        const body = buf.slice(headerEnd + 4, totalNeeded).toString('utf8');
        messages.push(body);
        buf = buf.slice(totalNeeded);
    }
    return { messages, rest: buf };
}

function writeLspMessage(proc: ChildProcess, jsonText: string): void {
    if (!proc.stdin || proc.stdin.destroyed) return;
    const body = Buffer.from(jsonText, 'utf8');
    const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii');
    proc.stdin.write(Buffer.concat([header, body]));
}

export interface LspAdapter {
    send: (jsonText: string) => void;
}

export interface LspHandle {
    sendMessage: (jsonText: string) => void;
    close: () => void;
}

/** Spawn a typescript-language-server for `projectId` and bridge LSP framed
 *  messages to/from the adapter. Used by both the legacy `/exocore/api/editor/lsp/ts`
 *  WSS endpoint and the new `editor.lsp.session` RPC stream. */
export function attachLspSession(projectId: string, adapter: LspAdapter): LspHandle {
    if (!projectId) throw new Error('projectId required');
    const cwd = resolveProjectDir(projectId);
    const proc = spawnTypescriptLanguageServer(cwd);

    let buffer: Buffer = Buffer.alloc(0) as Buffer;
    let closed = false;

    proc.stdout?.on('data', (chunk: Buffer) => {
        if (closed) return;
        buffer = Buffer.concat([buffer, chunk]);
        const { messages, rest } = readLspMessages(buffer);
        buffer = rest as Buffer;
        for (const msg of messages) {
            try { adapter.send(msg); } catch {}
        }
    });

    proc.on('exit', () => { closed = true; });

    return {
        sendMessage: (jsonText: string) => { if (!closed) writeLspMessage(proc, jsonText); },
        close: () => {
            if (closed) return;
            closed = true;
            try { proc.kill('SIGTERM'); } catch {}
        },
    };
}

export function createLspWebSocketServer(): WebSocketServer {
    const wss = new WebSocketServer({ noServer: true });

    wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
        const url = new URL(req.url || '', `http://${req.headers.host}`);
        const projectId = url.searchParams.get('projectId');
        if (!projectId) {
            ws.close(1008, 'missing projectId');
            return;
        }

        const cwd = resolveProjectDir(projectId);
        let proc: ChildProcess;
        try {
            proc = spawnTypescriptLanguageServer(cwd);
        } catch (err) {
            console.error('[LSP] failed to spawn typescript-language-server:', err);
            ws.close(1011, 'lsp_spawn_failed');
            return;
        }

        const session: LspSession = { proc, ws, buffer: Buffer.alloc(0) };

        proc.stdout?.on('data', (chunk: Buffer) => {
            session.buffer = Buffer.concat([session.buffer, chunk]);
            const { messages, rest } = readLspMessages(session.buffer);
            session.buffer = rest;
            for (const msg of messages) {
                if (ws.readyState === ws.OPEN) ws.send(msg);
            }
        });

        proc.on('exit', (code) => {
            if (process.env.LSP_DEBUG) console.error('[LSP] tsserver exit', code);
            if (ws.readyState === ws.OPEN) ws.close(1011, `lsp_exit_${code}`);
        });

        ws.on('message', (data: Buffer | string) => {
            const text = typeof data === 'string' ? data : data.toString('utf8');
            writeLspMessage(proc, text);
        });

        ws.on('close', () => {
            try { proc.kill('SIGTERM'); } catch {}
        });
        ws.on('error', () => {
            try { proc.kill('SIGTERM'); } catch {}
        });
    });

    return wss;
}
