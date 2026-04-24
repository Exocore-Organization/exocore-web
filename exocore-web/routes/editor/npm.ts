import { Router, RequestHandler } from "express";
import { exec } from "child_process";
import fs from "fs/promises";
import path from "path";
import util from "util";
import axios from "axios";

const execAsync = util.promisify(exec);

export class NpmRoute {
    public router: Router;
    private projectsDir: string;

    constructor() {
        this.router = Router();
        this.projectsDir = path.resolve(process.cwd(), "projects");
        this.initRoutes();
    }

    private initRoutes() {
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

    private getFullPath(projectId: string) {
        return path.join(this.projectsDir, projectId);
    }

    
    private async withSecureToken<T>(projectDir: string, token: string | undefined, action: () => Promise<T>): Promise<T> {
        const npmrcPath = path.join(projectDir, ".npmrc");
        let fileCreated = false;
        try {
            if (token) {
                await fs.writeFile(npmrcPath, `//registry.npmjs.org/:_authToken=${token}\n`);
                fileCreated = true;
            }
            return await action();
        } finally {
            if (fileCreated) {
                try {
                    await fs.unlink(npmrcPath); 
                } catch (e) {
                    
                }
            }
        }
    }

    private async scanForUsage(dir: string, packageName: string): Promise<boolean> {
        try {
            const files = await fs.readdir(dir, { withFileTypes: true });
            for (const file of files) {
                if (file.name === 'node_modules' || file.name === '.git' || file.name === 'dist') continue;

                const fullPath = path.join(dir, file.name);
                if (file.isDirectory()) {
                    const found = await this.scanForUsage(fullPath, packageName);
                    if (found) return true;
                } else if (file.name.match(/\.(js|jsx|ts|tsx)$/)) {
                    const content = await fs.readFile(fullPath, 'utf-8');
                    const regex = new RegExp(`['"]${packageName}['"]`, 'i');
                    if (regex.test(content)) return true;
                }
            }
        } catch (e) {}
        return false;
    }

    private getPackageInfo: RequestHandler = async (req, res) => {
        const { packageName } = req.params;
        try {
            const response = await axios.get(`https://registry.npmjs.org/${packageName}`);
            const data = response.data;

            res.json({
                success: true,
                versions: Object.keys(data.versions).reverse(),
                     readme: data.readme || "No README available for this package.",
                     homepage: data.homepage,
                     license: data.license
            });
        } catch (err) {
            res.status(500).json({ error: "Failed to fetch package info" });
        }
    };

    private listPackages: RequestHandler = async (req, res) => {
        const { projectId } = req.query;
        if (!projectId) return res.status(400).json({ error: "missing_project" });

        const projectDir = this.getFullPath(projectId as string);
        const packageJsonPath = path.join(projectDir, "package.json");

        try {
            const data = await fs.readFile(packageJsonPath, 'utf-8');
            const pkg = JSON.parse(data);
            const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
            const packageList = [];

            for (const [name, version] of Object.entries(dependencies)) {
                const isTooling = name.startsWith('@types/') || ['typescript', 'vite', 'eslint'].includes(name);
                const isUsed = isTooling ? true : await this.scanForUsage(projectDir, name);
                packageList.push({ name, version, isUsed, isDev: !!pkg.devDependencies?.[name] });
            }

            res.json({ success: true, packages: packageList });
        } catch (err) {
            res.json({ success: true, packages: [] });
        }
    };

    private installPackage: RequestHandler = async (req, res) => {
        const { projectId, packageName, token, dev } = req.body as {
            projectId: string;
            packageName: string;
            token?: string;
            dev?: boolean;
        };
        const projectDir = this.getFullPath(projectId);
        const devFlag = dev ? ' --save-dev' : '';
        try {
            await this.withSecureToken(projectDir, token, async () => {
                await execAsync(
                    `npm install ${packageName}${devFlag} --legacy-peer-deps --ignore-scripts`,
                    { cwd: projectDir },
                );
            });
            res.json({ success: true });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'install_failed';
            res.status(500).json({ error: msg });
        }
    };

    private installAll: RequestHandler = async (req, res) => {
        const { projectId, token } = req.body as { projectId: string; token?: string };
        const projectDir = this.getFullPath(projectId);
        try {
            const pkgPath = path.join(projectDir, "package.json");
            try {
                const data = await fs.readFile(pkgPath, 'utf-8');
                const pkg = JSON.parse(data);
                const hasDeps = (pkg.dependencies && Object.keys(pkg.dependencies).length > 0)
                    || (pkg.devDependencies && Object.keys(pkg.devDependencies).length > 0);
                if (!hasDeps) {
                    return res.json({ success: true, skipped: true, reason: "no_dependencies" });
                }
            } catch {
                return res.json({ success: true, skipped: true, reason: "no_package_json" });
            }
            await this.withSecureToken(projectDir, token, async () => {
                await execAsync(`npm install --legacy-peer-deps --ignore-scripts`, { cwd: projectDir });
            });
            res.json({ success: true });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'install_all_failed';
            res.status(500).json({ error: msg });
        }
    };

    private uninstallPackage: RequestHandler = async (req, res) => {
        const { projectId, packageName, token } = req.body as { projectId: string; packageName: string; token?: string };
        const projectDir = this.getFullPath(projectId);
        try {
            await this.withSecureToken(projectDir, token, async () => {
                await execAsync(`npm uninstall ${packageName}`, { cwd: projectDir });
            });
            res.json({ success: true });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'uninstall_failed';
            res.status(500).json({ error: msg });
        }
    };

    

    private whoami: RequestHandler = async (req, res) => {
        const { token } = req.query;
        if (!token) return res.status(400).json({ error: "Missing token" });

        try {
            
            
            const response = await axios.get("https://registry.npmjs.org/-/whoami", {
                headers: { Authorization: `Bearer ${token}` }
            });
            res.json({ success: true, username: response.data.username });
        } catch (err) {
            res.status(401).json({ success: false, error: "Invalid or Expired Token" });
        }
    };

    private logoutNpm: RequestHandler = async (_req, res) => {
        
        
        res.json({ success: true, message: "Logged out locally" });
    };

    private getProjectFiles: RequestHandler = async (req, res) => {
        const { projectId } = req.query;
        if (!projectId) return res.status(400).json({ error: "missing_project" });

        const projectDir = this.getFullPath(projectId as string);
        try {
            const entries = await fs.readdir(projectDir, { withFileTypes: true });
            const files = entries
            .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
            .map(e => e.name);

            res.json({ success: true, files });
        } catch {
            res.status(500).json({ error: "Failed to scan files" });
        }
    };

    private publishPackage: RequestHandler = async (req, res) => {
        const { projectId, files, token } = req.body;
        if (!projectId || !files || !token) return res.status(400).json({ error: "Missing parameters or token" });

        const projectDir = this.getFullPath(projectId);
        const pkgPath = path.join(projectDir, "package.json");

        try {
            
            const pkgData = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
            pkgData.files = files;
            await fs.writeFile(pkgPath, JSON.stringify(pkgData, null, 2));

            
            await this.withSecureToken(projectDir, token, async () => {
                await execAsync(`npm publish`, { cwd: projectDir });
            });

            res.json({ success: true });
        } catch (err: unknown) {
            let errorMessage = "Publish failed. Did you update the version in package.json?";
            const errMsg = err instanceof Error ? err.message : '';
            if (errMsg.includes("403") || errMsg.includes("code E403")) {
                errorMessage = "Forbidden: Invalid token or you do not have access to this package name.";
            } else if (errMsg.includes("400") || errMsg.includes("404")) {
                errorMessage = "Package name invalid.";
            }
            console.error("Publish Error:", err);
            res.status(500).json({ error: errorMessage });
        }
    };
}
