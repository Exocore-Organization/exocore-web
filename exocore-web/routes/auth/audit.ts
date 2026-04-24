import { Router, Request, Response } from 'express';
import { backendCall } from '../../server/backendWs';

export class AuditRoute {
    public router: Router;
    constructor() {
        this.router = Router();
        this.router.get('/', this.get);
    }

    private get = async (req: Request, res: Response) => {
        const r = await backendCall('GET', '/exocore/api/auth/audit', req.query as Record<string, unknown>, undefined, 15_000);
        const status = r.status || (r.ok ? 200 : 502);
        return res.status(status).json(r.data ?? { success: r.ok });
    };
}
