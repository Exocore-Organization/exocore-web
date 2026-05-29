# Building from Source

## Prerequisites

- **Deno** v2.x — [install guide](https://docs.deno.com/runtime/manual/getting_started/installation)
- **Rust** (optional, for PTY helper) — [rustup](https://rustup.rs/)

## Build Steps

### 1. Clone the Repository

```bash
git clone https://github.com/Exocore-Organization/exocore-web.git
cd exocore-web
```

### 2. Build the PTY Helper (Optional but Recommended)

The PTY helper provides native terminal support. Without it, a line-shell fallback is used.

```bash
cd tools/pty-helper
cargo build --release
cd ../..
```

The compiled binary will be at `tools/pty-helper/target/release/pty-helper`. Copy it to `tools/pty-helper/bin/`:

```bash
mkdir -p tools/pty-helper/bin
cp tools/pty-helper/target/release/pty-helper tools/pty-helper/bin/pty-helper-linux-x64
```

### 3. Compile Exocore Web

```bash
deno task compile
```

This produces a single standalone binary `exocore-web` (~150MB).

### 4. Run

```bash
./exocore-web
```

Visit **http://localhost:8080/exocore** and set up your master account.

## Cross-Compilation

Build for other platforms using Deno's cross-compilation targets:

```bash
# Linux x86_64
deno task compile-linux

# macOS x86_64
deno task compile-mac

# macOS ARM (Apple Silicon)
deno task compile-mac-arm

# Windows x86_64
deno task compile-win
```

Note: Cross-compilation requires the Rust PTY helper to be compiled separately for each target.

## Full Build (Automated)

Use the build script to compile both the PTY helper and Deno binary in one step:

```bash
deno run -A build.ts
```

This runs `cargo build --release` first, then `deno compile`.

## Docker Build

```bash
docker build -t exocore-web .
docker run -p 8080:8080 -v $(pwd)/data:/data exocore-web
```

## Project Structure

```
exocore-web/
├── deno.json              # Main configuration (import map, compile tasks)
├── build.ts               # Automated build script
├── Dockerfile             # Docker image
├── linux.sh               # Linux installer
├── termux.sh              # Termux installer
├── window.bat             # Windows CMD installer
├── install.ps1            # Windows PowerShell installer
├── tools/pty-helper/      # Rust PTY helper source
│   ├── Cargo.toml
│   └── src/main.rs
├── backup/exocore-ide/    # Application source code
│   ├── packages/
│   │   ├── index.ts       # Entry point
│   │   └── app.ts         # Express app setup
│   ├── routes/            # API route handlers
│   ├── server/            # WebSocket, RPC, services
│   └── static-pages/      # Frontend HTML, CSS, JS
└── docs/                  # Documentation
```

## Troubleshooting

### Binary Too Large
The compiled binary includes all npm packages and static assets. Expect ~150MB.

### Permission Errors
Ensure `--allow-sys` is included in compile flags. Our `deno.json` already includes it.

### Rust Compilation Failed
If `cargo build` fails, the Deno build will still proceed. The terminal will use the line-shell fallback instead of a full PTY.
