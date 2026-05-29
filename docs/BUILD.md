# Building from Source

The `exocore-ide` binary is pre-compiled and tracked in the repo via Git LFS.
You can run it directly without any compilation steps.

## Quick Start

```bash
git clone https://github.com/Exocore-Organization/exocore-web.git
cd exocore-web

# Run directly — no build needed
./exocore-ide
```

Open **http://localhost:5000/exocore** and set up your master account.

## Re-compiling (for contributors)

If you want to compile from source:

### Prerequisites

- **Deno** v2.x — [install](https://docs.deno.com/runtime/manual/getting_started/installation)
- **Rust** (optional, for PTY helper) — [rustup](https://rustup.rs/)

### Steps

```bash
# Build PTY helper (optional, enables full terminal)
cd tools/pty-helper && cargo build --release && cd ../..
cp tools/pty-helper/target/release/pty-helper tools/pty-helper/bin/pty-helper-linux-x64

# Compile Exocore IDE
deno task compile

# Run
./exocore-ide
```

## Platform Builds

```bash
deno task compile-linux     # x86_64 Linux
deno task compile-mac       # x86_64 macOS
deno task compile-mac-arm   # ARM macOS
deno task compile-win       # x86_64 Windows
```

## Docker

```bash
docker build -t exocore-ide .
docker run -p 5000:5000 -v $(pwd)/data:/data exocore-ide
```

## Notes

- Compiled binary is ~310MB (includes all npm packages + static assets)
- Cross-compilation with Deno targets — PTY helper must be compiled separately per target
- `deno.json` already includes all required `--allow-*` flags
