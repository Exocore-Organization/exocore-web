"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlansRoute = void 0;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const backendWs_1 = require("../../server/backendWs");
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
async function forward(req, res, method, subpath) {
    const path = `/exocore/api/auth/plans${subpath}`;
    const params = method === 'GET' ? req.query : undefined;
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
    const body = method === 'POST' ? (req.body || {}) : undefined;
    const opts = files.length ? { files } : undefined;
    const r = await (0, backendWs_1.backendCall)(method, path, params, body, 30_000, opts);
    const status = r.status || (r.ok ? 200 : 502);
    return res.status(status).json(r.data ?? { success: r.ok });
}
class PlansRoute {
    router;
    constructor() {
        this.router = (0, express_1.Router)();
        this.router.get('/catalog', (req, res) => forward(req, res, 'GET', '/catalog'));
        this.router.get('/me', (req, res) => forward(req, res, 'GET', '/me'));
        this.router.get('/pending', (req, res) => forward(req, res, 'GET', '/pending'));
        this.router.post('/submit', upload.any(), (req, res) => forward(req, res, 'POST', '/submit'));
        this.router.post('/decide', (req, res) => forward(req, res, 'POST', '/decide'));
    }
}
exports.PlansRoute = PlansRoute;
