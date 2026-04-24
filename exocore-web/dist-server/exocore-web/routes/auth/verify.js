"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerifyRoute = void 0;
const express_1 = require("express");
const backendWs_1 = require("../../server/backendWs");
class VerifyRoute {
    router;
    constructor() {
        this.router = (0, express_1.Router)();
        this.router.get('/', this.verify);
    }
    verify = async (req, res) => {
        const { username, otp, host, req: reqType } = req.query;
        if (!username)
            return res.status(400).json({ success: false, message: 'Username is required' });
        const effectiveHost = host || `${req.protocol}://${req.get('host')}`;
        const r = await (0, backendWs_1.backendCall)('GET', '/exocore/api/auth/verify', { username, otp, req: reqType, host: effectiveHost }, undefined, 10_000, { followRedirects: false });
        const location = r.headers?.location;
        if (r.status >= 300 && r.status < 400 && location) {
            return res.redirect(location);
        }
        const status = r.status || (r.ok ? 200 : 502);
        if (r.data == null) {
            return res.status(status).json({ success: r.ok, message: 'Verification failed' });
        }
        return res.status(status).json(r.data);
    };
}
exports.VerifyRoute = VerifyRoute;
