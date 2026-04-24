/**
 * Run the JavaScript obfuscator over every .js file in dist/ in-place.
 *
 * Designed to run AFTER `npm run build` (tsc → dist/) so the published
 * artifact is a hardened JS bundle that's painful to read or edit by hand.
 * Invoked automatically by `npm run build:secure`.
 *
 *   node scripts/obfuscate-dist.js [optional/dist/path]
 */
const fs   = require("fs");
const path = require("path");

let obfuscator;
try {
    obfuscator = require("javascript-obfuscator");
} catch {
    console.error(
        "[obfuscate] javascript-obfuscator is not installed.\n" +
        "            run:   npm install --save-dev javascript-obfuscator",
    );
    process.exit(1);
}

const DIST = path.resolve(process.cwd(), process.argv[2] || "dist");
if (!fs.existsSync(DIST)) {
    console.error(`[obfuscate] dist directory not found: ${DIST}`);
    console.error("            did you forget to `npm run build` first?");
    process.exit(1);
}

const OPTIONS = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.6,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.3,
    stringArray: true,
    stringArrayEncoding: ["base64"],
    stringArrayThreshold: 0.75,
    identifierNamesGenerator: "hexadecimal",
    renameGlobals: false,
    selfDefending: true,
    simplify: true,
    transformObjectKeys: true,
    unicodeEscapeSequence: false,
    target: "node",
};

const stats = { files: 0, bytesIn: 0, bytesOut: 0, skipped: 0 };

function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const st   = fs.statSync(full);
        if (st.isDirectory()) {
            walk(full);
            continue;
        }
        if (!full.endsWith(".js")) continue;
        // Skip third-party shims that were copied verbatim into dist
        // (none today, but future-proofing).
        if (full.includes(`${path.sep}vendor${path.sep}`)) {
            stats.skipped++;
            continue;
        }
        const src = fs.readFileSync(full, "utf8");
        try {
            const out = obfuscator.obfuscate(src, OPTIONS).getObfuscatedCode();
            fs.writeFileSync(full, out);
            stats.files++;
            stats.bytesIn  += Buffer.byteLength(src);
            stats.bytesOut += Buffer.byteLength(out);
        } catch (err) {
            console.error(`[obfuscate] FAILED ${path.relative(DIST, full)}: ${err.message}`);
            process.exit(1);
        }
    }
}

console.log(`[obfuscate] hardening ${DIST}…`);
walk(DIST);
const ratio = stats.bytesIn ? (stats.bytesOut / stats.bytesIn).toFixed(2) : "0";
console.log(
    `[obfuscate] done — ${stats.files} files, ${stats.skipped} skipped, ` +
    `${(stats.bytesIn / 1024).toFixed(1)}KB → ${(stats.bytesOut / 1024).toFixed(1)}KB ` +
    `(×${ratio})`,
);
