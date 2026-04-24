/**
 * Capture screenshots of every Exocore EDITOR feature using bundled Chromium.
 *
 *   npx tsx exocore-web/scripts/capture-editor.ts
 *
 * Auto-creates the demo projects on disk before the editor screenshots run, so
 * a fresh checkout (or a freshly reset env) doesn't need any manual project
 * setup beforehand:
 *
 *   - exorepo-demo (node template)   — used for explorer, terminal, console,
 *                                      webview, problems, npm, github, drive,
 *                                      ai, history, settings.
 *   - exorepo-py   (python template) — used for the PyLibs pane only.
 *
 * Captures are taken in BOTH viewports. By default desktop shots land in
 *   exocore-web/docs/screenshots/editor/
 * and mobile shots land in
 *   exocore-web/docs/screenshots/editor/mobile/
 *
 * Override with VIEWPORT=desktop|mobile to capture only one of them.
 *
 * Re-uses the panel-gate setup + user login flow from capture-docs.ts, but
 * hits the editor URL with `?project=<projectId>&autoinstall=1` so the bottom
 * panel auto-opens to the terminal on first load.
 */
import puppeteer, { Browser, Page } from "puppeteer";
import http from "http";
import fs from "fs";
import path from "path";

const BASE = process.env.EXOCORE_BASE || "http://localhost:5000/exocore";
const OUT  = path.resolve("exocore-web/docs/screenshots/editor");

const PANEL_USER = process.env.EXO_PANEL_USER || "Choruyt";
const PANEL_PASS = process.env.EXO_PANEL_PASS || "ex123";
const USER_LOGIN = process.env.EXO_LOGIN_USER || "choruyt";
const USER_PASS  = process.env.EXO_LOGIN_PASS || "Stevepen4321!";

const DEVS_JSON     = path.resolve("exocore-web/client/access/devs.json");
const SESSIONS_JSON = path.resolve("exocore-web/client/access/sessions.json");

const DESKTOP = { width: 1440, height: 900,  isMobile: false, deviceScaleFactor: 1 };
const MOBILE  = { width: 414,  height: 896,  isMobile: true,  deviceScaleFactor: 1, hasTouch: true };

const VIEWPORT_FILTER = (process.env.VIEWPORT || "").toLowerCase(); // "desktop" | "mobile" | ""

// Demo projects this script depends on. They are auto-created (idempotent —
// existing projects are left alone) before the editor capture pass so the
// script never sits on the empty "no project selected" placeholder.
const DEMO_PROJECTS: Array<{ id: string; templateId: string; description: string }> = [
    { id: "exorepo-demo", templateId: "node",   description: "Exocore demo project for editor screenshots." },
    { id: "exorepo-py",   templateId: "python", description: "Exocore demo Python project for PyLibs screenshots." },
];

function resetGate() {
    for (const f of [DEVS_JSON, SESSIONS_JSON]) {
        try { fs.unlinkSync(f); } catch { /* missing ok */ }
    }
}

