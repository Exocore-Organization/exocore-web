"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditRoute = void 0;
const express_1 = require("express");
const backendWs_1 = require("../../server/backendWs");
class AuditRoute {
    router;
    constructor() {
        this.router = (0, express_1.Router)();
        this.router.get('/', this.get);
    }
    get = async (req, res) => {
        const r = await (0, backendWs_1.backendCall)('GET', '/exocore/api/auth/audit', req.query, undefined, 15_000);
        const status = r.status || (r.ok ? 200 : 502);
        return res.status(status).json(r.data ?? { success: r.ok });
    };
}
exports.AuditRoute = AuditRoute;
