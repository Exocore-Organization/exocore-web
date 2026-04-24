import { Router, Request, Response } from 'express';
import { proxyGet } from './_proxy';

/**
 * Surviving HTTP endpoint after Phase 9: only `GET /social/avatar`
 * is still served over HTTP because it returns binary image bytes
 * consumed by `<img src>` tags. Every other social method is now
 * exclusively reachable through the RPC hub (`social.*` channels).
 */
export class SocialRoute {
    public router: Router;
    constructor() {
        this.router = Router();
        this.router.get('/avatar', (req: Request, res: Response) =>
            proxyGet(res, '/exocore/api/social/avatar', req.query));
    }
}
