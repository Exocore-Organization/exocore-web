import { Router, RequestHandler } from "express";
import { exec } from "child_process";
import fs from "fs/promises";
import path from "path";
import util from "util";
import axios from "axios";

const execAsync = util.promisify(exec);
const GITHUB_CLIENT_ID = "178c6fc778ccc68e1d6a";

export class GithubRoute {
    public router: Router;
    private projectsDir: string;

    constructor() {
        this.router = Router();
        this.projectsDir = path.resolve(process.cwd(), "projects");
        this.initRoutes();
    }

    private initRoutes() {
        this.router.get("/status", this.gitStatus);
        this.router.get("/files", this.getProjectChanges);
        this.router.post("/repos", this.getUserRepos);
        this.router.post("/clone", this.cloneRepo);
        this.router.post("/create", this.createRepo);
        this.router.post("/connect", this.connectRepo);
        this.router.post("/push", this.pushRepo);
        this.router.post("/pull", this.pullRepo);

        this.router.post("/auth/device", this.requestDeviceCode);
        this.router.post("/auth/poll", this.pollDeviceToken);
    }

    private getFullPath(projectId: string) {
        return path.join(this.projectsDir, projectId);
    }

    private injectTokenIntoUrl(repoUrl: string, token: string) {
        if (!token) return repoUrl;
        return repoUrl.replace("https://", `https://${token}@`);
    }

    private async ensureGitIgnore(projectDir: string) {
        const ignorePath = path.join(projectDir, ".gitignore");
        try {
            const content = await fs.readFile(ignorePath, "utf8");
            if (!content.includes("node_modules")) {
                await fs.appendFile(
                    ignorePath,
                    "\nnode_modules\n.env\n.DS_Store\n",
                );
            }
        } catch {
            await fs.writeFile(ignorePath, "node_modules\n.env\n.DS_Store\n");
        }
    }

    private requestDeviceCode: RequestHandler = async (_req, res) => {
        try {
            const response = await axios.post(
                "https://github.com/login/device/code",
                {
                    client_id: GITHUB_CLIENT_ID,
                    scope: "repo user",
                },
                {
                    headers: {
                        Accept: "application/json",
                        "User-Agent": "Exocore-IDE",
                    },
                },
            );
            res.json({ success: true, data: response.data });
        } catch (err) {
            res.status(500).json({ error: "Failed to request device code" });
        }
    };

    private pollDeviceToken: RequestHandler = async (req, res) => {
        const { device_code } = req.body;
        try {
            const response = await axios.post(
                "https://github.com/login/oauth/access_token",
                {
                    client_id: GITHUB_CLIENT_ID,
                    device_code: device_code,
                    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                },
                {
                    headers: {
                        Accept: "application/json",
                        "User-Agent": "Exocore-IDE",
                    },
                    validateStatus: () => true,
                },
            );

            if (response.data && response.data.access_token) {
                const userRes = await axios.get("https://api.github.com/user", {
                    headers: {
                        Authorization: `Bearer ${response.data.access_token}`,
                        "User-Agent": "Exocore-IDE",
                    },
                    validateStatus: () => true,
                });
                res.json({
                    success: true,
                    token: response.data.access_token,
                    username: userRes.data?.login || "ExocoreUser",
                    email:
                        userRes.data?.email ||
                        `${userRes.data?.login || "user"}@users.noreply.github.com`,
                });
            } else {
                res.json({
                    success: false,
                    error: response.data?.error || "pending",
                });
            }
        } catch {
            res.json({ success: false, error: "Network Error" });
        }
    };

    private getUserRepos: RequestHandler = async (req, res) => {
        const { token } = req.body;
        if (!token) return res.status(400).json({ error: "missing_token" });
        try {
            const response = await axios.get(
                "https://api.github.com/user/repos?per_page=100&sort=updated",
                {
                    headers: { Authorization: `token ${token}` },
                },
            );
            type GhRepoRaw = {
                name: string;
                full_name: string;
                private: boolean;
                clone_url: string;
            };
            const repos = (response.data as GhRepoRaw[]).map((r) => ({
                name: r.name,
                full_name: r.full_name,
                private: r.private,
                clone_url: r.clone_url,
            }));
            res.json({ success: true, repos });
        } catch (err) {
            res.status(500).json({ error: "Failed to fetch repos" });
        }
    };

