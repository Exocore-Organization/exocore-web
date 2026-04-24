import { Router, RequestHandler } from "express";
import fs from "fs/promises";
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { WebSocket } from "ws";
import archiver from "archiver";
import AdmZip from "adm-zip";
import multer from "multer";

interface FileNode {
    name: string;
    type: "file" | "directory";
    path: string;
    children?: FileNode[];
}

interface ProjectConfig {
    name?: string;
    status?: string;
    [key: string]: unknown;
}

/**
 * Merge an agent-supplied system.exo into the existing one, accepting ONLY
 * keys from the [runtime] section (e.g. run, port). Every other section in
 * the existing file is preserved verbatim. Used to protect the project
 * config from agent overwrites of [project], [meta], etc.
 */
function mergeSystemExoRuntime(existing: string, incoming: string): string {
    const incLines = incoming.split(/\r?\n/);
    let inRuntime = false;
    const runtimeKv: Record<string, string> = {};
    for (const line of incLines) {
        const sec = line.match(/^\s*\[([^\]]+)\]\s*$/);
        if (sec) { inRuntime = sec[1].trim().toLowerCase() === "runtime"; continue; }
        if (!inRuntime) continue;
        const kv = line.match(/^\s*([A-Za-z_][\w-]*)\s*=\s*(.+?)\s*$/);
        if (kv) runtimeKv[kv[1]] = kv[2];
    }
    if (Object.keys(runtimeKv).length === 0) return existing;

    const out: string[] = [];
    const exLines = existing.split(/\r?\n/);
    let curSection = "";
    let runtimeSeen = false;
    const seenKeys = new Set<string>();
    for (const line of exLines) {
        const sec = line.match(/^\s*\[([^\]]+)\]\s*$/);
        if (sec) {
            if (curSection === "runtime") {
                for (const k of Object.keys(runtimeKv)) {
                    if (!seenKeys.has(k)) out.push(`${k} = ${runtimeKv[k]}`);
                }
            }
            curSection = sec[1].trim().toLowerCase();
            if (curSection === "runtime") runtimeSeen = true;
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
            if (!seenKeys.has(k)) out.push(`${k} = ${runtimeKv[k]}`);
        }
    }
    if (!runtimeSeen) {
        if (out.length && out[out.length - 1].trim() !== "") out.push("");
        out.push("[runtime]");
        for (const k of Object.keys(runtimeKv)) out.push(`${k} = ${runtimeKv[k]}`);
    }
    return out.join("\n");
}


const upload = multer({ dest: "uploads/temp/" });

export class CodingRoute {
    public router: Router;
    private projectsDir: string;

    constructor() {
        this.router = Router();
        this.projectsDir = path.resolve(process.cwd(), "projects");
        this.initRoutes();
    }

