"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeleteRoute = void 0;
const express_1 = require("express");
const backendWs_1 = require("../../server/backendWs");
class DeleteRoute {
    router;
    constructor() {
        this.router = (0, express_1.Router)();
        this.router.post('/', this.post);
    }
    post = async (req, res) => {
        const r = await (0, backendWs_1.backendCall)('POST', '/exocore/api/auth/delete', undefined, req.body, 60_000);
        const status = r.status || (r.ok ? 200 : 502);
        return res.status(status).json(r.data ?? { success: r.ok });
    };
}
exports.DeleteRoute = DeleteRoute;
