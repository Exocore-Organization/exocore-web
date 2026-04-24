/**
 * One-shot top-up for mobile editor frames that the main capture pass tends
 * to drop on the chromium 138 mobile profile:
 *
 *   - 13-settings-theme-changed (the .theme-card click misses because the
 *     mobile Settings modal lays its theme tiles out under a different
 *     selector tree).
 *   - 14-sidebar-pylib (the python project switch happens at the very end of
 *     the main pass, by which time the page session has often detached).
 *
 * Each frame is captured in its own fresh browser context so a failure in
 * one doesn't bleed into the other.
 *
 *   npx tsx exocore-web/scripts/capture-editor-mobile-fix.ts
 */
import puppeteer, { Browser, Page } from "puppeteer";
import fs from "fs";
import path from "path";

const BASE = process.env.EXOCORE_BASE || "http://localhost:5000/exocore";
const OUT  = path.resolve("exocore-web/docs/screenshots/editor/mobile");

const PANEL_USER = process.env.EXO_PANEL_USER || "Choruyt";
const PANEL_PASS = process.env.EXO_PANEL_PASS || "ex123";
const USER_LOGIN = process.env.EXO_LOGIN_USER || "choruyt";
const USER_PASS  = process.env.EXO_LOGIN_PASS || "Stevepen4321!";

const MOBILE = { width: 414, height: 896, isMobile: true, deviceScaleFactor: 1, hasTouch: true };

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

async function unlockPanel(page: Page) {
    // Re-auth the per-machine panel gate — each fresh browser context has no
    // session cookie so it lands on the gate before /login is reachable.
    await page.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500));
    const inputs = await page.$$eval("form input", (els) => els.length);
    if (inputs === 0) return;
    const fillN = Math.min(inputs, 3);
    for (let i = 0; i < fillN; i++) {
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
    await new Promise(r => setTimeout(r, 4000));
}

async function loginUser(page: Page) {
    await unlockPanel(page);
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
    return page.evaluate(() => !!localStorage.getItem("exo_token"));
}

async function newMobilePage(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport(MOBILE);
    await page.setUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
        "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
    return {
        page,
        close: async () => {
            try { await page.close(); } catch {}
            try { await ctx.close();  } catch {}
        },
    };
}

async function snap(page: Page, slug: string) {
    fs.mkdirSync(OUT, { recursive: true });
    const file = path.join(OUT, `${slug}.png`);
    await page.screenshot({ path: file, fullPage: false, type: "png" });
    console.log("📸", path.relative(process.cwd(), file));
}

async function openProjectMobile(page: Page, projectId: string) {
    await page.goto(`${BASE}/editor?project=${encodeURIComponent(projectId)}`, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
    }).catch((e) => console.warn("goto warn:", e?.message));
    await new Promise(r => setTimeout(r, 10000));
}

async function openMobileFiles(page: Page) {
    await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll(".m-nav-btn, .mobile-nav button")) as HTMLElement[];
        const filesBtn = btns.find(b => /files/i.test(b.textContent || ""));
        if (filesBtn && !filesBtn.classList.contains("active")) filesBtn.click();
    });
    await new Promise(r => setTimeout(r, 1200));
}

async function clickSidebarTabByLabel(page: Page, label: RegExp) {
    await page.evaluate((src, flags) => {
        const re = new RegExp(src, flags);
        const btns = Array.from(document.querySelectorAll(".sidebar-tabs .tab-btn")) as HTMLElement[];
        const t = btns.find(b => re.test((b.textContent || "")));
        if (t) t.click();
    }, label.source, label.flags);
    await new Promise(r => setTimeout(r, 4000));
}

async function captureSettingsTheme(browser: Browser) {
    console.log("\n--- 13-settings-theme-changed (mobile) ---");
    const { page, close } = await newMobilePage(browser);
    try {
        const ok = await loginUser(page);
        if (!ok) { console.log("login failed"); return; }
        await openProjectMobile(page, "exorepo-demo");

        // Open Settings via topbar aria-label.
        await page.evaluate(() => {
            const el = document.querySelector("[aria-label='Settings']") as HTMLElement | null;
            el?.click();
        });
        await new Promise(r => setTimeout(r, 3500));

        // Scroll the modal so theme tiles are in view, then click any non-active
        // theme tile we can find. Fall back to ANY button whose text contains a
        // known theme name.
        const switched = await page.evaluate(() => {
            const themeNames = ["dracula", "monokai", "nord", "solarized", "tokyo", "one dark", "github"];
            // Try .theme-card / .theme-item first
            const tiles = Array.from(document.querySelectorAll(
                ".theme-card, .theme-item, [data-theme], .theme-option, .modal button"
            )) as HTMLElement[];
            for (const name of themeNames) {
                const t = tiles.find(b =>
                    new RegExp(name, "i").test(b.textContent || "") &&
                    !b.classList.contains("active") &&
                    b.offsetParent !== null);
                if (t) { t.click(); return name; }
            }
            return null;
        });
        console.log("  theme switched to:", switched || "(none found — snapping current modal)");
        await new Promise(r => setTimeout(r, 2500));
        await snap(page, "13-settings-theme-changed");
    } finally {
        await close();
    }
}

async function capturePylib(browser: Browser) {
    console.log("\n--- 14-sidebar-pylib (mobile) ---");
    const { page, close } = await newMobilePage(browser);
    try {
        const ok = await loginUser(page);
        if (!ok) { console.log("login failed"); return; }
        await openProjectMobile(page, "exorepo-py");
        await openMobileFiles(page);
        await clickSidebarTabByLabel(page, /pypi|pylib|packages/i);
        await snap(page, "14-sidebar-pylib");
    } finally {
        await close();
    }
}

(async () => {
    const browser: Browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.CHROMIUM_PATH ||
            "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium",
        args: [
            "--no-sandbox", "--disable-setuid-sandbox",
            "--disable-dev-shm-usage", "--disable-gpu",
            "--ignore-certificate-errors",
        ],
    });

    try {
        await captureSettingsTheme(browser);
        await capturePylib(browser);
    } finally {
        await browser.close();
    }
    console.log("\n✅ mobile fix-up done");
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