    private initRoutes() {
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
    private static readonly HISTORY_LIMIT = 50;
    private static readonly HISTORY_DIR = ".history";

    private historyFilePath(projectId: string, filePath: string): string {
        const safeName = Buffer.from(filePath, "utf-8").toString("base64url") + ".json";
        return this.getFullPath(projectId, path.join(CodingRoute.HISTORY_DIR, safeName));
    }

    private async readHistoryArr(projectId: string, filePath: string): Promise<Array<{ ts: number; size: number; content: string }>> {
        try {
            const raw = await fs.readFile(this.historyFilePath(projectId, filePath), "utf-8");
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch { return []; }
    }

    private async writeHistoryArr(projectId: string, filePath: string, arr: Array<{ ts: number; size: number; content: string }>): Promise<void> {
        const full = this.historyFilePath(projectId, filePath);
        await fs.mkdir(path.dirname(full), { recursive: true });
        await fs.writeFile(full, JSON.stringify(arr));
    }

    private historyList: RequestHandler = async (req, res) => {
        const { projectId, filePath } = req.query;
        if (!projectId || !filePath) return res.status(400).json({ error: "missing_params" });
        try {
            const entries = await this.readHistoryArr(projectId as string, filePath as string);
            res.json({ entries });
        } catch { res.status(500).json({ error: "history_list_failed" }); }
    };

    private historyPush: RequestHandler = async (req, res) => {
        const { projectId, filePath, content } = req.body as { projectId: string; filePath: string; content: string };
        if (!projectId || !filePath || typeof content !== "string") return res.status(400).json({ error: "missing_params" });
        try {
            const existing = await this.readHistoryArr(projectId, filePath);
            if (existing.length > 0 && existing[0].content === content) return res.json({ success: true, skipped: true });
            const next = [{ ts: Date.now(), size: content.length, content }, ...existing].slice(0, CodingRoute.HISTORY_LIMIT);
            await this.writeHistoryArr(projectId, filePath, next);
            res.json({ success: true, count: next.length });
        } catch (err) { console.error("[CODING] history push failed:", err); res.status(500).json({ error: "history_push_failed" }); }
    };

    private historyClear: RequestHandler = async (req, res) => {
        const { projectId, filePath } = req.body as { projectId: string; filePath: string };
        if (!projectId || !filePath) return res.status(400).json({ error: "missing_params" });
        try {
            await fs.rm(this.historyFilePath(projectId, filePath), { force: true });
            res.json({ success: true });
        } catch { res.status(500).json({ error: "history_clear_failed" }); }
    };

    private moveItem: RequestHandler = async (req, res) => {
        const { projectId, srcPath, destPath } = req.body as {
            projectId: string;
            srcPath: string;
            destPath: string;
        };

        if (!projectId || !srcPath || !destPath) {
            return res.status(400).json({ error: "projectId, srcPath, and destPath are required" });
        }

        const fullSrc = this.getFullPath(projectId, srcPath);
        const fullDest = this.getFullPath(projectId, destPath);

        if (!existsSync(fullSrc)) return res.status(404).json({ error: "Source not found" });
        if (existsSync(fullDest)) return res.status(400).json({ error: "Destination already exists" });

        try {
            await fs.rename(fullSrc, fullDest);
            return res.status(200).json({ success: true });
        } catch (err) {
            console.error("[CODING] Move failed:", err);
            return res.status(500).json({ error: "move_failed" });
        }
    };

    private getFullPath(projectId: string, itemPath: string = ""): string {
        const safeId = path.basename(projectId);
        const projectRoot = path.join(this.projectsDir, safeId);
        const resolved = path.resolve(projectRoot, itemPath);
        if (!resolved.startsWith(projectRoot + path.sep) && resolved !== projectRoot) {
            throw new Error('path_traversal');
        }
        return resolved;
    }

    private listFiles: RequestHandler = async (req, res) => {
        const { projectId } = req.query;
        const projectPath = this.getFullPath(projectId as string);
        if (!existsSync(projectPath)) return res.status(404).json({ error: "not_found" });

        const readRecursive = async (dir: string): Promise<FileNode[]> => {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            return await Promise.all(entries.map(async (entry) => {
                const fullPath = path.join(dir, entry.name);
                const relativePath = path.relative(projectPath, fullPath);
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
        } catch (err) { res.status(500).json({ error: "list_failed" }); }
    };

    private readFile: RequestHandler = async (req, res) => {
        const { projectId, filePath } = req.query;
        try {
            const content = await fs.readFile(this.getFullPath(projectId as string, filePath as string), "utf-8");
            res.json({ content });
        } catch (err) { res.status(404).json({ error: "read_failed" }); }
    };


    private serveMedia: RequestHandler = (req, res) => {
        const { projectId, filePath } = req.query;
        if (!projectId || !filePath) return res.status(400).json({ error: "missing_params" });

        const fullPath = this.getFullPath(projectId as string, filePath as string);

        if (existsSync(fullPath)) {
            res.sendFile(fullPath);
        } else {
            res.status(404).json({ error: "file_not_found" });
        }
    };

    private saveFile: RequestHandler = async (req, res) => {
        const { projectId, filePath, content } = req.body;
        try {
            const full = this.getFullPath(projectId, filePath);
            const isAgent = String(req.headers["x-exo-source"] || "").toLowerCase() === "agent";
            const isSystemExo =
                typeof filePath === "string" &&
                filePath.replace(/^\.?\/+/, "").toLowerCase() === "system.exo";

            let toWrite: string = content;
            if (isAgent && isSystemExo && existsSync(full)) {
                const existing = readFileSync(full, "utf-8");
                toWrite = mergeSystemExoRuntime(existing, String(content ?? ""));
            }

            await fs.writeFile(full, toWrite);
            res.json({ success: true, merged: isAgent && isSystemExo });
        } catch (err) { res.status(500).json({ error: "save_failed" }); }
    };

    private createItem: RequestHandler = async (req, res) => {
        const { projectId, filePath, type } = req.body;
        const file = req.file;
        const fullPath = this.getFullPath(projectId, filePath);

        try {
            if (type === "directory") {
                await fs.mkdir(fullPath, { recursive: true });
            } else {

                await fs.mkdir(path.dirname(fullPath), { recursive: true });

                if (file) {

                    await fs.rename(file.path, fullPath);
                } else {

                    await fs.writeFile(fullPath, "");
                }
            }
            res.json({ success: true });
        } catch (err) {
            console.error("Create Item Error:", err);
            res.status(500).json({ error: "create_failed" });
        }
    };

    private deleteItem: RequestHandler = async (req, res) => {
        const { projectId, filePath } = req.body;
        const fullPath = this.getFullPath(projectId, filePath);
        try {
            await fs.rm(fullPath, { recursive: true, force: true });
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: "delete_failed" }); }
    };

    private renameItem: RequestHandler = async (req, res) => {
        const { projectId, oldPath, newPath } = req.body;
        const fullOldPath = this.getFullPath(projectId, oldPath);
        const fullNewPath = this.getFullPath(projectId, newPath);
        try {
            await fs.rename(fullOldPath, fullNewPath);
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: "rename_failed" }); }
    };

    private downloadFile: RequestHandler = async (req, res) => {
        const { projectId, filePath } = req.query;
        if (!projectId || !filePath) return res.status(400).json({ error: "missing_params" });
        const fullPath = this.getFullPath(projectId as string, filePath as string);
        if (!existsSync(fullPath)) return res.status(404).json({ error: "not_found" });
        const fileName = path.basename(fullPath);
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.sendFile(fullPath);
    };

    private downloadFolder: RequestHandler = async (req, res) => {
        const { projectId, folderPath } = req.query;
        if (!projectId || !folderPath) return res.status(400).json({ error: "missing_params" });
        const fullPath = this.getFullPath(projectId as string, folderPath as string);
        if (!existsSync(fullPath)) return res.status(404).json({ error: "not_found" });
        const folderName = path.basename(fullPath);
        res.attachment(`${folderName}.zip`);
        const archive = archiver("zip", { zlib: { level: 9 } });
        archive.pipe(res);
        archive.directory(fullPath, folderName);
        archive.on("error", (err) => res.status(500).send({ error: err.message }));
        await archive.finalize();
    };

    private downloadProject: RequestHandler = async (req, res) => {
        const { projectId } = req.query;
        const projectPath = this.getFullPath(projectId as string);
        if (!existsSync(projectPath)) return res.status(404).json({ error: "project_not_found" });

        res.attachment(`${projectId}.zip`);
        const archive = archiver("zip", { zlib: { level: 9 } });
        archive.pipe(res);
        archive.directory(projectPath, false);
        archive.on("error", (err) => res.status(500).send({ error: err.message }));
        await archive.finalize();
    };

    private extractZip: RequestHandler = async (req, res) => {
        const { projectId, targetPath } = req.body;
        const file = req.file;
        if (!file) return res.status(400).json({ error: "no_file" });

        const extractionPath = this.getFullPath(projectId, targetPath || "");
        try {
            const zip = new AdmZip(file.path);
            await fs.mkdir(extractionPath, { recursive: true });
            zip.extractAllTo(extractionPath, true);
            await fs.unlink(file.path);
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: "unzip_failed" }); }
    };

    public static handleStatusSync(ws: WebSocket, projectId: string) {
        const configPath = path.join(process.cwd(), "projects", projectId, ".exocore.json");
        const updateStatus = (status: string) => {
            try {
                if (existsSync(configPath)) {
                    const config = JSON.parse(readFileSync(configPath, 'utf-8')) as ProjectConfig;
                    config.status = status;
                    writeFileSync(configPath, JSON.stringify(config, null, 4));
                }
            } catch (err: unknown) { console.error("Status sync failed:", err); }
        };
        updateStatus("Active");
        ws.on('close', () => updateStatus("Online"));
    }
}
