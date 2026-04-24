import { Router, Request, Response } from 'express';
import multer from 'multer';
import { backendCall, BridgeFilePart } from '../../server/backendWs';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

export class UserinfoRoute {
    public router: Router;
    constructor() {
        this.router = Router();
        this.router.get('/', this.get);
        this.router.post('/', upload.any(), this.post);
    }

    private get = async (req: Request, res: Response) => {
        const { token, source } = req.query as Record<string, string>;
        if (!token) return res.status(400).json({ success: false, message: 'token is required' });
        const r = await backendCall('GET', '/exocore/api/auth/userinfo', { token, source: source || 'me' }, undefined, 10_000);
        const status = r.status || (r.ok ? 200 : 502);
        return res.status(status).json(r.data ?? { success: r.ok });
    };

    private post = async (req: Request, res: Response) => {
        const token = (req.query.token as string) || (req.body?.token as string);
        const source = (req.query.source as string) || (req.body?.source as string) || 'edit';
        if (!token) return res.status(400).json({ success: false, message: 'token is required' });

        const body: Record<string, unknown> = { ...(req.body || {}) };
        delete body.token;
        delete body.source;

        const files: BridgeFilePart[] = [];
        const multerFiles = (req.files as Express.Multer.File[] | undefined) || [];
        for (const f of multerFiles) {
            files.push({
                field: f.fieldname,
                name: f.originalname || 'file',
                type: f.mimetype || 'application/octet-stream',
                bytes: f.buffer,
            });
        }

        const r = await backendCall(
            'POST',
            '/exocore/api/auth/userinfo',
            { token, source },
            body,
            15_000,
            files.length ? { files } : undefined,
        );
        const status = r.status || (r.ok ? 200 : 502);
        return res.status(status).json(r.data ?? { success: r.ok });
    };
}