    private gitStatus: RequestHandler = async (req, res) => {
        const { projectId } = req.query;
        if (!projectId)
            return res.status(400).json({ error: "missing_project" });
        const projectDir = this.getFullPath(projectId as string);
        try {
            await fs.access(path.join(projectDir, ".git"));
            let remote = "";
            try {
                const { stdout } = await execAsync(
                    `git config --get remote.origin.url`,
                    { cwd: projectDir },
                );
                remote = stdout.trim().replace(/https:\/\/(.*?)@/, "https://");
            } catch {}

            let trackedFiles: string[] = [];
            try {
                const { stdout: trackedOut } = await execAsync(
                    `git ls-tree -r HEAD --name-only`,
                    { cwd: projectDir },
                );
                trackedFiles = trackedOut
                    .split("\n")
                    .filter((l) => l.trim() !== "");
            } catch {
                try {
                    const { stdout: filesOut } = await execAsync(
                        `git ls-files`,
                        { cwd: projectDir },
                    );
                    trackedFiles = filesOut
                        .split("\n")
                        .filter((l) => l.trim() !== "");
                } catch {}
            }

            res.json({ success: true, isGit: true, remote, trackedFiles });
        } catch (err) {
            res.json({ success: true, isGit: false });
        }
    };

    private getProjectChanges: RequestHandler = async (req, res) => {
        const { projectId } = req.query;
        if (!projectId)
            return res.status(400).json({ error: "missing_project" });
        const projectDir = this.getFullPath(projectId as string);

        try {
            await fs.access(path.join(projectDir, ".git"));
            const { stdout } = await execAsync(`git status --porcelain`, {
                cwd: projectDir,
            });

            if (!stdout.trim()) return res.json({ success: true, files: [] });

            const lines = stdout.split("\n").filter((l) => l.trim() !== "");
            const files = lines
                .map((line) => {
                    const status = line.substring(0, 2).trim();
                    let file = line.substring(3).trim();
                    if (file.startsWith('"') && file.endsWith('"'))
                        file = file.slice(1, -1);
                    return { file, status };
                })
                .filter((f) => {
                    const n = f.file;
                    return (
                        n !== "node_modules" &&
                        !n.startsWith("node_modules/") &&
                        !n.includes("/node_modules/") &&
                        !n.startsWith(".git")
                    );
                });
            res.json({ success: true, files });
        } catch (err) {
            try {
                const entries = await fs.readdir(projectDir, {
                    withFileTypes: true,
                });
                const files = entries
                    .filter(
                        (e) =>
                            (e.name === ".gitignore" ||
                                !e.name.startsWith(".")) &&
                            e.name !== "node_modules",
                    )
                    .map((e) => ({ file: e.name, status: "U" }));
                res.json({ success: true, files });
            } catch (scanErr) {
                res.status(500).json({ error: "Failed to scan files" });
            }
        }
    };

    private cloneRepo: RequestHandler = async (req, res) => {
        const { projectId, repoUrl, extract } = req.body;
        const projectDir = this.getFullPath(projectId);
        try {
            if (extract) {
                const tmpFolder = path.join(projectDir, "_temp_clone");
                await execAsync(`git clone "${repoUrl}" "${tmpFolder}"`);
                const files = await fs.readdir(tmpFolder);
                for (const file of files)
                    await fs.rename(
                        path.join(tmpFolder, file),
                        path.join(projectDir, file),
                    );
                try {
                    await fs.rename(
                        path.join(tmpFolder, ".git"),
                        path.join(projectDir, ".git"),
                    );
                } catch {}
                await fs.rm(tmpFolder, { recursive: true, force: true });
            } else {
                await execAsync(`git clone "${repoUrl}"`, { cwd: projectDir });
            }
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({
                error: "Clone failed. Check URL or folder conflicts.",
            });
        }
    };

