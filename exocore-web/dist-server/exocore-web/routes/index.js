"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
const router = express_1.default.Router();
function walk(dir, basePath = "") {
    let files;
    try {
        files = fs_1.default.readdirSync(dir);
    }
    catch {
        console.warn(`[ROUTES] Cannot read directory: ${dir}`);
        return;
    }
    for (const file of files) {
        if (file === "index.ts" || file === "index.js" || file === "urlData.json")
            continue;
        if (file.startsWith("_"))
            continue;
        const fullPath = path_1.default.join(dir, file);
        let stat;
        try {
            stat = fs_1.default.statSync(fullPath);
        }
        catch {
            continue;
        }
        if (stat.isDirectory()) {
            walk(fullPath, `${basePath}/${file}`);
        }
        else if (file.endsWith(".ts") || file.endsWith(".js")) {
            try {
                const mod = require(fullPath);
                const RouteClass = mod.default ??
                    (Object.values(mod).find((v) => typeof v === "function"));
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
            }
            catch (err) {
                console.error(`[ROUTES] Failed to load ${file}:`, err);
            }
        }
    }
}
walk(__dirname);
exports.default = router;
