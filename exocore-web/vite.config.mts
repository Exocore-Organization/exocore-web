import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
    base: "/exocore/",
    plugins: [react({})],
    root: path.resolve(__dirname, "client"),
    resolve: {
        alias: {
            // Rolldown 1.x doesn't honour the `exports` field of framer-motion
            // and its peers, so we point each one at its ESM bundle directly.
            // Otherwise the client build fails with "failed to resolve import".
            "framer-motion": path.resolve(__dirname, "..", "node_modules/framer-motion/dist/cjs/index.js"),
            "motion-dom":    path.resolve(__dirname, "..", "node_modules/motion-dom/dist/cjs/index.js"),
            "motion-utils":  path.resolve(__dirname, "..", "node_modules/motion-utils/dist/cjs/index.js"),
        },
    },
    build: {
        outDir: path.resolve(__dirname, "dist"),
        emptyOutDir: true,
        chunkSizeWarningLimit: 1500,
        rollupOptions: {
            input: path.resolve(__dirname, "client/index.html"),
            output: {
                manualChunks(id) {
                    // CodeMirror language packages (largest contributors)
                    if (
                        id.includes("@codemirror/lang-") ||
                        id.includes("@codemirror/language")
                    ) {
                        return "codemirror-langs";
                    }
                    // CodeMirror core + state + view
                    if (
                        id.includes("@codemirror/") ||
                        id.includes("@lezer/") ||
                        id.includes("@uiw/react-codemirror")
                    ) {
                        return "codemirror-core";
                    }
                    // Terminal (xterm)
                    if (id.includes("xterm") || id.includes("@xterm/")) {
                        return "xterm";
                    }
                    // Markdown rendering
                    if (
                        id.includes("react-markdown") ||
                        id.includes("remark-") ||
                        id.includes("rehype-") ||
                        id.includes("unified") ||
                        id.includes("mdast") ||
                        id.includes("hast") ||
                        id.includes("micromark")
                    ) {
                        return "markdown";
                    }
                    // React ecosystem
                    if (
                        id.includes("node_modules/react/") ||
                        id.includes("node_modules/react-dom/") ||
                        id.includes("node_modules/scheduler/")
                    ) {
                        return "react-dom";
                    }
                    // Router + axios
                    if (id.includes("react-router") || id.includes("axios")) {
                        return "vendor";
                    }
                },
            },
        },
    },
});