    private createRepo: RequestHandler = async (req, res) => {
        const {
            projectId,
            token,
            username,
            email,
            repoName,
            isPrivate,
            files,
        } = req.body;
        const projectDir = this.getFullPath(projectId);
        try {
            await axios.post(
                "https://api.github.com/user/repos",
                { name: repoName, private: isPrivate },
                { headers: { Authorization: `token ${token}` } },
            );
            const authUrl = `https://${token}@github.com/${username}/${repoName}.git`;

            await this.ensureGitIgnore(projectDir);
            await execAsync(`git init`, { cwd: projectDir });
            await execAsync(`git config user.name "${username}"`, {
                cwd: projectDir,
            });
            await execAsync(`git config user.email "${email}"`, {
                cwd: projectDir,
            });

            if (files && files.length > 0) {
                for (const f of files)
                    await execAsync(`git add "${f}"`, { cwd: projectDir });
                await execAsync(`git add .gitignore`, {
                    cwd: projectDir,
                }).catch(() => {});
            } else {
                await execAsync(`git add .`, { cwd: projectDir });
            }

            await execAsync(`git commit -m "Initial commit from Exocore IDE"`, {
                cwd: projectDir,
            }).catch(() => {});
            await execAsync(`git branch -M main`, { cwd: projectDir });
            await execAsync(`git remote add origin "${authUrl}"`, {
                cwd: projectDir,
            }).catch(() =>
                execAsync(`git remote set-url origin "${authUrl}"`, {
                    cwd: projectDir,
                }),
            );
            await execAsync(`git push -u origin main`, { cwd: projectDir });
            res.json({ success: true });
        } catch (err: unknown) {
            const axErr = err as { response?: { data?: { message?: string } } };
            res.status(500).json({
                error: axErr.response?.data?.message ?? "Publish repo failed.",
            });
        }
    };

    private connectRepo: RequestHandler = async (req, res) => {
        const { projectId, repoUrl, token, username, email } = req.body;
        const projectDir = this.getFullPath(projectId);
        const authUrl = this.injectTokenIntoUrl(repoUrl, token);
        try {
            await this.ensureGitIgnore(projectDir);
            await execAsync(`git init`, { cwd: projectDir });
            await execAsync(`git config user.name "${username}"`, {
                cwd: projectDir,
            });
            await execAsync(`git config user.email "${email}"`, {
                cwd: projectDir,
            });
            await execAsync(`git remote add origin "${authUrl}"`, {
                cwd: projectDir,
            }).catch(() =>
                execAsync(`git remote set-url origin "${authUrl}"`, {
                    cwd: projectDir,
                }),
            );
            await execAsync(`git branch -M main`, { cwd: projectDir });
            await execAsync(`git pull origin main --rebase`, {
                cwd: projectDir,
            }).catch(() =>
                execAsync(`git pull origin main --allow-unrelated-histories`, {
                    cwd: projectDir,
                }).catch(() => {}),
            );
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: "Connect remote repo failed." });
        }
    };

    private pushRepo: RequestHandler = async (req, res) => {
        const { projectId, token, files, commitMsg, commitDesc } = req.body;
        const projectDir = this.getFullPath(projectId);
        try {
            await execAsync(`git reset`, { cwd: projectDir }).catch(() => {});

            if (files && files.length > 0) {
                for (const f of files) {
                    await execAsync(`git add "${f}"`, { cwd: projectDir });
                }
            } else {
                await execAsync(`git add .`, { cwd: projectDir });
            }

            const safeMsg = (commitMsg || "Update via Exocore IDE").replace(
                /"/g,
                '\\"',
            );
            let commitCmd = `git commit -m "${safeMsg}"`;
            if (commitDesc) {
                const safeDesc = commitDesc.replace(/"/g, '\\"');
                commitCmd += ` -m "${safeDesc}"`;
            }

            await execAsync(commitCmd, { cwd: projectDir }).catch(() => {});

            const { stdout } = await execAsync(
                `git config --get remote.origin.url`,
                { cwd: projectDir },
            );
            const currentUrl = stdout.trim();
            if (!currentUrl.includes("@") && token) {
                const newUrl = this.injectTokenIntoUrl(currentUrl, token);
                await execAsync(`git remote set-url origin "${newUrl}"`, {
                    cwd: projectDir,
                });
            }

            await execAsync(`git push origin main`, { cwd: projectDir });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: "Failed to push changes." });
        }
    };

    private pullRepo: RequestHandler = async (req, res) => {
        const { projectId } = req.body;
        const projectDir = this.getFullPath(projectId);
        try {
            await execAsync(`git pull origin main`, { cwd: projectDir });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: "Failed to pull from remote." });
        }
    };
}
