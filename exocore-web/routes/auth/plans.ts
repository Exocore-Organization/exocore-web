import { Router, Request, Response } from 'express';
import multer from 'multer';
import { backendCall, BridgeFilePart } from '../../server/backendWs';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

async function forward(req: Request, res: Response, method: 'GET' | 'POST', subpath: string) {
    const path = `/exocore/api/auth/plans${subpath}`;
    const params = method === 'GET' ? (req.query as Record<string, unknown>) : undefined;

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

    const body = method === 'POST' ? (req.body || {}) : undefined;
    const opts = files.length ? { files } : undefined;

    const r = await backendCall(method, path, params, body, 30_000, opts);
    const status = r.status || (r.ok ? 200 : 502);
    return res.status(status).json(r.data ?? { success: r.ok });
}

export class PlansRoute {
    public router: Router;
    constructor() {
        this.router = Router();
        this.router.get('/catalog', (req, res) => forward(req, res, 'GET', '/catalog'));
        this.router.get('/me', (req, res) => forward(req, res, 'GET', '/me'));
        this.router.get('/pending', (req, res) => forward(req, res, 'GET', '/pending'));
        this.router.post('/submit', upload.any(), (req, res) => forward(req, res, 'POST', '/submit'));
        this.router.post('/decide', (req, res) => forward(req, res, 'POST', '/decide'));
    }
}