async function fillInput(page: Page, selector: string, value: string) {
    await page.waitForSelector(selector, { timeout: 10000 });
    await page.evaluate((sel, val) => {
        const el = document.querySelector(sel) as HTMLInputElement | null;
        if (!el) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        setter?.call(el, val);
        el.dispatchEvent(new Event("input",  { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
    }, selector, value);
}

async function unlockPanelSetup(page: Page) {
    console.log("🔐 unlocking panel-devs gate (setup)…");
    await page.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500));
    const inputCount = await page.$$eval("form input", (els) => els.length);
    if (inputCount === 0) { console.log("   no inputs — already authenticated."); return; }
    const fillIndexes = Math.min(inputCount, 3);
    for (let i = 0; i < fillIndexes; i++) {
        await page.evaluate((idx, val) => {
            const el = document.querySelectorAll("form input")[idx] as HTMLInputElement | null;
            if (!el) return;
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
            setter?.call(el, val);
            el.dispatchEvent(new Event("input",  { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
        }, i, i === 0 ? PANEL_USER : PANEL_PASS);
    }
    const submit = await page.$("form button[type=submit]");
    if (submit) await submit.click(); else await page.keyboard.press("Enter");
    await new Promise(r => setTimeout(r, 4500));
    const stillGated = await page.evaluate(() =>
        /First run|Welcome back|Create your panel account/i.test(document.body.innerText));
    if (stillGated) {
        const btn = await page.$("form button[type=submit]");
        if (btn) await btn.click();
        await new Promise(r => setTimeout(r, 3500));
    }
    console.log("   ✅ panel unlocked");
}

async function loginUser(page: Page) {
    console.log(`🔑 logging in as @${USER_LOGIN}…`);
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500));
    try { await page.waitForSelector("form input[autocomplete='username']", { timeout: 10000 }); } catch {}
    await fillInput(page, "form input[autocomplete='username']",         USER_LOGIN);
    await fillInput(page, "form input[autocomplete='current-password']", USER_PASS);
    const submit = await page.$("form button[type=submit]");
    if (submit) {
        await Promise.all([
            page.waitForNavigation({ waitUntil: "networkidle2", timeout: 25000 }).catch(() => null),
            submit.click(),
        ]);
    } else {
        await page.keyboard.press("Enter");
    }
    await new Promise(r => setTimeout(r, 6000));
    const ok = await page.evaluate(() => !!localStorage.getItem("exo_token"));
    if (!ok) {
        const msg = await page.evaluate(() => document.body.innerText.slice(0, 200));
        console.log("   ⚠️  login failed:", msg);
        return false;
    }
    console.log("   ✅ logged in, token stored");
    return true;
}

async function snap(page: Page, slug: string, outDir: string): Promise<boolean> {
    const file = path.join(outDir, `${slug}.png`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
        // Some panes (notably the webview/preview) replace the active target
        // and crash a strict screenshot call. Treat that as "skip this slug
        // and keep going" instead of killing the whole capture run.
        if (page.isClosed()) {
            console.warn(`   ⚠️  page closed before ${slug} — skipping`);
            return false;
        }
        await page.screenshot({ path: file, fullPage: false, type: "png" });
        console.log("   📸", path.relative(process.cwd(), file));
        return true;
    } catch (err: any) {
        const msg = err?.message || String(err);
        if (/Session closed|Target closed|detached Frame/i.test(msg)) {
            console.warn(`   ⚠️  ${slug}: ${msg.split("\n")[0]} — skipping`);
            return false;
        }
        throw err;
    }
}

/**
 * Wraps any "click + wait + snap" step so an individual pane that fails
 * (modal didn't open, button moved, page detached) doesn't abort the whole
 * pass. Returns true if the snap succeeded.
 */
async function safeStep(label: string, fn: () => Promise<unknown>): Promise<void> {
    try {
        await fn();
    } catch (err: any) {
        const msg = err?.message || String(err);
        console.warn(`   ⚠️  step "${label}" failed: ${msg.split("\n")[0]}`);
    }
}

async function clickAriaLabel(page: Page, label: string) {
    const ok = await page.evaluate((lbl) => {
        const el = document.querySelector(`[aria-label="${lbl}"]`) as HTMLElement | null;
        if (!el) return false;
        el.click();
        return true;
    }, label);
    return ok;
}

async function openProject(page: Page, projectId: string, autoInstall = true) {
    const url = `${BASE}/editor?project=${encodeURIComponent(projectId)}${autoInstall ? '&autoinstall=1' : ''}`;
    console.log(`📂 opening editor: ${url}`);
    // Use `domcontentloaded` (not `networkidle2`) — Monaco + the wss watcher
    // never go idle on this app, so networkidle would always time out and
    // the timeout would propagate up as an unhandled rejection that killed
    // the script silently. domcontentloaded fires after the HTML is parsed,
    // which is enough; we still wait an explicit settle below for the
    // editor surface to render.
    try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
        console.log("   ↪ editor HTML loaded");
    } catch (err: any) {
        console.warn("   ⚠️  editor goto warning:", (err?.message || String(err)).split("\n")[0]);
    }
    // Editor is heavy (Monaco + WSS). Give it a long settle.
    await new Promise(r => setTimeout(r, 10000));
}

/**
 * Hit the templates SSE endpoint to materialise the demo project on disk.
 * Idempotent: a project that already exists is treated as success and we
 * skip the create entirely. The endpoint streams Server-Sent Events; we
 * read the stream until we see a `done` or `error` payload (or the stream
 * ends), then return.
 */
function ensureDemoProject(p: { id: string; templateId: string; description: string }): Promise<void> {
    const projDir = path.resolve(process.cwd(), "projects", p.id);
    if (fs.existsSync(path.join(projDir, "system.exo")) ||
        fs.existsSync(path.join(projDir, ".exocore.json"))) {
        console.log(`   ✓ ${p.id} already exists — skipping create.`);
        return Promise.resolve();
    }

    const body = JSON.stringify({
        templateId:  p.templateId,
        projectName: p.id,
        author:      USER_LOGIN,
        description: p.description,
    });

    const u = new URL(`${BASE}/api/editor/templates/create-from-template`);

    return new Promise<void>((resolve) => {
        const req = http.request(
            {
                hostname: u.hostname,
                port:     u.port || 80,
                path:     u.pathname,
                method:   "POST",
                headers:  {
                    "Content-Type":   "application/json",
                    "Content-Length": Buffer.byteLength(body),
                    "Accept":         "text/event-stream",
                },
                timeout: 60_000,
            },
            (res) => {
                let buf = "";
                let finished = false;
                const finish = () => {
                    if (finished) return;
                    finished = true;
                    resolve();
                };
                res.setEncoding("utf8");
                res.on("data", (chunk: string) => {
                    buf += chunk;
                    // Parse SSE frames separated by blank lines.
                    let idx;
                    while ((idx = buf.indexOf("\n\n")) !== -1) {
                        const frame = buf.slice(0, idx);
                        buf = buf.slice(idx + 2);
                        for (const line of frame.split("\n")) {
                            if (!line.startsWith("data:")) continue;
                            try {
                                const payload = JSON.parse(line.slice(5).trim());
                                if (payload.status === "done" || payload.status === "error") {
                                    if (payload.status === "error") {
                                        console.log(`   ⚠️  ${p.id} create error:`, (payload.log || "").trim());
                                    } else {
                                        console.log(`   ✓ ${p.id} created`);
                                    }
                                    res.destroy();
                                    finish();
                                    return;
                                }
                            } catch { /* ignore non-JSON heartbeats */ }
                        }
                    }
                });
                res.on("end", finish);
                res.on("error", finish);
            },
        );
        req.on("error", (err) => {
            console.log(`   ⚠️  ${p.id} create request failed:`, err.message);
            resolve();
        });
        req.on("timeout", () => {
            console.log(`   ⚠️  ${p.id} create request timed out`);
            req.destroy();
            resolve();
        });
        req.write(body);
        req.end();
    });
}

async function ensureDemoProjects() {
    console.log("📦 ensuring demo projects exist on disk…");
    for (const p of DEMO_PROJECTS) {
        await ensureDemoProject(p);
    }
}

async function clickStatusBtn(page: Page, label: RegExp) {
    const sbButtons = ".status-bar .status-btn";
    await page.evaluate((sel, src, flags) => {
        const re = new RegExp(src, flags);
        const btns = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
        const t = btns.find(b => re.test(b.textContent || ""));
        if (t) t.click();
    }, sbButtons, label.source, label.flags);
    await new Promise(r => setTimeout(r, 1500));
}

async function clickSidebarTab(page: Page, tab: string) {
    await page.evaluate((tabName) => {
        const btns = Array.from(document.querySelectorAll(".sidebar-tabs .tab-btn")) as HTMLElement[];
        const target = btns.find(b => (b.textContent || "").toLowerCase().includes(tabName.toLowerCase()));
        if (target) target.click();
    }, tab);
    await new Promise(r => setTimeout(r, 3000));
}

/**
 * On a < 720 px viewport the sidebar collapses behind a hamburger and the
 * bottom panel becomes a full-screen sheet with a 4-button bottom nav. This
 * helper replaces the desktop status-bar / sidebar-tab clicks with the
 * mobile-equivalents. Falls back to the desktop click if the mobile control
 * isn't present (e.g. the layout hasn't switched yet).
 */
async function openMobileBottom(page: Page, label: RegExp) {
    const ok = await page.evaluate((src, flags) => {
        const re = new RegExp(src, flags);
        const btns = Array.from(document.querySelectorAll(".m-nav-btn, .mobile-nav button")) as HTMLElement[];
        const t = btns.find(b => re.test(b.textContent || "") || re.test(b.getAttribute("aria-label") || ""));
        if (t) { t.click(); return true; }
        return false;
    }, label.source, label.flags);
    if (!ok) await clickStatusBtn(page, label);
    await new Promise(r => setTimeout(r, 1500));
}

async function openMobileSidebar(page: Page, tab: string) {
    // The mobile drawer is toggled by the bottom-nav "Files" m-nav-btn.
    // Only click if the drawer is currently closed (button without `.active`),
    // otherwise re-clicking would CLOSE the drawer we just opened.
    await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll(".m-nav-btn, .mobile-nav button")) as HTMLElement[];
        const filesBtn = btns.find(b => /files/i.test(b.textContent || ""));
        if (filesBtn && !filesBtn.classList.contains("active")) filesBtn.click();
    });
    await new Promise(r => setTimeout(r, 1200));
    await clickSidebarTab(page, tab);
}

