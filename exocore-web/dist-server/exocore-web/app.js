"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const compression_1 = __importDefault(require("compression"));
const morgan_1 = __importDefault(require("morgan"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const http_1 = __importDefault(require("http"));
const routes_1 = __importDefault(require("./routes"));
class App {
    app;
    constructor() {
        this.app = (0, express_1.default)();
    }
    async init() {
        this.setupBaseMiddleware();
        this.setupRoutes();
        this.setupProxyRoute();
        this.setupErrorHandling();
    }
    setupBaseMiddleware() {
        this.app.set("trust proxy", 1);
        this.app.set("json spaces", 2);
        this.app.disable("x-powered-by");
        this.app.use((0, helmet_1.default)({ contentSecurityPolicy: false }));
        this.app.use((0, cors_1.default)({ origin: true, credentials: true }));
        this.app.use(express_1.default.json({ limit: "1mb" }));
        this.app.use(express_1.default.urlencoded({ extended: true, limit: "1mb" }));
        this.app.use((0, compression_1.default)());
        this.app.use((0, morgan_1.default)("dev"));
        this.app.use((0, express_rate_limit_1.default)({
            windowMs: 60 * 1000,
            max: process.env.EXOCORE_CAPTURE === "1" ? 100000 : 200,
            standardHeaders: true,
            legacyHeaders: false,
        }));
    }
    setupRoutes() {
        this.app.get("/", (_req, res) => {
            res.redirect("/exocore");
        });
        // Dev panel gate: protect all /exocore/api/* except /exocore/api/dev-access/*.
        // If the panel is initialized, the caller must present a valid Authorization
        // bearer token from the panel session. This prevents bypassing the UI gate
        // by hitting the API directly.
        // Panel-gate disabled: the app uses a single user-account auth system
        // (login/register/dashboard). The dev-panel session has been removed
        // from the UI flow, so /exocore/api/* is no longer dual-gated.
        // Each route is responsible for its own auth (e.g. /auth/* uses the
        // user token; editor routes accept a token query param).
        this.app.use("/exocore/api", (_req, _res, next) => next());
        this.app.use("/exocore/api", routes_1.default);
        const settingsPath = path_1.default.join(__dirname, "settings.json");
        this.app.get("/exocore/settings.json", (_req, res) => {
            if (!fs_1.default.existsSync(settingsPath)) {
                fs_1.default.writeFileSync(settingsPath, JSON.stringify({ theme: "modern" }, null, 4));
            }
            res.setHeader("Content-Type", "application/json");
            res.sendFile(settingsPath);
        });
        this.app.post("/exocore/api/settings", (req, res) => {
            try {
                let currentSettings = {};
                if (fs_1.default.existsSync(settingsPath)) {
                    currentSettings = JSON.parse(fs_1.default.readFileSync(settingsPath, "utf-8"));
                }
                const newSettings = { ...currentSettings, ...req.body };
                fs_1.default.writeFileSync(settingsPath, JSON.stringify(newSettings, null, 4));
                res.json({ success: true, settings: newSettings });
            }
            catch {
                res.status(500).json({ error: "failed_to_save_settings" });
            }
        });
        const distPath = path_1.default.join(__dirname, "dist");
        this.app.use("/exocore", express_1.default.static(distPath));
        this.app.use((req, res, next) => {
            if (req.method === "GET" &&
                req.path.startsWith("/exocore") &&
                !req.path.startsWith("/exocore/api") &&
                !req.path.startsWith("/exocore/port/")) {
                res.sendFile(path_1.default.join(distPath, "index.html"));
            }
            else {
                next();
            }
        });
    }
    setupProxyRoute() {
        const UNSAFE_HEADERS = new Set([
            "host", "connection", "keep-alive",
            "proxy-authenticate", "proxy-authorization",
            "te", "trailer", "transfer-encoding", "upgrade",
        ]);
        const doProxy = (req, res, port, targetPath) => {
            const cleanHeaders = {};
            for (const [key, value] of Object.entries(req.headers)) {
                if (UNSAFE_HEADERS.has(key.toLowerCase()))
                    continue;
                cleanHeaders[key] = Array.isArray(value) ? value[0] : value;
            }
            cleanHeaders["host"] = `localhost:${port}`;
            const options = {
                hostname: "127.0.0.1",
                port,
                path: targetPath,
                method: req.method,
                headers: cleanHeaders,
            };
            const proxyReq = http_1.default.request(options, (proxyRes) => {
                const statusCode = proxyRes.statusCode ?? 200;
                const isRedirect = statusCode >= 300 && statusCode < 400;
                if (isRedirect) {
                    let location = proxyRes.headers.location || '/';
                    try {
                        const parsed = new URL(location, `http://localhost:${port}`);
                        const isLocal = parsed.hostname === 'localhost' ||
                            parsed.hostname === '127.0.0.1' ||
                            parsed.hostname === '0.0.0.0' ||
                            parsed.port === String(port);
                        if (isLocal) {
                            location = parsed.pathname + parsed.search + parsed.hash;
                        }
                    }
                    catch { }
                    if (location.startsWith('/') && !location.startsWith(`/exocore/port/${port}/`)) {
                        location = `/exocore/port/${port}${location}`;
                    }
                    const currentPath = req.path;
                    const locationPath = location.split('?')[0];
                    if (locationPath === currentPath || locationPath === currentPath + '/') {
                        if (!res.headersSent) {
                            res.setHeader("Content-Type", "text/html");
                            res.status(200).send(`
                    <html>
                    <head>
                    <title>Connecting...</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    </head>
                    <body style="background: #111; color: #aaa; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                    <p>Establishing connection...</p>
                    <script>
                    setTimeout(() => {
                        window.location.reload(true);
                    }, 500);
                    </script>
                    </body>
                    </html>
                    `);
                        }
                        return;
                    }
                    res.writeHead(statusCode, { ...proxyRes.headers, location });
                    res.end();
                    return;
                }
                const contentType = proxyRes.headers['content-type'] || '';
                if (contentType.includes('text/html')) {
                    const { ['content-length']: _cl, ['transfer-encoding']: _te, ...safeHeaders } = proxyRes.headers;
                    res.writeHead(statusCode, safeHeaders);
                    let html = '';
                    proxyRes.on('data', (chunk) => { html += chunk.toString(); });
                    proxyRes.on('end', () => {
                        const base = `<base href="/exocore/port/${port}/">`;
                        const patched = html.replace(/<head(\s[^>]*)?>/i, (m) => `${m}${base}`);
                        res.end(patched.includes(base) ? patched : base + patched);
                    });
                }
                else {
                    res.writeHead(statusCode, proxyRes.headers);
                    proxyRes.pipe(res, { end: true });
                }
            });
            proxyReq.on("error", () => {
                if (!res.headersSent) {
                    res.status(502).json({
                        error: "proxy_offline",
                        message: `Could not reach project on port ${port}`,
                    });
                }
            });
            if (req.method !== "GET" && req.method !== "HEAD") {
                req.pipe(proxyReq, { end: true });
            }
            else {
                proxyReq.end();
            }
        };
        this.app.all(/^\/exocore\/port\/(\d+)(\/.*)?$/, (req, res) => {
            const rawPort = req.params[0];
            const subPath = req.params[1];
            if (!rawPort || !/^\d+$/.test(rawPort)) {
                res.status(400).json({ error: "Invalid port: must be numeric" });
                return;
            }
            const port = parseInt(rawPort, 10);
            if (port < 1 || port > 65535) {
                res.status(400).json({ error: "Invalid port: out of range (1-65535)" });
                return;
            }
            if (!subPath) {
                res.redirect(`/exocore/port/${rawPort}/`);
                return;
            }
            const queryStr = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
            const targetPath = subPath + queryStr;
            doProxy(req, res, port, targetPath);
        });
    }
    setupErrorHandling() {
        this.app.use((err, _req, res, next) => {
            console.error("🔥 Server Error:", err);
            if (res.headersSent)
                return next(err);
            res.status(500).json({ error: "internal_server_error" });
        });
    }
    getApp() {
        return this.app;
    }
}
exports.default = App;
