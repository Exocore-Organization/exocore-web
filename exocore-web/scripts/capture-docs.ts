/**
 * Capture screenshots of every Exocore panel route in both desktop and
 * mobile viewports using bundled Chromium (via Puppeteer).
 *
 *   npx tsx exocore-web/scripts/capture-docs.ts
 *
 * For each viewport:
 *   1. Reset the panel-devs gate (delete devs.json + sessions.json).
 *   2. Open a fresh Chromium window (no shared cookies).
 *   3. Capture the gate in setup mode.
 *   4. Submit the gate (creates the master account).
 *   5. Capture the unauthenticated public auth pages (home / login / register / …).
 *   6. Log in as @choruyt so authenticated pages render real content.
 *   7. Capture authenticated pages (dashboard, profile, leaderboard, editor).
 *
 * Includes long sleeps + image-load awaits (incl. CSS background covers)
 * so that lazy avatars / cover banners are present in the PNG.
 *
 * Important: the rate-limit bypass (`EXOCORE_CAPTURE=1`) is auto-injected
 * before the workflow starts. The capture script only forwards it; if you
 * run this against an already-running server, restart it with that env
 * first.
 */
import puppeteer, { Browser, Page } from "puppeteer";
import fs from "fs";
import path from "path";

const BASE = process.env.EXOCORE_BASE || "http://localhost:5000/exocore";
const OUT  = path.resolve("exocore-web/docs/screenshots");

// Mobile DPR=1 keeps the PNG ~390 px wide so it embeds at a readable size
// in the markdown without HTML width hacks.
const DESKTOP = { width: 1440, height: 900,  isMobile: false, deviceScaleFactor: 1 };
const MOBILE  = { width: 414,  height: 896,  isMobile: true,  deviceScaleFactor: 1, hasTouch: true };

const PANEL_USER = process.env.EXO_PANEL_USER || "Choruyt";
const PANEL_PASS = process.env.EXO_PANEL_PASS || "ex123";

const USER_LOGIN = process.env.EXO_LOGIN_USER || "choruyt";
const USER_PASS  = process.env.EXO_LOGIN_PASS || "Stevepen4321!";

const DEVS_JSON     = path.resolve("exocore-web/client/access/devs.json");
const SESSIONS_JSON = path.resolve("exocore-web/client/access/sessions.json");

// Long sleep before screenshotting "stalk" pages so lazy avatars + cover
// images definitely arrive before the snapshot. Configurable via env.
const PROFILE_WAIT_MS = Number(process.env.EXO_PROFILE_WAIT_MS || 22000);

interface Shot {
    slug: string;
    label: string;
    path: string;
    waitMs?: number;
    requireAuth?: boolean;        // if true, capture only after user login
    fullPage?: boolean;
    waitForBgCover?: boolean;     // wait for `.prof-cover` background image
    actions?: (p: Page) => Promise<void>;
}

const SHOTS: Shot[] = [
    // Public (panel only)
    { slug: "01-panel-gate",      label: "Panel Devs Gate",       path: "/",                waitMs: 1800 },
    { slug: "02-home-landing",    label: "Home / Landing",        path: "/",                waitMs: 2000 },
    { slug: "03-login",           label: "Login",                 path: "/login",           waitMs: 2000 },
    { slug: "04-register",        label: "Register",              path: "/register",        waitMs: 2000 },
    { slug: "05-forgot-password", label: "Forgot Password",       path: "/forgot",          waitMs: 2000 },
    { slug: "06-verify-pending",  label: "Verify Pending",        path: "/verify-pending",  waitMs: 2000 },
    // Authenticated
    { slug: "07-dashboard",       label: "Dashboard",             path: "/dashboard",        waitMs: 7000,            requireAuth: true },
    { slug: "08-leaderboard",     label: "Leaderboard",           path: "/leaderboard",      waitMs: 6000,            requireAuth: true },
    { slug: "09-profile-self",    label: "Profile (own)",         path: `/u/@${USER_LOGIN}`, waitMs: PROFILE_WAIT_MS, requireAuth: true, waitForBgCover: true },
    { slug: "10-profile-other",   label: "Profile (stalk)",       path: "/u/@skibide",       waitMs: PROFILE_WAIT_MS, requireAuth: true, waitForBgCover: true },
    { slug: "11-editor",          label: "Editor / IDE",          path: "/editor",           waitMs: 8000,            requireAuth: true },
];

const VIEWPORT_FILTER = (process.env.VIEWPORT || "").toLowerCase(); // "desktop" | "mobile" | ""

function resetGate() {
    for (const f of [DEVS_JSON, SESSIONS_JSON]) {
        try { fs.unlinkSync(f); } catch { /* missing ok */ }
    }
}

async function waitForImages(page: Page, timeout = 12000) {
    try {
        await page.waitForFunction(
            () => {
                const imgs = Array.from(document.images);
                return imgs.length === 0 || imgs.every(i => i.complete && i.naturalWidth > 0);
            },
            { timeout },
        );
    } catch { /* swallow */ }
}

/**
 * Wait until the profile cover banner has actually painted its background
 * image — `<div class="prof-cover" style="background-image:url(...)">`.
 * The default `waitForImages` only inspects `<img>` tags.
 */
