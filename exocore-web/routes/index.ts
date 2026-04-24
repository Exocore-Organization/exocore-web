import fs from "fs";
import path from "path";
import express from "express";

const router = express.Router();

interface RouteInstance {
    router: express.Router;
}

type RouteConstructor = new () => RouteInstance;

interface RouteModule {
    default?: RouteConstructor;
    [key: string]: RouteConstructor | undefined;
}

function walk(dir: string, basePath = ""): void {
    let files: string[];

    try {
        files = fs.readdirSync(dir);
    } catch {
        console.warn(`[ROUTES] Cannot read directory: ${dir}`);
        return;
    }

    for (const file of files) {
        if (file === "index.ts" || file === "index.js" || file === "urlData.json") continue;
        if (file.startsWith("_")) continue;

        const fullPath = path.join(dir, file);

        let stat: fs.Stats;
        try {
            stat = fs.statSync(fullPath);
        } catch {
            continue;
        }

        if (stat.isDirectory()) {
            walk(fullPath, `${basePath}/${file}`);
        } else if (file.endsWith(".ts") || file.endsWith(".js")) {
            try {
                
                const mod = require(fullPath) as RouteModule;

                const RouteClass =
                    mod.default ??
                    (Object.values(mod).find(
                        (v): v is RouteConstructor => typeof v === "function"
                    ));

                if (typeof RouteClass !== "function") {
                    console.warn(`[ROUTES] Skipping ${file}: not a constructor class`);
                    continue;
                }

                const instance = new RouteClass();

                if (!instance.router) {
                    console.warn(`[ROUTES] Skipping ${file}: no router property`);
                    continue;
                }

                const routeName = file.replace(/\.(ts|js)$/, "");
                const fullRoute = `${basePath}/${routeName}`;

                router.use(fullRoute, instance.router);
                console.log(`[ROUTES] Loaded: ${fullRoute}`);
            } catch (err) {
                console.error(`[ROUTES] Failed to load ${file}:`, err);
            }
        }
    }
}

walk(__dirname);

export default router;
