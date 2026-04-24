import { registerHandler } from "./hub";
import {
    getSelf,
    postSelf,
    postSelfForm,
    requireString,
    optString,
    RpcFile,
} from "./_helpers";

export function registerEditorHandlers(): void {
    /* ---------------- Phase 5 — coding (file system) ---------------- */
    registerHandler("coding.files", async (d) => {
        const projectId = requireString(d?.projectId, "projectId");
        return await getSelf("/exocore/api/editor/coding/files", { projectId });
    });
    registerHandler("coding.read", async (d) => {
        const projectId = requireString(d?.projectId, "projectId");
        const filePath = requireString(d?.filePath, "filePath");
        return await getSelf("/exocore/api/editor/coding/read", { projectId, filePath });
    });
    registerHandler("coding.save", async (d) => {
        const projectId = requireString(d?.projectId, "projectId");
        const filePath = requireString(d?.filePath, "filePath");
        const content = typeof d?.content === "string" ? d.content : "";
        const headers: Record<string, string> = {};
        if (typeof d?.source === "string") headers["x-exo-source"] = d.source;
        return await postSelf(
            "/exocore/api/editor/coding/save",
            { projectId, filePath, content },
            undefined,
            headers,
        );
    });
    registerHandler("coding.create", async (d) => {
        const projectId = requireString(d?.projectId, "projectId");
        const filePath = requireString(d?.filePath, "filePath");
        const type = optString(d?.type) || "file";
        const file = d?.file as RpcFile | undefined;
        const headers: Record<string, string> = {};
        if (typeof d?.source === "string") headers["x-exo-source"] = d.source;
        if (file) {
            return await postSelfForm(
                "/exocore/api/editor/coding/create",
                { projectId, filePath, type },
                { file },
            );
        }
        return await postSelf(
            "/exocore/api/editor/coding/create",
            { projectId, filePath, type },
            undefined,
            headers,
        );
    });
    registerHandler("coding.delete", async (d) => {
        const projectId = requireString(d?.projectId, "projectId");
        const filePath = requireString(d?.filePath, "filePath");
        return await postSelf("/exocore/api/editor/coding/delete", { projectId, filePath });
    });
    registerHandler("coding.rename", async (d) => {
        const projectId = requireString(d?.projectId, "projectId");
        return await postSelf("/exocore/api/editor/coding/rename", {
            projectId,
            srcPath: requireString(d?.srcPath, "srcPath"),
            destPath: requireString(d?.destPath, "destPath"),
        });
    });
    registerHandler("coding.move", async (d) => {
        return await postSelf("/exocore/api/editor/coding/move", {
            projectId: requireString(d?.projectId, "projectId"),
            srcPath: requireString(d?.srcPath, "srcPath"),
            destPath: requireString(d?.destPath, "destPath"),
        });
    });
    registerHandler("coding.history.list", async (d) => {
        const projectId = requireString(d?.projectId, "projectId");
        const filePath = requireString(d?.filePath, "filePath");
        return await getSelf("/exocore/api/editor/coding/history", { projectId, filePath });
    });
    registerHandler("coding.history.push", async (d) => {
        const projectId = requireString(d?.projectId, "projectId");
        const filePath = requireString(d?.filePath, "filePath");
        const content = typeof d?.content === "string" ? d.content : "";
        return await postSelf("/exocore/api/editor/coding/history/push", { projectId, filePath, content });
    });
    registerHandler("coding.history.clear", async (d) => {
        const projectId = requireString(d?.projectId, "projectId");
        const filePath = requireString(d?.filePath, "filePath");
        return await postSelf("/exocore/api/editor/coding/history/clear", { projectId, filePath });
    });
    registerHandler("coding.extract", async (d) => {
        const projectId = requireString(d?.projectId, "projectId");
        const filePath = optString(d?.filePath);
        const file = d?.file as RpcFile | undefined;
        if (!file) return { success: false, error: "file required" };
        return await postSelfForm(
            "/exocore/api/editor/coding/extract",
            { projectId, filePath },
            { file },
        );
    });

    /* ---------------- Phase 5 — projects ---------------- */
    registerHandler("projects.list", async (d) => {
        return await getSelf("/exocore/api/editor/projects/list", { token: optString(d?.token) || undefined });
    });
    registerHandler("projects.create", async (d) => {
        return await postSelf("/exocore/api/editor/projects/create", d || {}, { token: optString(d?.token) || undefined });
    });
    registerHandler("projects.archive", async (d) => {
        return await postSelf("/exocore/api/editor/projects/archive",
            { projectId: requireString(d?.projectId, "projectId") },
            { token: optString(d?.token) || undefined });
    });
    registerHandler("projects.unarchive", async (d) => {
        return await postSelf("/exocore/api/editor/projects/unarchive",
            { projectId: requireString(d?.projectId, "projectId") },
            { token: optString(d?.token) || undefined });
    });
    registerHandler("projects.delete", async (d) => {
        return await postSelf("/exocore/api/editor/projects/delete",
            { projectId: requireString(d?.projectId, "projectId"), isArchived: !!d?.isArchived },
            { token: optString(d?.token) || undefined });
    });
    registerHandler("projects.rename", async (d) => {
        return await postSelf("/exocore/api/editor/projects/rename",
            { projectId: requireString(d?.projectId, "projectId"), newName: requireString(d?.newName, "newName") },
            { token: optString(d?.token) || undefined });
    });

    /* ---------------- Phase 5 — templates ---------------- */
    registerHandler("templates.list", async () => {
        return await getSelf("/exocore/api/editor/templates/list");
    });
    // NOTE: `templates/create-from-template` stays HTTP — it streams progress
    // via Server-Sent Events for live install logs. The RPC `rpc.call()` model
    // returns a single result; streaming is out of scope until we add an
    // `rpc.stream()` channel. See the "Routes that intentionally stay HTTP"
    // section in replit.md.

    /* ---------------- Phase 5 — runtime ---------------- */
    registerHandler("runtime.start", async (d) => {
        return await postSelf("/exocore/api/editor/runtime/start", {
            projectId: requireString(d?.projectId, "projectId"),
            command: optString(d?.command) || undefined,
            port: typeof d?.port === "number" ? d.port : undefined,
        }, { token: optString(d?.token) || undefined });
    });
    registerHandler("runtime.stop", async (d) => {
        return await postSelf("/exocore/api/editor/runtime/stop",
            { projectId: requireString(d?.projectId, "projectId") },
            { token: optString(d?.token) || undefined });
    });
    registerHandler("runtime.kill", async (d) => {
        return await postSelf("/exocore/api/editor/runtime/kill",
            { projectId: requireString(d?.projectId, "projectId") },
            { token: optString(d?.token) || undefined });
    });
    registerHandler("runtime.restart", async (d) => {
        return await postSelf("/exocore/api/editor/runtime/restart",
            { projectId: requireString(d?.projectId, "projectId") },
            { token: optString(d?.token) || undefined });
    });
    registerHandler("runtime.status", async (d) => {
        const projectId = requireString(d?.projectId, "projectId");
        return await getSelf(`/exocore/api/editor/runtime/status/${encodeURIComponent(projectId)}`);
    });
    registerHandler("runtime.list", async () => {
        return await getSelf("/exocore/api/editor/runtime/list");
    });
    registerHandler("runtime.config.get", async (d) => {
        const projectId = requireString(d?.projectId, "projectId");
        return await getSelf(`/exocore/api/editor/runtime/config/${encodeURIComponent(projectId)}`);
    });
    registerHandler("runtime.config.save", async (d) => {
        const projectId = requireString(d?.projectId, "projectId");
        const { projectId: _ignore, ...body } = d || {};
        return await postSelf(`/exocore/api/editor/runtime/config/${encodeURIComponent(projectId)}`, body);
    });

    /* ---------------- Phase 5 — deps ---------------- */
    registerHandler("deps.list", async (d) => {
        return await getSelf("/exocore/api/editor/deps/list", d || {});
    });
}