async function closeMobileSidebar(page: Page) {
    // Tap the dedicated close button if present, else toggle Files off.
    await page.evaluate(() => {
        const close = document.querySelector(".sidebar-close-btn") as HTMLElement | null;
        if (close && close.offsetParent !== null) { close.click(); return; }
        const btns = Array.from(document.querySelectorAll(".m-nav-btn, .mobile-nav button")) as HTMLElement[];
        const filesBtn = btns.find(b => /files/i.test(b.textContent || ""));
        if (filesBtn && filesBtn.classList.contains("active")) filesBtn.click();
    });
    await new Promise(r => setTimeout(r, 800));
}

async function stopRunningServer(page: Page) {
    // After the Console "Start" click, the dev server keeps streaming output
    // into the page which can starve subsequent screenshots on mobile. Click
    // the matching Stop / Kill button if it's visible.
    await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button")) as HTMLElement[];
        const stop = btns.find(b => /^(stop|kill|■|\u25A0)$/i.test((b.textContent || "").trim()) && b.offsetParent !== null);
        if (stop) stop.click();
    });
    await new Promise(r => setTimeout(r, 1500));
}

async function closeTopModal(page: Page) {
    await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll("button")).filter(b => {
            if (!(b as HTMLElement).offsetParent) return false;
            const svg = b.querySelector("svg");
            if (!svg) return false;
            const txt = (b.textContent || "").trim();
            return txt === "" || /^×$/.test(txt);
        }) as HTMLElement[];
        if (candidates.length) candidates[candidates.length - 1].click();
    });
    await new Promise(r => setTimeout(r, 800));
}

