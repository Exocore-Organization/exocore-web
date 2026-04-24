import { Response } from "express";
import { backendCall, BackendResult, BridgeFilePart } from "../server/backendWs";

/** Forward a JSON GET to the backend over the persistent WSS bridge. */
export async function proxyGet(
    res: Response,
    path: string,
    params?: any,
    fallbackMessage = "Gateway error",
): Promise<BackendResult> {
    const r = await backendCall("GET", path, params);
    sendResult(res, r, fallbackMessage);
    return r;
}

/** Forward a JSON POST to the backend over the persistent WSS bridge. */
export async function proxyPost(
    res: Response,
    path: string,
    body?: any,
    params?: any,
    fallbackMessage = "Gateway error",
): Promise<BackendResult> {
    const r = await backendCall("POST", path, params, body);
    sendResult(res, r, fallbackMessage);
    return r;
}

/** Forward a multipart POST (string fields + files) to the backend over the bridge. */
export async function proxyPostMultipart(
    res: Response,
    path: string,
    body: Record<string, string> | undefined,
    files: BridgeFilePart[],
    params?: any,
    fallbackMessage = "Gateway error",
): Promise<BackendResult> {
    const r = await backendCall("POST", path, params, body, 30_000, { files });
    sendResult(res, r, fallbackMessage);
    return r;
}

function sendResult(res: Response, r: BackendResult, fallbackMessage: string) {
    const status = r.status || (r.ok ? 200 : 502);
    if (r.data == null) {
        res.status(status).json({ success: r.ok, message: fallbackMessage });
        return;
    }
    res.status(status).json(r.data);
}
