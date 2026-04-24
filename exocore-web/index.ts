import App from "./app";
import http from "http";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { WebSocketServer } from "ws";
import { CodingRoute } from "./routes/editor/coding";
import { parseExoConfig, serializeExoConfig } from "./server/lib/exoConfig";
import { createSocialWss } from "./server/social/hub";
import { createRpcWss } from "./server/rpc/hub";
import { createMuxWss } from "./server/wsMux";

function ensureBuilds() {
    const root = process.cwd();
    const distClient = path.join(root, "exocore-web", "dist", "index.html");

    console.log("📦 [auto-build] running vite build (client)...");
    const rc = spawnSync("npx", ["vite", "build", "--config", "exocore-web/vite.config.mts"],
        { stdio: "inherit", shell: true, cwd: root });
    if (rc.status !== 0) console.warn("⚠️  [auto-build] client build exited with code", rc.status);

    console.log("📦 [auto-build] running tsc (server)...");
    const rs = spawnSync("npx", ["tsc", "-p", "exocore-web/tsconfig.server.json"],
        { stdio: "inherit", shell: true, cwd: root });
    if (rs.status !== 0) console.warn("⚠️  [auto-build] server build exited with code", rs.status);

    if (!fs.existsSync(distClient)) {
        console.warn("⚠️  [auto-build] dist/index.html still missing after build — check vite.config.ts");
    } else {
        console.log("✅ [auto-build] dist/index.html ready.");
    }
}

let TerminalManager: (new () => { getWss: () => WebSocketServer; router: import('express').Router }) | null = null;
try {
    
    TerminalManager = (require("./routes/editor/shell") as { TerminalManager: typeof TerminalManager }).TerminalManager;
} catch (e) {
    console.warn("[index] Terminal manager unavailable (node-pty not compiled for this platform):", (e as Error).message);
}

async function resetStaleProjectStatuses() {
    const projectsDir = path.join(process.cwd(), "projects");
    if (!fs.existsSync(projectsDir)) return;
    try {
        const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const projectPath = path.join(projectsDir, entry.name);
            const exoPath = path.join(projectPath, "system.exo");

            if (fs.existsSync(exoPath)) {
                try {
                    const content = fs.readFileSync(exoPath, "utf-8");
                    const config = parseExoConfig(content);
                    if (config.state.status === "running") {
                        config.state.status = "stopped";
                        fs.writeFileSync(exoPath, serializeExoConfig(config), "utf-8");
                    }
                } catch {}
            }

            const portFile = path.join(projectPath, ".exocore-port");
            const tunnelFile = path.join(projectPath, ".exocore-tunnel");
            try { if (fs.existsSync(portFile)) fs.unlinkSync(portFile); } catch {}
            try { if (fs.existsSync(tunnelFile)) fs.unlinkSync(tunnelFile); } catch {}
        }
    } catch (err) {
        console.error("⚠️  Error resetting project statuses:", err);
    }
}

async function startServer() {
    ensureBuilds();
    await resetStaleProjectStatuses();
    const appInstance = new App();
    await appInstance.init();
    const app = appInstance.getApp();


    const server = http.createServer(app);

    const statusWss = new WebSocketServer({ noServer: true });
    const socialWss = createSocialWss();
    const rpcWss = createRpcWss();
    const terminalManager = TerminalManager ? new TerminalManager() : null;

    
    let lspWss: WebSocketServer | null = null;
    try {
        const { createLspWebSocketServer } = require('./routes/editor/_lspBridge');
        lspWss = createLspWebSocketServer();
    } catch (err) {
        console.warn('⚠️  LSP bridge unavailable:', err instanceof Error ? err.message : err);
    }

    // Single multiplexed WSS endpoint for browser ↔ gateway: one carrier
    // socket carries every named channel — currently `social`, `rpc`,
    // `terminal`, and `lsp`. Phase 8h removed the legacy
    // `/exocore/ws/social` + `/exocore/ws/rpc` endpoints. Phase 8k
    // (this commit) removes the legacy `/exocore/terminal` and
    // `/exocore/api/editor/lsp/ts` upgrade paths — every browser caller
    // now opens these hubs through the mux carrier as named channels
    // (`terminal#…`, `lsp#…`). Channel keys use `hubName#instanceId`
    // so multiple terminal tabs / LSP sessions share the carrier in
    // parallel.
    const hubs: Record<string, WebSocketServer> = { social: socialWss, rpc: rpcWss };
    if (terminalManager) hubs.terminal = terminalManager.getWss();
    if (lspWss) hubs.lsp = lspWss;
    const muxWss = createMuxWss(hubs);

    server.on('upgrade', (request, socket, head) => {
        const { pathname } = new URL(request.url || '', `http://${request.headers.host}`);

        if (pathname === '/exocore/ws') {
            muxWss.handleUpgrade(request, socket, head, (ws) => {
                muxWss.emit('connection', ws, request);
            });
        }
        else if (pathname === '/') {
            statusWss.handleUpgrade(request, socket, head, (ws) => {
                statusWss.emit('connection', ws, request);
            });
        } else {
            socket.destroy();
        }
    });

    statusWss.on('connection', (ws, req) => {
        const params = new URLSearchParams(req.url?.split('?')[1]);
        const projectId = params.get('projectId');
        if (projectId) CodingRoute.handleStatusSync(ws, projectId);
    });

        const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;
        server.listen(PORT, '0.0.0.0', () => {
            console.clear();
            console.log(`\x1b[32m%s\x1b[0m`, `-----------------------------------------`);
            console.log(`🚀 EXOCORE SYSTEM IS NOW LIVE`);
            console.log(`📡 REAL-TIME FS WATCHER ENABLED`);
            console.log(`🔗 URL: http://localhost:${PORT}/exocore`);
            console.log(`\x1b[32m%s\x1b[0m`, `-----------------------------------------`);
        });
}

startServer().catch(err => {
    console.error("🔥 Server failed:", err);
});
