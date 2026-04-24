import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { exec, spawn } from 'child_process';

export interface TemplateJson {
    name: string;
    description: string;
    language: string;
    runtime: string;
    run: string;
    port: number;
    install: boolean;
    category?: string;
    icon?: string;
}

export interface InstallResult {
    status: 'installing' | 'done' | 'error';
    logs: string[];
}

const TEMPLATES_DIR = path.join(__dirname, '../../templates');
const PROJECTS_DIR = path.join(process.cwd(), 'projects');
const BOOTSTRAP_SRC = path.join(TEMPLATES_DIR, '_lib', 'exocore-bootstrap.sh');

export function getTemplateList(): { id: string; meta: TemplateJson }[] {
    if (!fs.existsSync(TEMPLATES_DIR)) return [];
    const entries = fs.readdirSync(TEMPLATES_DIR, { withFileTypes: true });
    return entries
        .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
        .map((e) => {
            const metaPath = path.join(TEMPLATES_DIR, e.name, 'template.json');
            if (!fs.existsSync(metaPath)) return null;
            try {
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as TemplateJson;
                return { id: e.name, meta };
            } catch {
                return null;
            }
        })
        .filter((t): t is { id: string; meta: TemplateJson } => t !== null);
}

export async function copyTemplateToProject(
    templateId: string,
    projectId: string,
): Promise<void> {
    const sanitized = templateId.replace(/[^a-zA-Z0-9_-]/g, '');
    const templatePath = path.join(TEMPLATES_DIR, sanitized);
    const projectPath = path.join(PROJECTS_DIR, projectId);

    if (!fs.existsSync(templatePath)) {
        throw new Error(`Template "${sanitized}" not found`);
    }

    await fsp.mkdir(projectPath, { recursive: true });

    const copyDir = async (src: string, dest: string): Promise<void> => {
        const entries = await fsp.readdir(src, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === 'template.json') continue;
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
                await fsp.mkdir(destPath, { recursive: true });
                await copyDir(srcPath, destPath);
            } else {
                await fsp.copyFile(srcPath, destPath);
            }
        }
    };

    await copyDir(templatePath, projectPath);

    // Copy the cross-host install bootstrap helper alongside install.sh so
    // every generated project carries its own self-sufficient script that
    // works on Replit (nix), Hugging Face / Render / Railway (Debian apt),
    // Alpine (apk), Fedora/RHEL (dnf/yum), Arch (pacman), and macOS (brew).
    if (fs.existsSync(BOOTSTRAP_SRC)) {
        const dest = path.join(projectPath, '.exocore-bootstrap.sh');
        try {
            await fsp.copyFile(BOOTSTRAP_SRC, dest);
            await fsp.chmod(dest, 0o755);
        } catch {
            // Non-fatal: install.sh has its own inline fallbacks if this is missing.
        }
    }
}

export function runInstallScript(
    projectId: string,
    onLog: (line: string) => void,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const projectPath = path.join(PROJECTS_DIR, projectId);
        const installScript = path.join(projectPath, 'install.sh');

        if (!fs.existsSync(installScript)) {
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
            CI: '',                  // make sure tools don't switch to "no TTY" mode
            TERM: 'xterm-256color',
            NPM_CONFIG_PROGRESS: 'true',
            NPM_CONFIG_COLOR: 'always',
            NPM_CONFIG_FUND: 'false',
            NPM_CONFIG_AUDIT: 'false',
        };

        // util-linux `script` flags vary slightly; -q quiet, -f flush after each
        // write, -c run command, then output file (we discard it via /dev/null).
        const hasScript = fs.existsSync('/usr/bin/script');

        const child = hasScript
            ? spawn('/usr/bin/script', ['-qfc', 'bash install.sh', '/dev/null'], {
                cwd: projectPath,
                env,
            })
            : spawn('bash', ['install.sh'], {
                cwd: projectPath,
                env,
            });

        // Hard timeout (5 min) — kill the tree if it really hangs.
        const killTimer = setTimeout(() => {
            try { child.kill('SIGKILL'); } catch {}
            onLog('[Exocore] Install timed out after 5 minutes — aborted.\n');
        }, 300_000);

        child.stdout?.on('data', (d: Buffer) => onLog(d.toString('utf8')));
        child.stderr?.on('data', (d: Buffer) => onLog(d.toString('utf8')));

        child.on('error', (err) => {
            clearTimeout(killTimer);
            onLog(`[Exocore] Install error: ${err.message}\n`);
            reject(err);
        });

        child.on('close', (code) => {
            clearTimeout(killTimer);
            if (code === 0 || code === null) {
                onLog('[Exocore] Installation complete!\n');
            } else {
                onLog(`[Exocore] Install script exited with code ${code} — project was still created.\n`);
            }
            resolve();
        });
    });
}
