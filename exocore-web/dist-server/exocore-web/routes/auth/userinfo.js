"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserinfoRoute = void 0;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const backendWs_1 = require("../../server/backendWs");
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
class UserinfoRoute {
    router;
    constructor() {
        this.router = (0, express_1.Router)();
        this.router.get('/', this.get);
        this.router.post('/', upload.any(), this.post);
    }
    get = async (req, res) => {
        const { token, source } = req.query;
        if (!token)
            return res.status(400).json({ success: false, message: 'token is required' });
        const r = await (0, backendWs_1.backendCall)('GET', '/exocore/api/auth/userinfo', { token, source: source || 'me' }, undefined, 10_000);
        const status = r.status || (r.ok ? 200 : 502);
        return res.status(status).json(r.data ?? { success: r.ok });
    };
    post = async (req, res) => {
        const token = req.query.token || req.body?.token;
        const source = req.query.source || req.body?.source || 'edit';
        if (!token)
            return res.status(400).json({ success: false, message: 'token is required' });
        const body = { ...(req.body || {}) };
        delete body.token;
        delete body.source;
        const files = [];
        const multerFiles = req.files || [];
        for (const f of multerFiles) {
            files.push({
                field: f.fieldname,
                name: f.originalname || 'file',
                type: f.mimetype || 'application/octet-stream',
                bytes: f.buffer,
            });
        }
        const r = await (0, backendWs_1.backendCall)('POST', '/exocore/api/auth/userinfo', { token, source }, body, 15_000, files.length ? { files } : undefined);
        const status = r.status || (r.ok ? 200 : 502);
        return res.status(status).json(r.data ?? { success: r.ok });
    };
}
exports.UserinfoRoute = UserinfoRoute;