async function waitForCoverBg(page: Page, timeout = 15000) {
    try {
        await page.waitForFunction(
            () => {
                const cov = document.querySelector(".prof-cover") as HTMLElement | null;
                if (!cov) return true;
                const bg = cov.style.backgroundImage || getComputedStyle(cov).backgroundImage;
                const match = bg && bg.match(/url\(["']?(.*?)["']?\)/);
                if (!match) return true;
                return new Promise<boolean>(resolve => {
                    const probe = new Image();
                    probe.onload  = () => resolve(true);
                    probe.onerror = () => resolve(true);
                    probe.src = match[1];
                });
            },
            { timeout },
        );
    } catch { /* swallow */ }
}

async function shoot(page: Page, viewportLabel: "desktop" | "mobile", shot: Shot) {
    const url = `${BASE}${shot.path}`;
    console.log(` → [${viewportLabel}] ${shot.slug}  ${url}`);
    try {
        await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    } catch (err) {
        console.log("    nav timeout, continuing:", (err as Error).message.slice(0, 80));
    }
    await new Promise(r => setTimeout(r, shot.waitMs ?? 2000));
    await waitForImages(page);
    if (shot.waitForBgCover) await waitForCoverBg(page);
    if (shot.actions) {
        try { await shot.actions(page); } catch (e) { console.log("    action err:", (e as Error).message); }
        await new Promise(r => setTimeout(r, 1500));
        await waitForImages(page);
    }
    const file = path.join(OUT, viewportLabel, `${shot.slug}.png`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, fullPage: shot.fullPage !== false, type: "png" });
    console.log("   📸", path.relative(process.cwd(), file));
}

/**
 * React-compatible "type into input": directly sets `.value` and fires
 * the native input + change events so React's controlled `onChange`
 * actually picks the value up. Plain Puppeteer `.type()` works on
 * desktop but flakes hard on the mobile/touch viewport.
 */
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

/** Fill the panel-devs setup form — user / password / confirm — then submit. */
async function unlockPanelSetup(page: Page) {
    console.log("🔐 unlocking panel-devs gate (setup)…");
    await page.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500));

    const inputCount = await page.$$eval("form input", (els) => els.length);
    if (inputCount === 0) {
        console.log("   no inputs — already authenticated.");
        return;
    }
    // Fill the first 1–3 inputs. Setup screen has 3 (user/pass/confirm),
    // re-login screen has 2.
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

    // Click the explicit submit instead of pressing Enter (more reliable
    // on the mobile/touch viewport).
    const submit = await page.$("form button[type=submit]");
    if (submit) await submit.click();
    else        await page.keyboard.press("Enter");

    await new Promise(r => setTimeout(r, 4500));

    const stillGated = await page.evaluate(() =>
        /First run|Welcome back|Create your panel account/i.test(document.body.innerText),
    );
    if (stillGated) {
        console.log("   ⚠️  retrying explicit submit…");
        const btn = await page.$("form button[type=submit]");
        if (btn) await btn.click();
        await new Promise(r => setTimeout(r, 3500));
    }
    console.log("   ✅ panel unlocked");
}

/** Log in as the supplied @user and wait for navigation off /login. */
async function loginUser(page: Page) {
    console.log(`🔑 logging in as @${USER_LOGIN}…`);
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500));

    // Wait for the Login form to actually mount (lazy-loaded route).
    try {
        await page.waitForSelector("form input[autocomplete='username']", { timeout: 10000 });
    } catch {
        console.log("   ⚠️  login form did not mount in time");
    }

    await fillInput(page, "form input[autocomplete='username']",         USER_LOGIN);
    await fillInput(page, "form input[autocomplete='current-password']", USER_PASS);

    // Click the submit button explicitly (Enter is unreliable on touch viewport).
    const submit = await page.$("form button[type=submit]");
    if (submit) {
        await Promise.all([
            page.waitForNavigation({ waitUntil: "networkidle2", timeout: 25000 }).catch(() => null),
            submit.click(),
        ]);
    } else {
        await Promise.all([
            page.waitForNavigation({ waitUntil: "networkidle2", timeout: 25000 }).catch(() => null),
            page.keyboard.press("Enter"),
        ]);
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

(async () => {
    fs.mkdirSync(path.join(OUT, "desktop"), { recursive: true });
    fs.mkdirSync(path.join(OUT, "mobile"),  { recursive: true });

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
        console.log(`\n=== Viewport: ${label} (${vp.width}x${vp.height}) ===`);

        // Fresh server-side gate state for this viewport.
        resetGate();
        await new Promise(r => setTimeout(r, 800));

        // Fresh browser context — isolated cookies / localStorage.
        const ctx  = await browser.createBrowserContext();
        const page = await ctx.newPage();
        await page.setViewport(vp);
        await page.setDefaultNavigationTimeout(30000);
        if (vp.isMobile) {
            await page.setUserAgent(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
        }

        // 1) Capture gate in raw setup state.
        await shoot(page, label, SHOTS[0]);

        // 2) Submit gate so the rest of the SPA loads.
        await unlockPanelSetup(page);

        // 3) Capture all public auth screens.
        for (const s of SHOTS) {
            if (s.slug === "01-panel-gate") continue;
            if (s.requireAuth) continue;
            await shoot(page, label, s);
        }

        // 4) Log in as the real user.
        const ok = await loginUser(page);
        if (!ok) {
            console.log("⚠️  skipping authenticated routes for this viewport.");
        } else {
            for (const s of SHOTS) {
                if (!s.requireAuth) continue;
                await shoot(page, label, s);
            }
        }

        await page.close();
        await ctx.close();
    }

    await browser.close();
    console.log("\n🎉 All screenshots written to", OUT);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