/* ----------------------- per-viewport capture pass ----------------------- */

async function capturePass(
    browser: Browser,
    viewport: typeof DESKTOP | typeof MOBILE,
    label: "desktop" | "mobile",
) {
    console.log(`\n=== Viewport: ${label} (${viewport.width}x${viewport.height}) ===`);

    const outDir = label === "desktop" ? OUT : path.join(OUT, "mobile");
    fs.mkdirSync(outDir, { recursive: true });

    // Fresh server-side gate state for this viewport.
    resetGate();
    await new Promise(r => setTimeout(r, 800));

    const ctx  = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport(viewport);
    await page.setDefaultNavigationTimeout(30000);
    if (viewport.isMobile) {
        await page.setUserAgent(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
            "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
    }

    // 1) Initial gate page (proof shot)
    await page.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(r => setTimeout(r, 1800));
    await snap(page, "00-panel-gate", outDir);
    await unlockPanelSetup(page);

    const ok = await loginUser(page);
    if (!ok) { console.error(`login failed (${label}) — abort viewport`); await page.close(); await ctx.close(); return; }

    /* ===== Node project: exorepo-demo ===== */
    await openProject(page, "exorepo-demo", true);

    // 2) Default editor view
    await snap(page, "01-editor-default", outDir);

    // 3) Open index.js in editor by clicking the file in the explorer
    await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll(".tree-row")) as HTMLElement[];
        const target = rows.find(r => /index\.js/i.test(r.textContent || ""));
        if (target) target.click();
    });
    await new Promise(r => setTimeout(r, 3500));
    await snap(page, "02-editor-explorer-file", outDir);

    // 4) Terminal pane
    if (viewport.isMobile) await openMobileBottom(page, /terminal/i);
    await snap(page, "03-editor-terminal", outDir);

    // 5) Console pane → on desktop start the server for live logs; on mobile
    //    skip the actual Run click because the dev server output stream
    //    floods the chromium tab and detaches the page session for every
    //    later step.
    if (viewport.isMobile) await openMobileBottom(page, /console/i);
    else                   await clickStatusBtn(page, /console/i);
    if (!viewport.isMobile) {
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll("button")) as HTMLElement[];
            const run = btns.find(b => /^(start|run|▶)$/i.test((b.textContent || "").trim()) && b.offsetParent !== null);
            if (run) run.click();
        });
        await new Promise(r => setTimeout(r, 7000));
    } else {
        await new Promise(r => setTimeout(r, 2500));
    }
    await snap(page, "04-editor-console", outDir);
    if (!viewport.isMobile) await stopRunningServer(page);

    // 6) Webview pane — on mobile, the embedded preview iframe consistently
    //    crashes the headless chromium target (the page session detaches and
    //    every subsequent puppeteer call fails). Skip it on mobile and only
    //    attempt the capture in the desktop pass where it's stable.
    if (!viewport.isMobile) {
        await safeStep("webview", async () => {
            await clickStatusBtn(page, /preview/i);
            await new Promise(r => setTimeout(r, 6000));
            await snap(page, "05-editor-webview", outDir);
        });
    } else {
        console.log("   ⏭  skipping webview on mobile (chromium target crash workaround)");
    }

    // 7) Problems pane
    await safeStep("problems", async () => {
        if (viewport.isMobile) await openMobileBottom(page, /problem|error|warning/i);
        else                   await clickStatusBtn(page, /error|warning|problem/i);
        await new Promise(r => setTimeout(r, 2000));
        await snap(page, "06-editor-problems", outDir);
    });

    // 8) Sidebar tabs: NPM / GitHub / Drive / AI
    const switchSidebar = async (tab: string) => {
        if (viewport.isMobile) await openMobileSidebar(page, tab);
        else                   await clickSidebarTab(page, tab);
    };

    await safeStep("sidebar:npm", async () => {
        await switchSidebar("npm");
        await new Promise(r => setTimeout(r, 4500));
        await snap(page, "07-sidebar-npm", outDir);
    });

    await safeStep("sidebar:git", async () => {
        await switchSidebar("git");
        await new Promise(r => setTimeout(r, 3500));
        await snap(page, "08-sidebar-github", outDir);
    });

    await safeStep("sidebar:drive", async () => {
        await switchSidebar("drive");
        await new Promise(r => setTimeout(r, 3500));
        await snap(page, "09-sidebar-drive", outDir);
    });

    await safeStep("sidebar:ai", async () => {
        await switchSidebar("ai");
        await new Promise(r => setTimeout(r, 3500));
        await snap(page, "10-sidebar-ai", outDir);
    });

    // 9) Switch back to explorer + open History modal
    await safeStep("history-modal", async () => {
        await switchSidebar("explorer");
        await new Promise(r => setTimeout(r, 1500));
        await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll(".tree-row")) as HTMLElement[];
            const target = rows.find(r => /index\.js/i.test(r.textContent || ""));
            if (target) target.click();
        });
        await new Promise(r => setTimeout(r, 2500));
        await clickAriaLabel(page, "Code history");
        await new Promise(r => setTimeout(r, 3500));
        await snap(page, "11-history-modal", outDir);
        await closeTopModal(page);
    });

    // 10) Settings modal
    await safeStep("settings-modal", async () => {
        await clickAriaLabel(page, "Settings");
        await new Promise(r => setTimeout(r, 3000));
        await snap(page, "12-settings-modal", outDir);
    });

    // 11) Switch theme
    await safeStep("settings-theme", async () => {
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll("button, .theme-card, .theme-item, [role='button']")) as HTMLElement[];
            const target = btns.find(b => /dracula/i.test((b.textContent || "")) && b.offsetParent !== null);
            if (target) target.click();
        });
        await new Promise(r => setTimeout(r, 2500));
        await snap(page, "13-settings-theme-changed", outDir);
        await closeTopModal(page);
    });

    /* ===== Python project: exorepo-py — PyLibs pane ===== */
    await safeStep("python:pylib", async () => {
        await openProject(page, "exorepo-py", false);
        await switchSidebar("pypi");
        await new Promise(r => setTimeout(r, 5000));
        await snap(page, "14-sidebar-pylib", outDir);
    });

    try { await page.close(); } catch { /* already closed */ }
    try { await ctx.close();  } catch { /* already gone   */ }
}

