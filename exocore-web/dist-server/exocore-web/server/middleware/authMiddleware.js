"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = void 0;
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '')
        || req.query.token
        || req.body?.token;
    if (!token) {
        res.status(401).json({ error: 'Unauthorized — token required' });
        return;
    }
    next();
};
exports.authMiddleware = authMiddleware;
