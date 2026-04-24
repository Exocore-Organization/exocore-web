"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const http_1 = __importDefault(require("http"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const ws_1 = require("ws");
const coding_1 = require("./routes/editor/coding");
const exoConfig_1 = require("./server/lib/exoConfig");
const hub_1 = require("./server/social/hub");
const hub_2 = require("./server/rpc/hub");
const wsMux_1 = require("./server/wsMux");
function ensureBuilds() {
    const root = process.cwd();
    const distClient = path_1.default.join(root, "exocore-web", "dist", "index.html");
    console.log("📦 [auto-build] running vite build (client)...");
    const rc = (0, child_process_1.spawnSync)("npx", ["vite", "build", "--config", "exocore-web/vite.config.mts"], { stdio: "inherit", shell: true, cwd: root });
    if (rc.status !== 0)
        console.warn("⚠️  [auto-build] client build exited with code", rc.status);
    console.log("📦 [auto-build] running tsc (server)...");
    const rs = (0, child_process_1.spawnSync)("npx", ["tsc", "-p", "exocore-web/tsconfig.server.json"], { stdio: "inherit", shell: true, cwd: root });
    if (rs.status !== 0)
        console.warn("⚠️  [auto-build] server build exited with code", rs.status);
    if (!fs_1.default.existsSync(distClient)) {
        console.warn("⚠️  [auto-build] dist/index.html still missing after build — check vite.config.ts");
    }
    else {
        console.log("✅ [auto-build] dist/index.html ready.");
    }
}
let TerminalManager = null;
try {
    TerminalManager = require("./routes/editor/shell").TerminalManager;
}
catch (e) {
    console.warn("[index] Terminal manager unavailable (node-pty not compiled for this platform):", e.message);
}
async function resetStaleProjectStatuses() {
    const projectsDir = path_1.default.join(process.cwd(), "projects");
    if (!fs_1.default.existsSync(projectsDir))
        return;
    try {
        const entries = fs_1.default.readdirSync(projectsDir, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory())
                continue;
            const projectPath = path_1.default.join(projectsDir, entry.name);
            const exoPath = path_1.default.join(projectPath, "system.exo");
            if (fs_1.default.existsSync(exoPath)) {
                try {
                    const content = fs_1.default.readFileSync(exoPath, "utf-8");
                    const config = (0, exoConfig_1.parseExoConfig)(content);
                    if (config.state.status === "running") {
                        config.state.status = "stopped";
                        fs_1.default.writeFileSync(exoPath, (0, exoConfig_1.serializeExoConfig)(config), "utf-8");
                    }
                }
                catch { }
            }
            const portFile = path_1.default.join(projectPath, ".exocore-port");
            const tunnelFile = path_1.default.join(projectPath, ".exocore-tunnel");
            try {
                if (fs_1.default.existsSync(portFile))
                    fs_1.default.unlinkSync(portFile);
            }
            catch { }
            try {
                if (fs_1.default.existsSync(tunnelFile))
                    fs_1.default.unlinkSync(tunnelFile);
            }
            catch { }
        }
    }
    catch (err) {
        console.error("⚠️  Error resetting project statuses:", err);
    }
}
async function startServer() {
    ensureBuilds();
    await resetStaleProjectStatuses();
    const appInstance = new app_1.default();
    await appInstance.init();
    const app = appInstance.getApp();
    const server = http_1.default.createServer(app);
    const statusWss = new ws_1.WebSocketServer({ noServer: true });
    const socialWss = (0, hub_1.createSocialWss)();
    const rpcWss = (0, hub_2.createRpcWss)();
    const terminalManager = TerminalManager ? new TerminalManager() : null;
    let lspWss = null;
    try {
        const { createLspWebSocketServer } = require('./routes/editor/_lspBridge');
        lspWss = createLspWebSocketServer();
    }
    catch (err) {
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
    const hubs = { social: socialWss, rpc: rpcWss };
    if (terminalManager)
        hubs.terminal = terminalManager.getWss();
    if (lspWss)
        hubs.lsp = lspWss;
    const muxWss = (0, wsMux_1.createMuxWss)(hubs);
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
        }
        else {
            socket.destroy();
        }
    });
    statusWss.on('connection', (ws, req) => {
        const params = new URLSearchParams(req.url?.split('?')[1]);
        const projectId = params.get('projectId');
        if (projectId)
            coding_1.CodingRoute.handleStatusSync(ws, projectId);
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