// Catch any orphan rejections from the puppeteer/chromium internals so the
// whole script doesn't die silently mid-pass — we'd much rather log the
// failure and continue with whatever screenshots we managed to capture.
process.on("unhandledRejection", (reason) => {
    const msg = (reason as any)?.message || String(reason);
    console.warn("⚠️  unhandledRejection:", msg.split("\n")[0]);
});
process.on("uncaughtException", (err) => {
    console.warn("⚠️  uncaughtException:", (err?.message || String(err)).split("\n")[0]);
});

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    fs.mkdirSync(path.join(OUT, "mobile"), { recursive: true });

    // Auto-create the demo projects ONCE up-front so both viewport passes can
    // open them without repeating the work. The templates endpoint is public
    // (no auth required) — it just writes files under ./projects.
    await ensureDemoProjects();

    const browser: Browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.CHROMIUM_PATH ||
            "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium",
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--ignore-certificate-errors",
        ],
    });

    for (const vp of [DESKTOP, MOBILE] as const) {
        const label = vp.isMobile ? "mobile" : "desktop";
        if (VIEWPORT_FILTER && VIEWPORT_FILTER !== label) {
            console.log(`(skipping ${label} — VIEWPORT=${VIEWPORT_FILTER})`);
            continue;
        }
        await capturePass(browser, vp, label);
    }

    await browser.close();
    console.log("\n🎉 Editor screenshots written to", OUT);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
