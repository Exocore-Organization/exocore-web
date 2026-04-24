"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocialRoute = void 0;
const express_1 = require("express");
const _proxy_1 = require("./_proxy");
/**
 * Surviving HTTP endpoint after Phase 9: only `GET /social/avatar`
 * is still served over HTTP because it returns binary image bytes
 * consumed by `<img src>` tags. Every other social method is now
 * exclusively reachable through the RPC hub (`social.*` channels).
 */
class SocialRoute {
    router;
    constructor() {
        this.router = (0, express_1.Router)();
        this.router.get('/avatar', (req, res) => (0, _proxy_1.proxyGet)(res, '/exocore/api/social/avatar', req.query));
    }
}
exports.SocialRoute = SocialRoute;
