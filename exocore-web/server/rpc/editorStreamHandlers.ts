import { registerStream, RpcStreamSession } from "./hub";
import { getTerminalManager, attachPty, ConsoleHandle, PtyHandle } from "../../routes/editor/shell";
import { attachLspSession, LspHandle } from "../../routes/editor/_lspBridge";

let registered = false;

export function registerEditorStreamHandlers(): void {
    if (registered) return;
    registered = true;

    /**
     * editor.shell.console
     *  params: { projectId: string, forceRestart?: boolean }
     *  client → server: { kind: "input", text: string }
     *  server → client: { kind: "output", data: string }
     */
    registerStream("editor.shell.console", async (rawParams, session: RpcStreamSession) => {
        const params = (rawParams || {}) as { projectId?: string; forceRestart?: boolean };
        const projectId = typeof params.projectId === "string" ? params.projectId : "";
        if (!projectId) throw new Error("projectId required");

        const tm = getTerminalManager();
        if (!tm) throw new Error("terminal manager unavailable");

        let handle: ConsoleHandle;
        try {
            handle = await tm.attachConsole(
                projectId,
                { send: (data: string) => session.push({ kind: "output", data }) },
                { forceRestart: !!params.forceRestart },
            );
        } catch (e: any) {
            throw new Error(e?.message || "attach failed");
        }

        return {
            onClientFrame: (payload) => {
                const p = (payload || {}) as { kind?: string; text?: string };
                if (p.kind === "input" && typeof p.text === "string") {
                    Promise.resolve(handle.sendInput(p.text)).catch(() => {});
                }
            },
            onClose: () => { try { handle.close(); } catch {} },
        };
    });

    /**
     * editor.shell.pty
     *  params: { cols?, rows?, user?, projectId? }
     *  client → server: { kind: "input", text } | { kind: "resize", cols, rows }
     *  server → client: { kind: "output", data: string }
     */
    registerStream("editor.shell.pty", async (rawParams, session: RpcStreamSession) => {
        const params = (rawParams || {}) as {
            cols?: number; rows?: number; user?: string; projectId?: string;
        };
        const handle: PtyHandle = attachPty(
            {
                cols: typeof params.cols === "number" ? params.cols : undefined,
                rows: typeof params.rows === "number" ? params.rows : undefined,
                user: typeof params.user === "string" ? params.user : undefined,
                projectId: typeof params.projectId === "string" ? params.projectId : undefined,
            },
            { send: (data: string) => session.push({ kind: "output", data }) },
        );

        return {
            onClientFrame: (payload) => {
                const p = (payload || {}) as { kind?: string; text?: string; cols?: number; rows?: number };
                if (p.kind === "input" && typeof p.text === "string") {
                    handle.sendInput(p.text);
                } else if (p.kind === "resize" && typeof p.cols === "number" && typeof p.rows === "number") {
                    handle.resize(p.cols, p.rows);
                }
            },
            onClose: () => { try { handle.close(); } catch {} },
        };
    });

    /**
     * editor.lsp.session
     *  params: { projectId: string, server?: "ts" }
     *  client → server: { kind: "msg", text: string }   (raw LSP JSON body)
     *  server → client: { kind: "msg", text: string }
     */
    registerStream("editor.lsp.session", async (rawParams, session: RpcStreamSession) => {
        const params = (rawParams || {}) as { projectId?: string; server?: string };
        const projectId = typeof params.projectId === "string" ? params.projectId : "";
        if (!projectId) throw new Error("projectId required");

        let handle: LspHandle;
        try {
            handle = attachLspSession(
                projectId,
                { send: (text: string) => session.push({ kind: "msg", text }) },
            );
        } catch (e: any) {
            throw new Error(e?.message || "lsp spawn failed");
        }

        return {
            onClientFrame: (payload) => {
                const p = (payload || {}) as { kind?: string; text?: string };
                if (p.kind === "msg" && typeof p.text === "string") {
                    handle.sendMessage(p.text);
                }
            },
            onClose: () => { try { handle.close(); } catch {} },
        };
    });
}
