import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Hugging Face Spaces (Static) serves the build artifact from the Space root,
// so leaving `base: "./"` keeps every asset URL relative — that way the site
// also works when previewed locally, hosted on GitHub Pages under a subpath,
// or dropped behind any other static host without rewriting paths.
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
    resolve: {
        alias: {
            "@docs-content": path.resolve(__dirname, "../exocore-web/docs"),
        },
    },
    build: {
        outDir: "dist",
        emptyOutDir: true,
        sourcemap: false,
        // Hugging Face proxies through nginx — keep assets reasonably sized.
        chunkSizeWarningLimit: 1000,
    },
});
