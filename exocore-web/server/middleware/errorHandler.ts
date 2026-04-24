import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
    status?: number;
    code?: string;
}

export const errorHandler = (
    err: AppError,
    _req: Request,
    res: Response,
    _next: NextFunction,
): void => {
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
