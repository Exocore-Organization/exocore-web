"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerEditor2Handlers = registerEditor2Handlers;
const hub_1 = require("./hub");
const _helpers_1 = require("./_helpers");
const API = "/exocore/api/editor";
function registerEditor2Handlers() {
    /* ---------------- NPM ---------------- */
    (0, hub_1.registerHandler)("npm.list", async (d) => (0, _helpers_1.getSelf)(`${API}/npm/list`, { projectId: d?.projectId }));
    (0, hub_1.registerHandler)("npm.info", async (d) => {
        const name = (0, _helpers_1.requireString)(d?.packageName, "packageName");
        return (0, _helpers_1.getSelf)(`${API}/npm/info/${encodeURIComponent(name)}`);
    });
    (0, hub_1.registerHandler)("npm.install", async (d) => (0, _helpers_1.postSelf)(`${API}/npm/install`, d));
    (0, hub_1.registerHandler)("npm.installAll", async (d) => (0, _helpers_1.postSelf)(`${API}/npm/install-all`, d));
    (0, hub_1.registerHandler)("npm.uninstall", async (d) => (0, _helpers_1.postSelf)(`${API}/npm/uninstall`, d));
    (0, hub_1.registerHandler)("npm.files", async (d) => (0, _helpers_1.getSelf)(`${API}/npm/files`, { projectId: d?.projectId }));
    (0, hub_1.registerHandler)("npm.whoami", async (d) => (0, _helpers_1.getSelf)(`${API}/npm/whoami`, { projectId: d?.projectId, token: d?.token }));
    (0, hub_1.registerHandler)("npm.logout", async (d) => (0, _helpers_1.postSelf)(`${API}/npm/logout`, { projectId: d?.projectId }));
    (0, hub_1.registerHandler)("npm.publish", async (d) => (0, _helpers_1.postSelf)(`${API}/npm/publish`, d));
    /* ---------------- PyLib ---------------- */
    (0, hub_1.registerHandler)("pylib.list", async (d) => (0, _helpers_1.getSelf)(`${API}/pylib/list`, { projectId: d?.projectId }));
    (0, hub_1.registerHandler)("pylib.search", async (d) => (0, _helpers_1.getSelf)(`${API}/pylib/search`, { q: d?.q }));
    (0, hub_1.registerHandler)("pylib.install", async (d) => (0, _helpers_1.postSelf)(`${API}/pylib/install`, d));
    (0, hub_1.registerHandler)("pylib.uninstall", async (d) => (0, _helpers_1.postSelf)(`${API}/pylib/uninstall`, d));
    /* ---------------- Google Drive (panelToken → ?token=) ---------------- */
    const gPT = (d) => ({ token: d?.panelToken });
    (0, hub_1.registerHandler)("gdrive.deviceCode", async (d) => (0, _helpers_1.getSelf)(`${API}/gdrive/device-code`, gPT(d)));
    (0, hub_1.registerHandler)("gdrive.pollToken", async (d) => (0, _helpers_1.postSelf)(`${API}/gdrive/poll-token`, { device_code: d?.device_code }, gPT(d)));
    (0, hub_1.registerHandler)("gdrive.refreshToken", async (d) => (0, _helpers_1.postSelf)(`${API}/gdrive/refresh-token`, { refresh_token: d?.refresh_token }, gPT(d)));
    (0, hub_1.registerHandler)("gdrive.backup", async (d) => (0, _helpers_1.postSelf)(`${API}/gdrive/backup`, {
        access_token: d?.access_token,
        refresh_token: d?.refresh_token,
        project_name: d?.project_name,
    }, gPT(d)));
    (0, hub_1.registerHandler)("gdrive.listBackups", async (d) => (0, _helpers_1.getSelf)(`${API}/gdrive/list-backups`, {
        token: d?.panelToken,
        access_token: d?.access_token,
    }));
    (0, hub_1.registerHandler)("gdrive.restore", async (d) => (0, _helpers_1.postSelf)(`${API}/gdrive/restore`, {
        access_token: d?.access_token,
        file_id: d?.file_id,
        project_name: d?.project_name,
    }, gPT(d)));
    (0, hub_1.registerHandler)("gdrive.deleteBackup", async (d) => (0, _helpers_1.deleteSelf)(`${API}/gdrive/delete-backup`, gPT(d), {
        access_token: d?.access_token,
        file_id: d?.file_id,
    }));
    /* ---------------- GitHub ---------------- */
    (0, hub_1.registerHandler)("github.status", async (d) => (0, _helpers_1.getSelf)(`${API}/github/status`, { projectId: d?.projectId }));
    (0, hub_1.registerHandler)("github.files", async (d) => (0, _helpers_1.getSelf)(`${API}/github/files`, { projectId: d?.projectId }));
    (0, hub_1.registerHandler)("github.repos", async (d) => (0, _helpers_1.postSelf)(`${API}/github/repos`, { token: d?.token }));
    (0, hub_1.registerHandler)("github.clone", async (d) => (0, _helpers_1.postSelf)(`${API}/github/clone`, d));
    (0, hub_1.registerHandler)("github.create", async (d) => (0, _helpers_1.postSelf)(`${API}/github/create`, d));
    (0, hub_1.registerHandler)("github.connect", async (d) => (0, _helpers_1.postSelf)(`${API}/github/connect`, d));
    (0, hub_1.registerHandler)("github.push", async (d) => (0, _helpers_1.postSelf)(`${API}/github/push`, d));
    (0, hub_1.registerHandler)("github.pull", async (d) => (0, _helpers_1.postSelf)(`${API}/github/pull`, d));
    (0, hub_1.registerHandler)("github.authDevice", async () => (0, _helpers_1.postSelf)(`${API}/github/auth/device`, {}));
    (0, hub_1.registerHandler)("github.authPoll", async (d) => (0, _helpers_1.postSelf)(`${API}/github/auth/poll`, { device_code: d?.device_code }));
    /* ---------------- AI (Meta + extras) ---------------- */
    (0, hub_1.registerHandler)("ai.status", async () => (0, _helpers_1.getSelf)(`${API}/ai/meta/status`));
    (0, hub_1.registerHandler)("ai.meta", async (d) => (0, _helpers_1.postSelf)(`${API}/ai/meta`, d));
    (0, hub_1.registerHandler)("ai.metaImage", async (d) => (0, _helpers_1.postSelf)(`${API}/ai/meta/image`, d));
    (0, hub_1.registerHandler)("ai.metaAgent", async (d) => (0, _helpers_1.postSelf)(`${API}/ai/meta/agent`, d));
    (0, hub_1.registerHandler)("ai.metaCookiesGet", async () => (0, _helpers_1.getSelf)(`${API}/ai/meta/cookies`));
    (0, hub_1.registerHandler)("ai.metaCookiesPost", async (d) => (0, _helpers_1.postSelf)(`${API}/ai/meta/cookies`, { cookies: d?.cookies }));
    (0, hub_1.registerHandler)("ai.metaCookiesDelete", async () => (0, _helpers_1.deleteSelf)(`${API}/ai/meta/cookies`));
    (0, hub_1.registerHandler)("ai.metaDeleteConvo", async (d) => (0, _helpers_1.postSelf)(`${API}/ai/meta/delete-conversation`, d));
    (0, hub_1.registerHandler)("ai.metaCleanup", async (d) => (0, _helpers_1.postSelf)(`${API}/ai/meta/cleanup`, d));
    (0, hub_1.registerHandler)("ai.metaDeleteAll", async (d) => (0, _helpers_1.postSelf)(`${API}/ai/meta/delete-all`, d));
    (0, hub_1.registerHandler)("ai.metaSession", async () => (0, _helpers_1.getSelf)(`${API}/ai/meta/session`));
    (0, hub_1.registerHandler)("ai.metaSessionReset", async (d) => (0, _helpers_1.postSelf)(`${API}/ai/meta/session/reset`, d));
    (0, hub_1.registerHandler)("ai.metaSessionCreate", async (d) => (0, _helpers_1.postSelf)(`${API}/ai/meta/session/create`, d));
    (0, hub_1.registerHandler)("ai.metaMode", async (d) => (0, _helpers_1.postSelf)(`${API}/ai/meta/mode`, d));
    (0, hub_1.registerHandler)("ai.metaWarmup", async (d) => (0, _helpers_1.postSelf)(`${API}/ai/meta/warmup`, d));
    (0, hub_1.registerHandler)("ai.extra", async (d) => {
        const provider = (0, _helpers_1.requireString)(d?.provider, "provider");
        const { provider: _p, ...body } = (d || {});
        return (0, _helpers_1.postSelf)(`${API}/ai/extra/${encodeURIComponent(provider)}`, body);
    });
    /* ---------------- Runtime (project lifecycle) ---------------- */
    (0, hub_1.registerHandler)("runtime.start", async (d) => (0, _helpers_1.postSelf)(`${API}/runtime/start`, {
        projectId: (0, _helpers_1.requireString)(d?.projectId, "projectId"),
        command: d?.command,
        port: d?.port,
    }));
    (0, hub_1.registerHandler)("runtime.stop", async (d) => (0, _helpers_1.postSelf)(`${API}/runtime/stop`, {
        projectId: (0, _helpers_1.requireString)(d?.projectId, "projectId"),
    }));
    (0, hub_1.registerHandler)("runtime.kill", async (d) => (0, _helpers_1.postSelf)(`${API}/runtime/kill`, {
        projectId: (0, _helpers_1.requireString)(d?.projectId, "projectId"),
    }));
    (0, hub_1.registerHandler)("runtime.restart", async (d) => (0, _helpers_1.postSelf)(`${API}/runtime/restart`, {
        projectId: (0, _helpers_1.requireString)(d?.projectId, "projectId"),
    }));
    (0, hub_1.registerHandler)("runtime.status", async (d) => {
        const projectId = (0, _helpers_1.requireString)(d?.projectId, "projectId");
        return (0, _helpers_1.getSelf)(`${API}/runtime/status/${encodeURIComponent(projectId)}`);
    });
    (0, hub_1.registerHandler)("runtime.list", async () => (0, _helpers_1.getSelf)(`${API}/runtime/list`));
    /* runtime.config.get / runtime.config.save already exist from earlier phase */
}
