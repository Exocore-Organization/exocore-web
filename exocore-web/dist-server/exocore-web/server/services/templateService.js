"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTemplateList = getTemplateList;
exports.copyTemplateToProject = copyTemplateToProject;
exports.runInstallScript = runInstallScript;
const fs_1 = __importDefault(require("fs"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const TEMPLATES_DIR = path_1.default.join(__dirname, '../../templates');
const PROJECTS_DIR = path_1.default.join(process.cwd(), 'projects');
const BOOTSTRAP_SRC = path_1.default.join(TEMPLATES_DIR, '_lib', 'exocore-bootstrap.sh');
function getTemplateList() {
    if (!fs_1.default.existsSync(TEMPLATES_DIR))
        return [];
    const entries = fs_1.default.readdirSync(TEMPLATES_DIR, { withFileTypes: true });
    return entries
        .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
        .map((e) => {
        const metaPath = path_1.default.join(TEMPLATES_DIR, e.name, 'template.json');
        if (!fs_1.default.existsSync(metaPath))
            return null;
        try {
            const meta = JSON.parse(fs_1.default.readFileSync(metaPath, 'utf-8'));
            return { id: e.name, meta };
        }
        catch {
            return null;
        }
    })
        .filter((t) => t !== null);
}
async function copyTemplateToProject(templateId, projectId) {
    const sanitized = templateId.replace(/[^a-zA-Z0-9_-]/g, '');
    const templatePath = path_1.default.join(TEMPLATES_DIR, sanitized);
    const projectPath = path_1.default.join(PROJECTS_DIR, projectId);
    if (!fs_1.default.existsSync(templatePath)) {
        throw new Error(`Template "${sanitized}" not found`);
    }
    await promises_1.default.mkdir(projectPath, { recursive: true });
    const copyDir = async (src, dest) => {
        const entries = await promises_1.default.readdir(src, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === 'template.json')
                continue;
            const srcPath = path_1.default.join(src, entry.name);
            const destPath = path_1.default.join(dest, entry.name);
            if (entry.isDirectory()) {
                await promises_1.default.mkdir(destPath, { recursive: true });
                await copyDir(srcPath, destPath);
            }
            else {
                await promises_1.default.copyFile(srcPath, destPath);
            }
        }
    };
    await copyDir(templatePath, projectPath);
    // Copy the cross-host install bootstrap helper alongside install.sh so
    // every generated project carries its own self-sufficient script that
    // works on Replit (nix), Hugging Face / Render / Railway (Debian apt),
    // Alpine (apk), Fedora/RHEL (dnf/yum), Arch (pacman), and macOS (brew).
    if (fs_1.default.existsSync(BOOTSTRAP_SRC)) {
        const dest = path_1.default.join(projectPath, '.exocore-bootstrap.sh');
        try {
            await promises_1.default.copyFile(BOOTSTRAP_SRC, dest);
            await promises_1.default.chmod(dest, 0o755);
        }
        catch {
            // Non-fatal: install.sh has its own inline fallbacks if this is missing.
        }
    }
}
function runInstallScript(projectId, onLog) {
    return new Promise((resolve, reject) => {
        const projectPath = path_1.default.join(PROJECTS_DIR, projectId);
        const installScript = path_1.default.join(projectPath, 'install.sh');
        if (!fs_1.default.existsSync(installScript)) {
            onLog('[Exocore] No install script found — skipping.\n');
            resolve();
            return;
        }
        // Run install.sh through `script` so it gets a real PTY. Without this,
        // tools like npm / pip / cargo detect "not a TTY" and buffer their
        // output (and strip ANSI colors) — which is why the modal looked stuck
        // for minutes during `npm install`. With a PTY we get true live,
        // colored, line-by-line output streamed into the SSE feed.
        const env = {
            ...process.env,
            FORCE_COLOR: '1',
            CI: '', // make sure tools don't switch to "no TTY" mode
            TERM: 'xterm-256color',
            NPM_CONFIG_PROGRESS: 'true',
            NPM_CONFIG_COLOR: 'always',
            NPM_CONFIG_FUND: 'false',
            NPM_CONFIG_AUDIT: 'false',
        };
        // util-linux `script` flags vary slightly; -q quiet, -f flush after each
        // write, -c run command, then output file (we discard it via /dev/null).
        const hasScript = fs_1.default.existsSync('/usr/bin/script');
        const child = hasScript
            ? (0, child_process_1.spawn)('/usr/bin/script', ['-qfc', 'bash install.sh', '/dev/null'], {
                cwd: projectPath,
                env,
            })
            : (0, child_process_1.spawn)('bash', ['install.sh'], {
                cwd: projectPath,
                env,
            });
        // Hard timeout (5 min) — kill the tree if it really hangs.
        const killTimer = setTimeout(() => {
            try {
                child.kill('SIGKILL');
            }
            catch { }
            onLog('[Exocore] Install timed out after 5 minutes — aborted.\n');
        }, 300_000);
        child.stdout?.on('data', (d) => onLog(d.toString('utf8')));
        child.stderr?.on('data', (d) => onLog(d.toString('utf8')));
        child.on('error', (err) => {
            clearTimeout(killTimer);
            onLog(`[Exocore] Install error: ${err.message}\n`);
            reject(err);
        });
        child.on('close', (code) => {
            clearTimeout(killTimer);
            if (code === 0 || code === null) {
                onLog('[Exocore] Installation complete!\n');
            }
            else {
                onLog(`[Exocore] Install script exited with code ${code} — project was still created.\n`);
            }
            resolve();
        });
    });
}
