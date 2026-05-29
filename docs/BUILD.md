# Building from Source

## Prerequisites

- **Deno** v2.x — [install](https://docs.deno.com/runtime/manual/getting_started/installation)
- **Rust** (optional, for PTY helper) — [rustup](https://rustup.rs/)

## Steps

```bash
git clone https://github.com/Exocore-Organization/exocore-web.git
cd exocore-web

# Build PTY helper (optional, enables full terminal)
cd tools/pty-helper && cargo build --release && cd ../..
cp tools/pty-helper/target/release/pty-helper tools/pty-helper/bin/pty-helper-linux-x64

# Compile Exocore Web
deno task compile

# Run
./exocore-web
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
docker build -t exocore-web .
docker run -p 8080:8080 -v $(pwd)/data:/data exocore-web
```

## Notes

- Compiled binary is ~150MB (includes all npm packages + static assets)
- Cross-compilation with Deno targets — PTY helper must be compiled separately per target
- `deno.json` already includes all required `--allow-*` flags
