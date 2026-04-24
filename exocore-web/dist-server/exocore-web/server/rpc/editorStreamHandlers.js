"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerEditorStreamHandlers = registerEditorStreamHandlers;
const hub_1 = require("./hub");
const shell_1 = require("../../routes/editor/shell");
const _lspBridge_1 = require("../../routes/editor/_lspBridge");
let registered = false;
function registerEditorStreamHandlers() {
    if (registered)
        return;
    registered = true;
    /**
     * editor.shell.console
     *  params: { projectId: string, forceRestart?: boolean }
     *  client → server: { kind: "input", text: string }
     *  server → client: { kind: "output", data: string }
     */
    (0, hub_1.registerStream)("editor.shell.console", async (rawParams, session) => {
        const params = (rawParams || {});
        const projectId = typeof params.projectId === "string" ? params.projectId : "";
        if (!projectId)
            throw new Error("projectId required");
        const tm = (0, shell_1.getTerminalManager)();
        if (!tm)
            throw new Error("terminal manager unavailable");
        let handle;
        try {
            handle = await tm.attachConsole(projectId, { send: (data) => session.push({ kind: "output", data }) }, { forceRestart: !!params.forceRestart });
        }
        catch (e) {
            throw new Error(e?.message || "attach failed");
        }
        return {
            onClientFrame: (payload) => {
                const p = (payload || {});
                if (p.kind === "input" && typeof p.text === "string") {
                    Promise.resolve(handle.sendInput(p.text)).catch(() => { });
                }
            },
            onClose: () => { try {
                handle.close();
            }
            catch { } },
        };
    });
    /**
     * editor.shell.pty
     *  params: { cols?, rows?, user?, projectId? }
     *  client → server: { kind: "input", text } | { kind: "resize", cols, rows }
     *  server → client: { kind: "output", data: string }
     */
    (0, hub_1.registerStream)("editor.shell.pty", async (rawParams, session) => {
        const params = (rawParams || {});
        const handle = (0, shell_1.attachPty)({
            cols: typeof params.cols === "number" ? params.cols : undefined,
            rows: typeof params.rows === "number" ? params.rows : undefined,
            user: typeof params.user === "string" ? params.user : undefined,
            projectId: typeof params.projectId === "string" ? params.projectId : undefined,
        }, { send: (data) => session.push({ kind: "output", data }) });
        return {
            onClientFrame: (payload) => {
                const p = (payload || {});
                if (p.kind === "input" && typeof p.text === "string") {
                    handle.sendInput(p.text);
                }
                else if (p.kind === "resize" && typeof p.cols === "number" && typeof p.rows === "number") {
                    handle.resize(p.cols, p.rows);
                }
            },
            onClose: () => { try {
                handle.close();
            }
            catch { } },
        };
    });
    /**
     * editor.lsp.session
     *  params: { projectId: string, server?: "ts" }
     *  client → server: { kind: "msg", text: string }   (raw LSP JSON body)
     *  server → client: { kind: "msg", text: string }
     */
    (0, hub_1.registerStream)("editor.lsp.session", async (rawParams, session) => {
        const params = (rawParams || {});
        const projectId = typeof params.projectId === "string" ? params.projectId : "";
        if (!projectId)
            throw new Error("projectId required");
        let handle;
        try {
            handle = (0, _lspBridge_1.attachLspSession)(projectId, { send: (text) => session.push({ kind: "msg", text }) });
        }
        catch (e) {
            throw new Error(e?.message || "lsp spawn failed");
        }
        return {
            onClientFrame: (payload) => {
                const p = (payload || {});
                if (p.kind === "msg" && typeof p.text === "string") {
                    handle.sendMessage(p.text);
                }
            },
            onClose: () => { try {
                handle.close();
            }
            catch { } },
        };
    });
}
