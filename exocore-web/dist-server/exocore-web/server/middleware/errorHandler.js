"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const errorHandler = (err, _req, res, _next) => {
    const status = err.status ?? 500;
    const message = err.message ?? 'Internal Server Error';
    const code = err.code ?? 'INTERNAL_ERROR';
    console.error(`[ErrorHandler] ${status} ${code}: ${message}`);
    res.status(status).json({
        success: false,
        error: message,
        code,
    });
};
exports.errorHandler = errorHandler;
