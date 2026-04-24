import { Request, Response, NextFunction } from 'express';

export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    const token = req.headers.authorization?.replace('Bearer ', '')
        || req.query.token as string
        || req.body?.token as string | undefined;

    if (!token) {
        res.status(401).json({ error: 'Unauthorized — token required' });
        return;
    }

    next();
};
