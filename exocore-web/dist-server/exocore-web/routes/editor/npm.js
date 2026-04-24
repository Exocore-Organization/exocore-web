"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NpmRoute = void 0;
const express_1 = require("express");
const child_process_1 = require("child_process");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const util_1 = __importDefault(require("util"));
const axios_1 = __importDefault(require("axios"));
const execAsync = util_1.default.promisify(child_process_1.exec);
class NpmRoute {
    router;
    projectsDir;
    constructor() {
        this.router = (0, express_1.Router)();
        this.projectsDir = path_1.default.resolve(process.cwd(), "projects");
        this.initRoutes();
    }
    initRoutes() {
        this.router.get("/list", this.listPackages);
        this.router.get("/info/:packageName", this.getPackageInfo);
        this.router.post("/install", this.installPackage);
        this.router.post("/install-all", this.installAll);
        this.router.post("/uninstall", this.uninstallPackage);
        this.router.get("/files", this.getProjectFiles);
        this.router.get("/whoami", this.whoami);
        this.router.post("/publish", this.publishPackage);
        this.router.post("/logout", this.logoutNpm);
    }
    getFullPath(projectId) {
        return path_1.default.join(this.projectsDir, projectId);
    }
    async withSecureToken(projectDir, token, action) {
        const npmrcPath = path_1.default.join(projectDir, ".npmrc");
        let fileCreated = false;
        try {
            if (token) {
                await promises_1.default.writeFile(npmrcPath, `//registry.npmjs.org/:_authToken=${token}\n`);
                fileCreated = true;
            }
            return await action();
        }
        finally {
            if (fileCreated) {
                try {
                    await promises_1.default.unlink(npmrcPath);
                }
                catch (e) {
                }
            }
        }
    }
    async scanForUsage(dir, packageName) {
        try {
            const files = await promises_1.default.readdir(dir, { withFileTypes: true });
            for (const file of files) {
                if (file.name === 'node_modules' || file.name === '.git' || file.name === 'dist')
                    continue;
                const fullPath = path_1.default.join(dir, file.name);
                if (file.isDirectory()) {
                    const found = await this.scanForUsage(fullPath, packageName);
                    if (found)
                        return true;
                }
                else if (file.name.match(/\.(js|jsx|ts|tsx)$/)) {
                    const content = await promises_1.default.readFile(fullPath, 'utf-8');
                    const regex = new RegExp(`['"]${packageName}['"]`, 'i');
                    if (regex.test(content))
                        return true;
                }
            }
        }
        catch (e) { }
        return false;
    }
    getPackageInfo = async (req, res) => {
        const { packageName } = req.params;
        try {
            const response = await axios_1.default.get(`https://registry.npmjs.org/${packageName}`);
            const data = response.data;
            res.json({
                success: true,
                versions: Object.keys(data.versions).reverse(),
                readme: data.readme || "No README available for this package.",
                homepage: data.homepage,
                license: data.license
            });
        }
        catch (err) {
            res.status(500).json({ error: "Failed to fetch package info" });
        }
    };
    listPackages = async (req, res) => {
        const { projectId } = req.query;
        if (!projectId)
            return res.status(400).json({ error: "missing_project" });
        const projectDir = this.getFullPath(projectId);
        const packageJsonPath = path_1.default.join(projectDir, "package.json");
        try {
            const data = await promises_1.default.readFile(packageJsonPath, 'utf-8');
            const pkg = JSON.parse(data);
            const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
            const packageList = [];
            for (const [name, version] of Object.entries(dependencies)) {
                const isTooling = name.startsWith('@types/') || ['typescript', 'vite', 'eslint'].includes(name);
                const isUsed = isTooling ? true : await this.scanForUsage(projectDir, name);
                packageList.push({ name, version, isUsed, isDev: !!pkg.devDependencies?.[name] });
            }
            res.json({ success: true, packages: packageList });
        }
        catch (err) {
            res.json({ success: true, packages: [] });
        }
    };
    installPackage = async (req, res) => {
        const { projectId, packageName, token, dev } = req.body;
        const projectDir = this.getFullPath(projectId);
        const devFlag = dev ? ' --save-dev' : '';
        try {
            await this.withSecureToken(projectDir, token, async () => {
                await execAsync(`npm install ${packageName}${devFlag} --legacy-peer-deps --ignore-scripts`, { cwd: projectDir });
            });
            res.json({ success: true });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'install_failed';
            res.status(500).json({ error: msg });
        }
    };
    installAll = async (req, res) => {
        const { projectId, token } = req.body;
        const projectDir = this.getFullPath(projectId);
        try {
            const pkgPath = path_1.default.join(projectDir, "package.json");
            try {
                const data = await promises_1.default.readFile(pkgPath, 'utf-8');
                const pkg = JSON.parse(data);
                const hasDeps = (pkg.dependencies && Object.keys(pkg.dependencies).length > 0)
                    || (pkg.devDependencies && Object.keys(pkg.devDependencies).length > 0);
                if (!hasDeps) {
                    return res.json({ success: true, skipped: true, reason: "no_dependencies" });
                }
            }
            catch {
                return res.json({ success: true, skipped: true, reason: "no_package_json" });
            }
            await this.withSecureToken(projectDir, token, async () => {
                await execAsync(`npm install --legacy-peer-deps --ignore-scripts`, { cwd: projectDir });
            });
            res.json({ success: true });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'install_all_failed';
            res.status(500).json({ error: msg });
        }
    };
    uninstallPackage = async (req, res) => {
        const { projectId, packageName, token } = req.body;
        const projectDir = this.getFullPath(projectId);
        try {
            await this.withSecureToken(projectDir, token, async () => {
                await execAsync(`npm uninstall ${packageName}`, { cwd: projectDir });
            });
            res.json({ success: true });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'uninstall_failed';
            res.status(500).json({ error: msg });
        }
    };
    whoami = async (req, res) => {
        const { token } = req.query;
        if (!token)
            return res.status(400).json({ error: "Missing token" });
        try {
            const response = await axios_1.default.get("https://registry.npmjs.org/-/whoami", {
                headers: { Authorization: `Bearer ${token}` }
            });
            res.json({ success: true, username: response.data.username });
        }
        catch (err) {
            res.status(401).json({ success: false, error: "Invalid or Expired Token" });
        }
    };
    logoutNpm = async (_req, res) => {
        res.json({ success: true, message: "Logged out locally" });
    };
    getProjectFiles = async (req, res) => {
        const { projectId } = req.query;
        if (!projectId)
            return res.status(400).json({ error: "missing_project" });
        const projectDir = this.getFullPath(projectId);
        try {
            const entries = await promises_1.default.readdir(projectDir, { withFileTypes: true });
            const files = entries
                .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
                .map(e => e.name);
            res.json({ success: true, files });
        }
        catch {
            res.status(500).json({ error: "Failed to scan files" });
        }
    };
    publishPackage = async (req, res) => {
        const { projectId, files, token } = req.body;
        if (!projectId || !files || !token)
            return res.status(400).json({ error: "Missing parameters or token" });
        const projectDir = this.getFullPath(projectId);
        const pkgPath = path_1.default.join(projectDir, "package.json");
        try {
            const pkgData = JSON.parse(await promises_1.default.readFile(pkgPath, 'utf-8'));
            pkgData.files = files;
            await promises_1.default.writeFile(pkgPath, JSON.stringify(pkgData, null, 2));
            await this.withSecureToken(projectDir, token, async () => {
                await execAsync(`npm publish`, { cwd: projectDir });
            });
            res.json({ success: true });
        }
        catch (err) {
            let errorMessage = "Publish failed. Did you update the version in package.json?";
            const errMsg = err instanceof Error ? err.message : '';
            if (errMsg.includes("403") || errMsg.includes("code E403")) {
                errorMessage = "Forbidden: Invalid token or you do not have access to this package name.";
            }
            else if (errMsg.includes("400") || errMsg.includes("404")) {
                errorMessage = "Package name invalid.";
            }
            console.error("Publish Error:", err);
            res.status(500).json({ error: errorMessage });
        }
    };
}
exports.NpmRoute = NpmRoute;
