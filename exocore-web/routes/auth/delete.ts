import { Router, Request, Response } from 'express';
import { backendCall } from '../../server/backendWs';

export class DeleteRoute {
    public router: Router;
    constructor() {
        this.router = Router();
        this.router.post('/', this.post);
    }

    private post = async (req: Request, res: Response) => {
        const r = await backendCall('POST', '/exocore/api/auth/delete', undefined, req.body, 60_000);
        const status = r.status || (r.ok ? 200 : 502);
        return res.status(status).json(r.data ?? { success: r.ok });
    };
}
