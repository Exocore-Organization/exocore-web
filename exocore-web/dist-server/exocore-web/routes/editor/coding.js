"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodingRoute = void 0;
const express_1 = require("express");
const promises_1 = __importDefault(require("fs/promises"));
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const archiver_1 = __importDefault(require("archiver"));
const adm_zip_1 = __importDefault(require("adm-zip"));
const multer_1 = __importDefault(require("multer"));
/**
 * Merge an agent-supplied system.exo into the existing one, accepting ONLY
 * keys from the [runtime] section (e.g. run, port). Every other section in
 * the existing file is preserved verbatim. Used to protect the project
 * config from agent overwrites of [project], [meta], etc.
 */
function mergeSystemExoRuntime(existing, incoming) {
    const incLines = incoming.split(/\r?\n/);
    let inRuntime = false;
    const runtimeKv = {};
    for (const line of incLines) {
        const sec = line.match(/^\s*\[([^\]]+)\]\s*$/);
        if (sec) {
            inRuntime = sec[1].trim().toLowerCase() === "runtime";
            continue;
        }
        if (!inRuntime)
            continue;
        const kv = line.match(/^\s*([A-Za-z_][\w-]*)\s*=\s*(.+?)\s*$/);
        if (kv)
            runtimeKv[kv[1]] = kv[2];
    }
    if (Object.keys(runtimeKv).length === 0)
        return existing;
    const out = [];
    const exLines = existing.split(/\r?\n/);
    let curSection = "";
    let runtimeSeen = false;
    const seenKeys = new Set();
    for (const line of exLines) {
        const sec = line.match(/^\s*\[([^\]]+)\]\s*$/);
        if (sec) {
            if (curSection === "runtime") {
                for (const k of Object.keys(runtimeKv)) {
                    if (!seenKeys.has(k))
                        out.push(`${k} = ${runtimeKv[k]}`);
                }
            }
            curSection = sec[1].trim().toLowerCase();
            if (curSection === "runtime")
                runtimeSeen = true;
            out.push(line);
            continue;
        }
        if (curSection === "runtime") {
            const kv = line.match(/^\s*([A-Za-z_][\w-]*)\s*=\s*(.+?)\s*$/);
            if (kv && runtimeKv[kv[1]] !== undefined) {
                out.push(`${kv[1]} = ${runtimeKv[kv[1]]}`);
                seenKeys.add(kv[1]);
                continue;
            }
        }
        out.push(line);
    }
    if (curSection === "runtime") {
        for (const k of Object.keys(runtimeKv)) {
            if (!seenKeys.has(k))
                out.push(`${k} = ${runtimeKv[k]}`);
        }
    }
    if (!runtimeSeen) {
        if (out.length && out[out.length - 1].trim() !== "")
            out.push("");
        out.push("[runtime]");
        for (const k of Object.keys(runtimeKv))
            out.push(`${k} = ${runtimeKv[k]}`);
    }
    return out.join("\n");
}
const upload = (0, multer_1.default)({ dest: "uploads/temp/" });
class CodingRoute {
    router;
    projectsDir;
    constructor() {
        this.router = (0, express_1.Router)();
        this.projectsDir = path_1.default.resolve(process.cwd(), "projects");
        this.initRoutes();
    }
    initRoutes() {
        this.router.get("/files", this.listFiles);
        this.router.get("/read", this.readFile);
        this.router.post("/save", this.saveFile);
        this.router.post("/create", upload.single("file"), this.createItem);
        this.router.post("/delete", this.deleteItem);
        this.router.post("/rename", this.renameItem);
        this.router.post("/move", this.moveItem);
        this.router.get("/download", this.downloadProject);
        this.router.get("/download-file", this.downloadFile);
        this.router.get("/download-folder", this.downloadFolder);
        this.router.post("/extract", upload.single("file"), this.extractZip);
        this.router.get("/media", this.serveMedia);
        this.router.get("/history", this.historyList);
        this.router.post("/history/push", this.historyPush);
        this.router.post("/history/clear", this.historyClear);
    }
    /* ── Per-file edit history persisted inside the project folder so
       Google Drive backups (which zip the whole folder) preserve it. ── */
    static HISTORY_LIMIT = 50;
    static HISTORY_DIR = ".history";
    historyFilePath(projectId, filePath) {
        const safeName = Buffer.from(filePath, "utf-8").toString("base64url") + ".json";
        return this.getFullPath(projectId, path_1.default.join(CodingRoute.HISTORY_DIR, safeName));
    }
    async readHistoryArr(projectId, filePath) {
        try {
            const raw = await promises_1.default.readFile(this.historyFilePath(projectId, filePath), "utf-8");
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        }
        catch {
            return [];
        }
    }
    async writeHistoryArr(projectId, filePath, arr) {
        const full = this.historyFilePath(projectId, filePath);
        await promises_1.default.mkdir(path_1.default.dirname(full), { recursive: true });
        await promises_1.default.writeFile(full, JSON.stringify(arr));
    }
    historyList = async (req, res) => {
        const { projectId, filePath } = req.query;
        if (!projectId || !filePath)
            return res.status(400).json({ error: "missing_params" });
        try {
            const entries = await this.readHistoryArr(projectId, filePath);
            res.json({ entries });
        }
        catch {
            res.status(500).json({ error: "history_list_failed" });
        }
    };
    historyPush = async (req, res) => {
        const { projectId, filePath, content } = req.body;
        if (!projectId || !filePath || typeof content !== "string")
            return res.status(400).json({ error: "missing_params" });
        try {
            const existing = await this.readHistoryArr(projectId, filePath);
            if (existing.length > 0 && existing[0].content === content)
                return res.json({ success: true, skipped: true });
            const next = [{ ts: Date.now(), size: content.length, content }, ...existing].slice(0, CodingRoute.HISTORY_LIMIT);
            await this.writeHistoryArr(projectId, filePath, next);
            res.json({ success: true, count: next.length });
        }
        catch (err) {
            console.error("[CODING] history push failed:", err);
            res.status(500).json({ error: "history_push_failed" });
        }
    };
    historyClear = async (req, res) => {
        const { projectId, filePath } = req.body;
        if (!projectId || !filePath)
            return res.status(400).json({ error: "missing_params" });
        try {
            await promises_1.default.rm(this.historyFilePath(projectId, filePath), { force: true });
            res.json({ success: true });
        }
        catch {
            res.status(500).json({ error: "history_clear_failed" });
        }
    };
    moveItem = async (req, res) => {
        const { projectId, srcPath, destPath } = req.body;
        if (!projectId || !srcPath || !destPath) {
            return res.status(400).json({ error: "projectId, srcPath, and destPath are required" });
        }
        const fullSrc = this.getFullPath(projectId, srcPath);
        const fullDest = this.getFullPath(projectId, destPath);
        if (!(0, fs_1.existsSync)(fullSrc))
            return res.status(404).json({ error: "Source not found" });
        if ((0, fs_1.existsSync)(fullDest))
            return res.status(400).json({ error: "Destination already exists" });
        try {
            await promises_1.default.rename(fullSrc, fullDest);
            return res.status(200).json({ success: true });
        }
        catch (err) {
            console.error("[CODING] Move failed:", err);
            return res.status(500).json({ error: "move_failed" });
        }
    };
    getFullPath(projectId, itemPath = "") {
        const safeId = path_1.default.basename(projectId);
        const projectRoot = path_1.default.join(this.projectsDir, safeId);
        const resolved = path_1.default.resolve(projectRoot, itemPath);
        if (!resolved.startsWith(projectRoot + path_1.default.sep) && resolved !== projectRoot) {
            throw new Error('path_traversal');
        }
        return resolved;
    }
    listFiles = async (req, res) => {
        const { projectId } = req.query;
        const projectPath = this.getFullPath(projectId);
        if (!(0, fs_1.existsSync)(projectPath))
            return res.status(404).json({ error: "not_found" });
        const readRecursive = async (dir) => {
            const entries = await promises_1.default.readdir(dir, { withFileTypes: true });
            return await Promise.all(entries.map(async (entry) => {
                const fullPath = path_1.default.join(dir, entry.name);
                const relativePath = path_1.default.relative(projectPath, fullPath);
                if (entry.isDirectory()) {
                    return {
                        name: entry.name,
                        type: "directory",
                        path: relativePath,
                        children: await readRecursive(fullPath)
                    };
                }
                return { name: entry.name, type: "file", path: relativePath };
            }));
        };
        try {
            res.json({ files: await readRecursive(projectPath) });
        }
        catch (err) {
            res.status(500).json({ error: "list_failed" });
        }
    };
    readFile = async (req, res) => {
        const { projectId, filePath } = req.query;
        try {
            const content = await promises_1.default.readFile(this.getFullPath(projectId, filePath), "utf-8");
            res.json({ content });
        }
        catch (err) {
            res.status(404).json({ error: "read_failed" });
        }
    };
    serveMedia = (req, res) => {
        const { projectId, filePath } = req.query;
        if (!projectId || !filePath)
            return res.status(400).json({ error: "missing_params" });
        const fullPath = this.getFullPath(projectId, filePath);
        if ((0, fs_1.existsSync)(fullPath)) {
            res.sendFile(fullPath);
        }
        else {
            res.status(404).json({ error: "file_not_found" });
        }
    };
    saveFile = async (req, res) => {
        const { projectId, filePath, content } = req.body;
        try {
            const full = this.getFullPath(projectId, filePath);
            const isAgent = String(req.headers["x-exo-source"] || "").toLowerCase() === "agent";
            const isSystemExo = typeof filePath === "string" &&
                filePath.replace(/^\.?\/+/, "").toLowerCase() === "system.exo";
            let toWrite = content;
            if (isAgent && isSystemExo && (0, fs_1.existsSync)(full)) {
                const existing = (0, fs_1.readFileSync)(full, "utf-8");
                toWrite = mergeSystemExoRuntime(existing, String(content ?? ""));
            }
            await promises_1.default.writeFile(full, toWrite);
            res.json({ success: true, merged: isAgent && isSystemExo });
        }
        catch (err) {
            res.status(500).json({ error: "save_failed" });
        }
    };
    createItem = async (req, res) => {
        const { projectId, filePath, type } = req.body;
        const file = req.file;
        const fullPath = this.getFullPath(projectId, filePath);
        try {
            if (type === "directory") {
                await promises_1.default.mkdir(fullPath, { recursive: true });
            }
            else {
                await promises_1.default.mkdir(path_1.default.dirname(fullPath), { recursive: true });
                if (file) {
                    await promises_1.default.rename(file.path, fullPath);
                }
                else {
                    await promises_1.default.writeFile(fullPath, "");
                }
            }
            res.json({ success: true });
        }
        catch (err) {
            console.error("Create Item Error:", err);
            res.status(500).json({ error: "create_failed" });
        }
    };
    deleteItem = async (req, res) => {
        const { projectId, filePath } = req.body;
        const fullPath = this.getFullPath(projectId, filePath);
        try {
            await promises_1.default.rm(fullPath, { recursive: true, force: true });
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: "delete_failed" });
        }
    };
    renameItem = async (req, res) => {
        const { projectId, oldPath, newPath } = req.body;
        const fullOldPath = this.getFullPath(projectId, oldPath);
        const fullNewPath = this.getFullPath(projectId, newPath);
        try {
            await promises_1.default.rename(fullOldPath, fullNewPath);
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: "rename_failed" });
        }
    };
    downloadFile = async (req, res) => {
        const { projectId, filePath } = req.query;
        if (!projectId || !filePath)
            return res.status(400).json({ error: "missing_params" });
        const fullPath = this.getFullPath(projectId, filePath);
        if (!(0, fs_1.existsSync)(fullPath))
            return res.status(404).json({ error: "not_found" });
        const fileName = path_1.default.basename(fullPath);
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.sendFile(fullPath);
    };
    downloadFolder = async (req, res) => {
        const { projectId, folderPath } = req.query;
        if (!projectId || !folderPath)
            return res.status(400).json({ error: "missing_params" });
        const fullPath = this.getFullPath(projectId, folderPath);
        if (!(0, fs_1.existsSync)(fullPath))
            return res.status(404).json({ error: "not_found" });
        const folderName = path_1.default.basename(fullPath);
        res.attachment(`${folderName}.zip`);
        const archive = (0, archiver_1.default)("zip", { zlib: { level: 9 } });
        archive.pipe(res);
        archive.directory(fullPath, folderName);
        archive.on("error", (err) => res.status(500).send({ error: err.message }));
        await archive.finalize();
    };
    downloadProject = async (req, res) => {
        const { projectId } = req.query;
        const projectPath = this.getFullPath(projectId);
        if (!(0, fs_1.existsSync)(projectPath))
            return res.status(404).json({ error: "project_not_found" });
        res.attachment(`${projectId}.zip`);
        const archive = (0, archiver_1.default)("zip", { zlib: { level: 9 } });
        archive.pipe(res);
        archive.directory(projectPath, false);
        archive.on("error", (err) => res.status(500).send({ error: err.message }));
        await archive.finalize();
    };
    extractZip = async (req, res) => {
        const { projectId, targetPath } = req.body;
        const file = req.file;
        if (!file)
            return res.status(400).json({ error: "no_file" });
        const extractionPath = this.getFullPath(projectId, targetPath || "");
        try {
            const zip = new adm_zip_1.default(file.path);
            await promises_1.default.mkdir(extractionPath, { recursive: true });
            zip.extractAllTo(extractionPath, true);
            await promises_1.default.unlink(file.path);
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: "unzip_failed" });
        }
    };
    static handleStatusSync(ws, projectId) {
        const configPath = path_1.default.join(process.cwd(), "projects", projectId, ".exocore.json");
        const updateStatus = (status) => {
            try {
                if ((0, fs_1.existsSync)(configPath)) {
                    const config = JSON.parse((0, fs_1.readFileSync)(configPath, 'utf-8'));
                    config.status = status;
                    (0, fs_1.writeFileSync)(configPath, JSON.stringify(config, null, 4));
                }
            }
            catch (err) {
                console.error("Status sync failed:", err);
            }
        };
        updateStatus("Active");
        ws.on('close', () => updateStatus("Online"));
    }
}
exports.CodingRoute = CodingRoute;
