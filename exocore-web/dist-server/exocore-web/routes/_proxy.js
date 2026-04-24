"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.proxyGet = proxyGet;
exports.proxyPost = proxyPost;
exports.proxyPostMultipart = proxyPostMultipart;
const backendWs_1 = require("../server/backendWs");
/** Forward a JSON GET to the backend over the persistent WSS bridge. */
async function proxyGet(res, path, params, fallbackMessage = "Gateway error") {
    const r = await (0, backendWs_1.backendCall)("GET", path, params);
    sendResult(res, r, fallbackMessage);
    return r;
}
/** Forward a JSON POST to the backend over the persistent WSS bridge. */
async function proxyPost(res, path, body, params, fallbackMessage = "Gateway error") {
    const r = await (0, backendWs_1.backendCall)("POST", path, params, body);
    sendResult(res, r, fallbackMessage);
    return r;
}
/** Forward a multipart POST (string fields + files) to the backend over the bridge. */
async function proxyPostMultipart(res, path, body, files, params, fallbackMessage = "Gateway error") {
    const r = await (0, backendWs_1.backendCall)("POST", path, params, body, 30_000, { files });
    sendResult(res, r, fallbackMessage);
    return r;
}
function sendResult(res, r, fallbackMessage) {
    const status = r.status || (r.ok ? 200 : 502);
    if (r.data == null) {
        res.status(status).json({ success: r.ok, message: fallbackMessage });
        return;
    }
    res.status(status).json(r.data);
}
