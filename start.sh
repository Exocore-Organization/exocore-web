#!/bin/bash

export PORT=7860
export DENO_DIR=/tmp/deno

export BOX64_DYNAREC_FASTMEM=0
export BOX64_DYNAREC_STRONGMEM=1
export BOX64_DYNAREC_SAFEFLAGS=1

chmod +x ./exocore-ide

echo "Starting Exocore IDE on http://localhost:$PORT (Press CTRL+C to stop)..."
box64 ./exocore-ide
