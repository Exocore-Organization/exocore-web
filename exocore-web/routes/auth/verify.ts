import { Router, Request, Response } from 'express';
import { backendCall } from '../../server/backendWs';

export class VerifyRoute {
    public router: Router;
    constructor() {
        this.router = Router();
        this.router.get('/', this.verify);
    }

    private verify = async (req: Request, res: Response) => {
        const { username, otp, host, req: reqType } = req.query as Record<string, string>;
        if (!username) return res.status(400).json({ success: false, message: 'Username is required' });

        const effectiveHost = host || `${req.protocol}://${req.get('host')}`;
        const r = await backendCall(
            'GET',
            '/exocore/api/auth/verify',
            { username, otp, req: reqType, host: effectiveHost },
            undefined,
            10_000,
            { followRedirects: false },
        );

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
