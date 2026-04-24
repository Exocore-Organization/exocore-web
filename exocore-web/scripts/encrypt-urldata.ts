/**
 * One-shot helper that encrypts `exocore-web/routes/urlData.json` into the
 * sibling `urlData.enc` vault. Run it whenever you change the upstream URL
 * config or want to rotate the AES nonce/salt.
 *
 *   npx tsx exocore-web/scripts/encrypt-urldata.ts
 *
 * After a successful encrypt the script also rewrites the legacy plain JSON
 * to a small marker so it stops being a usable copy of the secret. To
 * disable that wipe (e.g. while testing locally) pass `--keep-plain`.
 */
import fs from "fs";
import path from "path";
import { rotateVault, loadUrlConfig } from "../routes/_urlVault";

const KEEP_PLAIN = process.argv.includes("--keep-plain");

const ROUTES_DIR = path.resolve("exocore-web/routes");
const PLAIN_PATH = path.join(ROUTES_DIR, "urlData.json");

(async () => {
    const { vaultPath } = rotateVault(ROUTES_DIR);
    console.log(`✓ vault written: ${path.relative(process.cwd(), vaultPath)}`);

    // Sanity-check: round-trip decrypt the file we just produced.
    const cfg = loadUrlConfig(ROUTES_DIR);
    console.log(`✓ decrypt round-trip ok — keys: ${Object.keys(cfg).join(", ")}`);

    if (!KEEP_PLAIN && fs.existsSync(PLAIN_PATH)) {
        const placeholder = {
            _comment:
                "This file is no longer the source of truth — see urlData.enc next to it. " +
                "Re-encrypt by running `npx tsx exocore-web/scripts/encrypt-urldata.ts`.",
            preferLocal: true,
        };
        fs.writeFileSync(PLAIN_PATH, JSON.stringify(placeholder, null, 2) + "\n", "utf-8");
        console.log(`✓ legacy ${path.basename(PLAIN_PATH)} reduced to placeholder`);
    } else if (KEEP_PLAIN) {
        console.log("• --keep-plain set — left urlData.json untouched");
    }
})().catch((err) => {
    console.error("FATAL", err);
    process.exit(1);
});
