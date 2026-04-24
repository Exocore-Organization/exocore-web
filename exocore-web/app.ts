import express, { Application, Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import compression from "compression";
import morgan from "morgan";
import path from "path";
import fs from "fs";
import http from "http";
import routes from "./routes";

export default class App {
    private app: Application;

    constructor() {
        this.app = express();
    }

    public async init(): Promise<void> {
        this.setupBaseMiddleware();
        this.setupRoutes();
        this.setupProxyRoute();
        this.setupErrorHandling();
    }

    private setupBaseMiddleware(): void {
        this.app.set("trust proxy", 1);
        this.app.set("json spaces", 2);
        this.app.disable("x-powered-by");

        this.app.use(helmet({ contentSecurityPolicy: false }));
        this.app.use(cors({ origin: true, credentials: true }));
        this.app.use(express.json({ limit: "1mb" }));
        this.app.use(express.urlencoded({ extended: true, limit: "1mb" }));
        this.app.use(compression());
        this.app.use(morgan("dev"));

        this.app.use(
            rateLimit({
                windowMs: 60 * 1000,
                max: process.env.EXOCORE_CAPTURE === "1" ? 100000 : 200,
                standardHeaders: true,
                legacyHeaders: false,
            })
        );
    }

    private setupRoutes(): void {
        this.app.get("/", (_req: Request, res: Response) => {
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
        this.app.use("/exocore/api", (_req: Request, _res: Response, next: NextFunction) => next());

        this.app.use("/exocore/api", routes as express.Router);

        const settingsPath = path.join(__dirname, "settings.json");

        this.app.get("/exocore/settings.json", (_req: Request, res: Response) => {
            if (!fs.existsSync(settingsPath)) {
                fs.writeFileSync(settingsPath, JSON.stringify({ theme: "modern" }, null, 4));
            }
            res.setHeader("Content-Type", "application/json");
            res.sendFile(settingsPath);
        });

        this.app.post("/exocore/api/settings", (req: Request, res: Response) => {
            try {
                let currentSettings: Record<string, unknown> = {};
                if (fs.existsSync(settingsPath)) {
                    currentSettings = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
                }
                const newSettings = { ...currentSettings, ...req.body };
                fs.writeFileSync(settingsPath, JSON.stringify(newSettings, null, 4));
                res.json({ success: true, settings: newSettings });
            } catch {
                res.status(500).json({ error: "failed_to_save_settings" });
            }
        });

        const distPath = path.join(__dirname, "dist");
        this.app.use("/exocore", express.static(distPath));

        this.app.use((req: Request, res: Response, next: NextFunction) => {
            if (
                req.method === "GET" &&
                req.path.startsWith("/exocore") &&
                !req.path.startsWith("/exocore/api") &&
                !req.path.startsWith("/exocore/port/")
            ) {
                res.sendFile(path.join(distPath, "index.html"));
            } else {
                next();
            }
        });
    }

    private setupProxyRoute(): void {
        const UNSAFE_HEADERS = new Set([
            "host", "connection", "keep-alive",
            "proxy-authenticate", "proxy-authorization",
            "te", "trailer", "transfer-encoding", "upgrade",
        ]);

        const doProxy = (req: Request, res: Response, port: number, targetPath: string) => {
            const cleanHeaders: Record<string, string> = {};
            for (const [key, value] of Object.entries(req.headers)) {
                if (UNSAFE_HEADERS.has(key.toLowerCase())) continue;
                cleanHeaders[key] = Array.isArray(value) ? value[0] : (value as string);
            }
            cleanHeaders["host"] = `localhost:${port}`;

            const options: http.RequestOptions = {
                hostname: "127.0.0.1",
                port,
                path: targetPath,
                method: req.method,
                headers: cleanHeaders,
            };

            const proxyReq = http.request(options, (proxyRes) => {
                const statusCode = proxyRes.statusCode ?? 200;
                const isRedirect = statusCode >= 300 && statusCode < 400;

                if (isRedirect) {
                    let location = proxyRes.headers.location || '/';
            try {
                const parsed = new URL(location, `http://localhost:${port}`);
                const isLocal =
                parsed.hostname === 'localhost' ||
                parsed.hostname === '127.0.0.1' ||
                parsed.hostname === '0.0.0.0' ||
                parsed.port === String(port);
                if (isLocal) {
                    location = parsed.pathname + parsed.search + parsed.hash;
                }
            } catch { }

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
                proxyRes.on('data', (chunk: Buffer) => { html += chunk.toString(); });
                proxyRes.on('end', () => {
                    const base = `<base href="/exocore/port/${port}/">`;
                    const patched = html.replace(/<head(\s[^>]*)?>/i, (m) => `${m}${base}`);
                    res.end(patched.includes(base) ? patched : base + patched);
                });
            } else {
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
            } else {
                proxyReq.end();
            }
        };

        this.app.all(/^\/exocore\/port\/(\d+)(\/.*)?$/, (req: Request, res: Response) => {
            const rawPort = (req.params as Record<string, string>)[0];
            const subPath  = (req.params as Record<string, string>)[1];

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

    private setupErrorHandling(): void {
        this.app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
            console.error("🔥 Server Error:", err);
            if (res.headersSent) return next(err);
            res.status(500).json({ error: "internal_server_error" });
        });
    }

    public getApp(): Application {
        return this.app;
    }
}
