import { registerHandler } from "./hub";
import { getSelf, postSelf, deleteSelf, requireString } from "./_helpers";

const API = "/exocore/api/editor";

export function registerEditor2Handlers(): void {
    /* ---------------- NPM ---------------- */
    registerHandler("npm.list", async (d: any) =>
        getSelf(`${API}/npm/list`, { projectId: d?.projectId }));
    registerHandler("npm.info", async (d: any) => {
        const name = requireString(d?.packageName, "packageName");
        return getSelf(`${API}/npm/info/${encodeURIComponent(name)}`);
    });
    registerHandler("npm.install", async (d: any) =>
        postSelf(`${API}/npm/install`, d));
    registerHandler("npm.installAll", async (d: any) =>
        postSelf(`${API}/npm/install-all`, d));
    registerHandler("npm.uninstall", async (d: any) =>
        postSelf(`${API}/npm/uninstall`, d));
    registerHandler("npm.files", async (d: any) =>
        getSelf(`${API}/npm/files`, { projectId: d?.projectId }));
    registerHandler("npm.whoami", async (d: any) =>
        getSelf(`${API}/npm/whoami`, { projectId: d?.projectId, token: d?.token }));
    registerHandler("npm.logout", async (d: any) =>
        postSelf(`${API}/npm/logout`, { projectId: d?.projectId }));
    registerHandler("npm.publish", async (d: any) =>
        postSelf(`${API}/npm/publish`, d));

    /* ---------------- PyLib ---------------- */
    registerHandler("pylib.list", async (d: any) =>
        getSelf(`${API}/pylib/list`, { projectId: d?.projectId }));
    registerHandler("pylib.search", async (d: any) =>
        getSelf(`${API}/pylib/search`, { q: d?.q }));
    registerHandler("pylib.install", async (d: any) =>
        postSelf(`${API}/pylib/install`, d));
    registerHandler("pylib.uninstall", async (d: any) =>
        postSelf(`${API}/pylib/uninstall`, d));

    /* ---------------- Google Drive (panelToken → ?token=) ---------------- */
    const gPT = (d: any) => ({ token: d?.panelToken });
    registerHandler("gdrive.deviceCode", async (d: any) =>
        getSelf(`${API}/gdrive/device-code`, gPT(d)));
    registerHandler("gdrive.pollToken", async (d: any) =>
        postSelf(`${API}/gdrive/poll-token`, { device_code: d?.device_code }, gPT(d)));
    registerHandler("gdrive.refreshToken", async (d: any) =>
        postSelf(`${API}/gdrive/refresh-token`, { refresh_token: d?.refresh_token }, gPT(d)));
    registerHandler("gdrive.backup", async (d: any) =>
        postSelf(`${API}/gdrive/backup`, {
            access_token: d?.access_token,
            refresh_token: d?.refresh_token,
            project_name: d?.project_name,
        }, gPT(d)));
    registerHandler("gdrive.listBackups", async (d: any) =>
        getSelf(`${API}/gdrive/list-backups`, {
            token: d?.panelToken,
            access_token: d?.access_token,
        }));
    registerHandler("gdrive.restore", async (d: any) =>
        postSelf(`${API}/gdrive/restore`, {
            access_token: d?.access_token,
            file_id: d?.file_id,
            project_name: d?.project_name,
        }, gPT(d)));
    registerHandler("gdrive.deleteBackup", async (d: any) =>
        deleteSelf(`${API}/gdrive/delete-backup`, gPT(d), {
            access_token: d?.access_token,
            file_id: d?.file_id,
        }));

    /* ---------------- GitHub ---------------- */
    registerHandler("github.status", async (d: any) =>
        getSelf(`${API}/github/status`, { projectId: d?.projectId }));
    registerHandler("github.files", async (d: any) =>
        getSelf(`${API}/github/files`, { projectId: d?.projectId }));
    registerHandler("github.repos", async (d: any) =>
        postSelf(`${API}/github/repos`, { token: d?.token }));
    registerHandler("github.clone", async (d: any) =>
        postSelf(`${API}/github/clone`, d));
    registerHandler("github.create", async (d: any) =>
        postSelf(`${API}/github/create`, d));
    registerHandler("github.connect", async (d: any) =>
        postSelf(`${API}/github/connect`, d));
    registerHandler("github.push", async (d: any) =>
        postSelf(`${API}/github/push`, d));
    registerHandler("github.pull", async (d: any) =>
        postSelf(`${API}/github/pull`, d));
    registerHandler("github.authDevice", async () =>
        postSelf(`${API}/github/auth/device`, {}));
    registerHandler("github.authPoll", async (d: any) =>
        postSelf(`${API}/github/auth/poll`, { device_code: d?.device_code }));

    /* ---------------- AI (Meta + extras) ---------------- */
    registerHandler("ai.status", async () =>
        getSelf(`${API}/ai/meta/status`));
    registerHandler("ai.meta", async (d: any) =>
        postSelf(`${API}/ai/meta`, d));
    registerHandler("ai.metaImage", async (d: any) =>
        postSelf(`${API}/ai/meta/image`, d));
    registerHandler("ai.metaAgent", async (d: any) =>
        postSelf(`${API}/ai/meta/agent`, d));
    registerHandler("ai.metaCookiesGet", async () =>
        getSelf(`${API}/ai/meta/cookies`));
    registerHandler("ai.metaCookiesPost", async (d: any) =>
        postSelf(`${API}/ai/meta/cookies`, { cookies: d?.cookies }));
    registerHandler("ai.metaCookiesDelete", async () =>
        deleteSelf(`${API}/ai/meta/cookies`));
    registerHandler("ai.metaDeleteConvo", async (d: any) =>
        postSelf(`${API}/ai/meta/delete-conversation`, d));
    registerHandler("ai.metaCleanup", async (d: any) =>
        postSelf(`${API}/ai/meta/cleanup`, d));
    registerHandler("ai.metaDeleteAll", async (d: any) =>
        postSelf(`${API}/ai/meta/delete-all`, d));
    registerHandler("ai.metaSession", async () =>
        getSelf(`${API}/ai/meta/session`));
    registerHandler("ai.metaSessionReset", async (d: any) =>
        postSelf(`${API}/ai/meta/session/reset`, d));
    registerHandler("ai.metaSessionCreate", async (d: any) =>
        postSelf(`${API}/ai/meta/session/create`, d));
    registerHandler("ai.metaMode", async (d: any) =>
        postSelf(`${API}/ai/meta/mode`, d));
    registerHandler("ai.metaWarmup", async (d: any) =>
        postSelf(`${API}/ai/meta/warmup`, d));
    registerHandler("ai.extra", async (d: any) => {
        const provider = requireString(d?.provider, "provider");
        const { provider: _p, ...body } = (d || {}) as Record<string, unknown>;
        return postSelf(`${API}/ai/extra/${encodeURIComponent(provider)}`, body);
    });

    /* ---------------- Runtime (project lifecycle) ---------------- */
    registerHandler("runtime.start", async (d: any) =>
        postSelf(`${API}/runtime/start`, {
            projectId: requireString(d?.projectId, "projectId"),
            command: d?.command,
            port: d?.port,
        }));
    registerHandler("runtime.stop", async (d: any) =>
        postSelf(`${API}/runtime/stop`, {
            projectId: requireString(d?.projectId, "projectId"),
        }));
    registerHandler("runtime.kill", async (d: any) =>
        postSelf(`${API}/runtime/kill`, {
            projectId: requireString(d?.projectId, "projectId"),
        }));
    registerHandler("runtime.restart", async (d: any) =>
        postSelf(`${API}/runtime/restart`, {
            projectId: requireString(d?.projectId, "projectId"),
        }));
    registerHandler("runtime.status", async (d: any) => {
        const projectId = requireString(d?.projectId, "projectId");
        return getSelf(`${API}/runtime/status/${encodeURIComponent(projectId)}`);
    });
    registerHandler("runtime.list", async () =>
        getSelf(`${API}/runtime/list`));
    /* runtime.config.get / runtime.config.save already exist from earlier phase */
}
