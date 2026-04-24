"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerEditorHandlers = registerEditorHandlers;
const hub_1 = require("./hub");
const _helpers_1 = require("./_helpers");
function registerEditorHandlers() {
    /* ---------------- Phase 5 — coding (file system) ---------------- */
    (0, hub_1.registerHandler)("coding.files", async (d) => {
        const projectId = (0, _helpers_1.requireString)(d?.projectId, "projectId");
        return await (0, _helpers_1.getSelf)("/exocore/api/editor/coding/files", { projectId });
    });
    (0, hub_1.registerHandler)("coding.read", async (d) => {
        const projectId = (0, _helpers_1.requireString)(d?.projectId, "projectId");
        const filePath = (0, _helpers_1.requireString)(d?.filePath, "filePath");
        return await (0, _helpers_1.getSelf)("/exocore/api/editor/coding/read", { projectId, filePath });
    });
    (0, hub_1.registerHandler)("coding.save", async (d) => {
        const projectId = (0, _helpers_1.requireString)(d?.projectId, "projectId");
        const filePath = (0, _helpers_1.requireString)(d?.filePath, "filePath");
        const content = typeof d?.content === "string" ? d.content : "";
        const headers = {};
        if (typeof d?.source === "string")
            headers["x-exo-source"] = d.source;
        return await (0, _helpers_1.postSelf)("/exocore/api/editor/coding/save", { projectId, filePath, content }, undefined, headers);
    });
    (0, hub_1.registerHandler)("coding.create", async (d) => {
        const projectId = (0, _helpers_1.requireString)(d?.projectId, "projectId");
        const filePath = (0, _helpers_1.requireString)(d?.filePath, "filePath");
        const type = (0, _helpers_1.optString)(d?.type) || "file";
        const file = d?.file;
        const headers = {};
        if (typeof d?.source === "string")
            headers["x-exo-source"] = d.source;
        if (file) {
            return await (0, _helpers_1.postSelfForm)("/exocore/api/editor/coding/create", { projectId, filePath, type }, { file });
        }
        return await (0, _helpers_1.postSelf)("/exocore/api/editor/coding/create", { projectId, filePath, type }, undefined, headers);
    });
    (0, hub_1.registerHandler)("coding.delete", async (d) => {
        const projectId = (0, _helpers_1.requireString)(d?.projectId, "projectId");
        const filePath = (0, _helpers_1.requireString)(d?.filePath, "filePath");
        return await (0, _helpers_1.postSelf)("/exocore/api/editor/coding/delete", { projectId, filePath });
    });
    (0, hub_1.registerHandler)("coding.rename", async (d) => {
        const projectId = (0, _helpers_1.requireString)(d?.projectId, "projectId");
        return await (0, _helpers_1.postSelf)("/exocore/api/editor/coding/rename", {
            projectId,
            srcPath: (0, _helpers_1.requireString)(d?.srcPath, "srcPath"),
            destPath: (0, _helpers_1.requireString)(d?.destPath, "destPath"),
        });
    });
    (0, hub_1.registerHandler)("coding.move", async (d) => {
        return await (0, _helpers_1.postSelf)("/exocore/api/editor/coding/move", {
            projectId: (0, _helpers_1.requireString)(d?.projectId, "projectId"),
            srcPath: (0, _helpers_1.requireString)(d?.srcPath, "srcPath"),
            destPath: (0, _helpers_1.requireString)(d?.destPath, "destPath"),
        });
    });
    (0, hub_1.registerHandler)("coding.history.list", async (d) => {
        const projectId = (0, _helpers_1.requireString)(d?.projectId, "projectId");
        const filePath = (0, _helpers_1.requireString)(d?.filePath, "filePath");
        return await (0, _helpers_1.getSelf)("/exocore/api/editor/coding/history", { projectId, filePath });
    });
    (0, hub_1.registerHandler)("coding.history.push", async (d) => {
        const projectId = (0, _helpers_1.requireString)(d?.projectId, "projectId");
        const filePath = (0, _helpers_1.requireString)(d?.filePath, "filePath");
        const content = typeof d?.content === "string" ? d.content : "";
        return await (0, _helpers_1.postSelf)("/exocore/api/editor/coding/history/push", { projectId, filePath, content });
    });
    (0, hub_1.registerHandler)("coding.history.clear", async (d) => {
        const projectId = (0, _helpers_1.requireString)(d?.projectId, "projectId");
        const filePath = (0, _helpers_1.requireString)(d?.filePath, "filePath");
        return await (0, _helpers_1.postSelf)("/exocore/api/editor/coding/history/clear", { projectId, filePath });
    });
    (0, hub_1.registerHandler)("coding.extract", async (d) => {
        const projectId = (0, _helpers_1.requireString)(d?.projectId, "projectId");
        const filePath = (0, _helpers_1.optString)(d?.filePath);
        const file = d?.file;
        if (!file)
            return { success: false, error: "file required" };
        return await (0, _helpers_1.postSelfForm)("/exocore/api/editor/coding/extract", { projectId, filePath }, { file });
    });
    /* ---------------- Phase 5 — projects ---------------- */
    (0, hub_1.registerHandler)("projects.list", async (d) => {
        return await (0, _helpers_1.getSelf)("/exocore/api/editor/projects/list", { token: (0, _helpers_1.optString)(d?.token) || undefined });
    });
    (0, hub_1.registerHandler)("projects.create", async (d) => {
        return await (0, _helpers_1.postSelf)("/exocore/api/editor/projects/create", d || {}, { token: (0, _helpers_1.optString)(d?.token) || undefined });
    });
    (0, hub_1.registerHandler)("projects.archive", async (d) => {
        return await (0, _helpers_1.postSelf)("/exocore/api/editor/projects/archive", { projectId: (0, _helpers_1.requireString)(d?.projectId, "projectId") }, { token: (0, _helpers_1.optString)(d?.token) || undefined });
    });
    (0, hub_1.registerHandler)("projects.unarchive", async (d) => {
        return await (0, _helpers_1.postSelf)("/exocore/api/editor/projects/unarchive", { projectId: (0, _helpers_1.requireString)(d?.projectId, "projectId") }, { token: (0, _helpers_1.optString)(d?.token) || undefined });
    });
    (0, hub_1.registerHandler)("projects.delete", async (d) => {
        return await (0, _helpers_1.postSelf)("/exocore/api/editor/projects/delete", { projectId: (0, _helpers_1.requireString)(d?.projectId, "projectId"), isArchived: !!d?.isArchived }, { token: (0, _helpers_1.optString)(d?.token) || undefined });
    });
    (0, hub_1.registerHandler)("projects.rename", async (d) => {
        return await (0, _helpers_1.postSelf)("/exocore/api/editor/projects/rename", { projectId: (0, _helpers_1.requireString)(d?.projectId, "projectId"), newName: (0, _helpers_1.requireString)(d?.newName, "newName") }, { token: (0, _helpers_1.optString)(d?.token) || undefined });
    });
    /* ---------------- Phase 5 — templates ---------------- */
    (0, hub_1.registerHandler)("templates.list", async () => {
        return await (0, _helpers_1.getSelf)("/exocore/api/editor/templates/list");
    });
    // NOTE: `templates/create-from-template` stays HTTP — it streams progress
    // via Server-Sent Events for live install logs. The RPC `rpc.call()` model
    // returns a single result; streaming is out of scope until we add an
    // `rpc.stream()` channel. See the "Routes that intentionally stay HTTP"
    // section in replit.md.
    /* ---------------- Phase 5 — runtime ---------------- */
    (0, hub_1.registerHandler)("runtime.start", async (d) => {
        return await (0, _helpers_1.postSelf)("/exocore/api/editor/runtime/start", {
            projectId: (0, _helpers_1.requireString)(d?.projectId, "projectId"),
            command: (0, _helpers_1.optString)(d?.command) || undefined,
            port: typeof d?.port === "number" ? d.port : undefined,
        }, { token: (0, _helpers_1.optString)(d?.token) || undefined });
    });
    (0, hub_1.registerHandler)("runtime.stop", async (d) => {
        return await (0, _helpers_1.postSelf)("/exocore/api/editor/runtime/stop", { projectId: (0, _helpers_1.requireString)(d?.projectId, "projectId") }, { token: (0, _helpers_1.optString)(d?.token) || undefined });
    });
    (0, hub_1.registerHandler)("runtime.kill", async (d) => {
        return await (0, _helpers_1.postSelf)("/exocore/api/editor/runtime/kill", { projectId: (0, _helpers_1.requireString)(d?.projectId, "projectId") }, { token: (0, _helpers_1.optString)(d?.token) || undefined });
    });
    (0, hub_1.registerHandler)("runtime.restart", async (d) => {
        return await (0, _helpers_1.postSelf)("/exocore/api/editor/runtime/restart", { projectId: (0, _helpers_1.requireString)(d?.projectId, "projectId") }, { token: (0, _helpers_1.optString)(d?.token) || undefined });
    });
    (0, hub_1.registerHandler)("runtime.status", async (d) => {
        const projectId = (0, _helpers_1.requireString)(d?.projectId, "projectId");
        return await (0, _helpers_1.getSelf)(`/exocore/api/editor/runtime/status/${encodeURIComponent(projectId)}`);
    });
    (0, hub_1.registerHandler)("runtime.list", async () => {
        return await (0, _helpers_1.getSelf)("/exocore/api/editor/runtime/list");
    });
    (0, hub_1.registerHandler)("runtime.config.get", async (d) => {
        const projectId = (0, _helpers_1.requireString)(d?.projectId, "projectId");
        return await (0, _helpers_1.getSelf)(`/exocore/api/editor/runtime/config/${encodeURIComponent(projectId)}`);
    });
    (0, hub_1.registerHandler)("runtime.config.save", async (d) => {
        const projectId = (0, _helpers_1.requireString)(d?.projectId, "projectId");
        const { projectId: _ignore, ...body } = d || {};
        return await (0, _helpers_1.postSelf)(`/exocore/api/editor/runtime/config/${encodeURIComponent(projectId)}`, body);
    });
    /* ---------------- Phase 5 — deps ---------------- */
    (0, hub_1.registerHandler)("deps.list", async (d) => {
        return await (0, _helpers_1.getSelf)("/exocore/api/editor/deps/list", d || {});
    });
}
