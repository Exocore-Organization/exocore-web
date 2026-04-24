import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Hugging Face Spaces (Static) serves the build artifact from the Space root,
// so leaving `base: "./"` keeps every asset URL relative — that way the site
// also works when previewed locally, hosted on GitHub Pages under a subpath,
// or dropped behind any other static host without rewriting paths.
//
// The docs corpus and screenshots now live inside this project (under
// `./docs/` and `./public/screenshots/` respectively), so there is no longer
// any cross-workspace alias — `exocore-docs/` builds standalone.
export default defineConfig({
    plugins: [react()],
    base:    "./",
    server:  {
        host: "0.0.0.0",
        port: 5173,
        // Replit / HF preview uses an iframe proxy on a different origin —
        // accept any Host header so the dev server doesn't reject requests.
        allowedHosts: true,
    },
    preview: {
        host: "0.0.0.0",
        port: 4173,
        allowedHosts: true,
    },
    build: {
        outDir: "dist",
        emptyOutDir: true,
        sourcemap: false,
        // Hugging Face proxies through nginx — keep assets reasonably sized.
        chunkSizeWarningLimit: 1000,
    },
});
