const SOURCE_DIR = "backup/exocore-ide";
const OUT_BINARY = "exocore-ide";
const PTY_DIR = "tools/pty-helper";
const PTY_OUT = "tools/pty-helper/bin/pty-helper-linux-x64";

const srcExists = await Deno.stat(`${SOURCE_DIR}/index.tsx`).then(() => true).catch(() => false);
if (!srcExists) {
  console.error(`[build] Source not found at ${SOURCE_DIR}/`);
  console.error("Expected: backup/exocore-ide/index.tsx");
  Deno.exit(1);
}

// Step 1: Compile Rust PTY helper
console.log(`[build] Compiling PTY helper (tools/pty-helper/) ...`);
try {
  const ptyBuild = new Deno.Command("cargo", {
    args: ["build", "--release"],
    cwd: PTY_DIR,
    stdout: "inherit",
    stderr: "inherit",
  });
  const ptyCode = (await ptyBuild.spawn().output()).code;
  if (ptyCode !== 0) {
    console.warn(`[build] PTY helper build failed (exit ${ptyCode}). Continuing without it.`);
  } else {
    await Deno.mkdir("tools/pty-helper/bin", { recursive: true });
    await Deno.copyFile(`${PTY_DIR}/target/release/pty-helper`, PTY_OUT);
    console.log(`[build] PTY helper built: ${PTY_OUT}`);
  }
} catch (err) {
  console.warn(`[build] PTY helper unavailable (${err.message}). Continuing without it.`);
}

// Copy PTY helper into source dir (for --include) and repo root (for git tracking / Dockerfile)
const PTY_HELPER_BIN = "pty-helper-linux-x64";
if (await Deno.stat(PTY_OUT).then(() => true).catch(() => false)) {
  await Deno.copyFile(PTY_OUT, `${SOURCE_DIR}/${PTY_HELPER_BIN}`);
  console.log(`[build] PTY helper bundled: ${SOURCE_DIR}/${PTY_HELPER_BIN}`);
  await Deno.copyFile(PTY_OUT, PTY_HELPER_BIN);
  console.log(`[build] PTY helper copied to repo root: ${PTY_HELPER_BIN}`);
}

// Step 2: Compile Deno binary (from within SOURCE_DIR so --include uses bare dir names)
console.log(`[build] Compiling ${SOURCE_DIR}/index.tsx \u2192 ${OUT_BINARY} ...`);

const denoCmd = new Deno.Command("deno", {
  args: [
    "compile",
    "--no-check",
    "--config", "../../deno.json",
    "--allow-net",
    "--allow-read",
    "--allow-write",
    "--allow-run",
    "--allow-env",
    "--allow-sys",
    "--unstable-sloppy-imports",
    "--unstable-node-globals",
    "--include", "static-pages",
    "--include", "templates",
    "--include", "extension",
    "--include", "scripts",
    "--include", "routes",
    "--include", PTY_HELPER_BIN,
    "--output", `../../${OUT_BINARY}`,
    "index.tsx",
  ],
  cwd: SOURCE_DIR,
  stdout: "piped",
  stderr: "piped",
});

const { code } = await denoCmd.spawn().output();
if (code !== 0) {
  console.error(`[build] Deno compile failed with exit code ${code}`);
  Deno.exit(code);
}

await Deno.chmod(OUT_BINARY, 0o755);
const stats = await Deno.stat(OUT_BINARY);
const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
console.log(`[build] Done: ${OUT_BINARY} (${sizeMB} MB)`);
