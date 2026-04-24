import { Router, Request, Response, RequestHandler } from "express";
import axios from "axios";
import AdmZip from "adm-zip";
import path from "path";
import fs from "fs";
import FormData from "form-data";

const PROJECTS_DIR = path.resolve("./projects");
const GDRIVE_FOLDER_NAME = "ExocoreBackups";

export default class GDriveRoute {
    public router: Router;

    private clientId =
        "539703109829-iv213v33hkcs46dhtr5s9j7ic8f33b0d.apps.googleusercontent.com";
    private clientSecret = "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";

    constructor() {
        this.router = Router();
        this.initRoutes();
    }

    private initRoutes() {
        this.router.get("/device-code", this.getDeviceCode);
        this.router.post("/poll-token", this.pollToken);
        this.router.post("/refresh-token", this.refreshToken);
        this.router.post("/backup", this.backupProject);
        this.router.get("/list-backups", this.listBackups);
        this.router.post("/restore", this.restoreProject);
        this.router.delete("/delete-backup", this.deleteBackup);
    }

    private async getOrCreateFolder(accessToken: string): Promise<string> {
        const searchRes = await axios.get(
            "https://www.googleapis.com/drive/v3/files",
            {
                headers: { Authorization: `Bearer ${accessToken}` },
                params: {
                    q: `name='${GDRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                    fields: "files(id,name)",
                },
            },
        );

        if (searchRes.data.files && searchRes.data.files.length > 0) {
            return searchRes.data.files[0].id;
        }

        const createRes = await axios.post(
            "https://www.googleapis.com/drive/v3/files",
            {
                name: GDRIVE_FOLDER_NAME,
                mimeType: "application/vnd.google-apps.folder",
            },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
            },
        );
        return createRes.data.id;
    }

    private getDeviceCode: RequestHandler = async (
        _req: Request,
        res: Response,
    ): Promise<void> => {
        try {
            const response = await axios.post(
                "https://oauth2.googleapis.com/device/code",
                null,
                {
                    params: {
                        client_id: this.clientId,
                        scope: "https://www.googleapis.com/auth/drive.file",
                    },
                },
            );

            res.status(200).json({
                device_code: response.data.device_code,
                user_code: response.data.user_code,
                verification_url: response.data.verification_url,
            });
        } catch (error) {
            console.error("🔥 GDrive Device code error:", error);
            res.status(500).json({ error: "Failed to get device code" });
        }
    };

    private pollToken: RequestHandler = async (
        req: Request,
        res: Response,
    ): Promise<void> => {
        const { device_code } = req.body;

        try {
            const response = await axios.post(
                "https://oauth2.googleapis.com/token",
                null,
                {
                    params: {
                        client_id: this.clientId,
                        client_secret: this.clientSecret,
                        device_code: device_code,
                        grant_type:
                            "urn:ietf:params:oauth:grant-type:device_code",
                    },
                },
            );

            const tokens = response.data;
            res.status(200).json({ success: true, tokens });
        } catch (error: any) {
            if (
                error.response &&
                error.response.data.error === "authorization_pending"
            ) {
                res.status(202).json({ status: "pending" });
                return;
            }
            console.error(
                "🔥 GDrive Polling error:",
                error?.response?.data || error,
            );
            res.status(400).json({ error: "Polling failed or expired" });
        }
    };

    private refreshToken: RequestHandler = async (
        req: Request,
        res: Response,
    ): Promise<void> => {
        const { refresh_token } = req.body;
        if (!refresh_token) {
            res.status(400).json({ error: "refresh_token is required" });
            return;
        }

        try {
            const response = await axios.post(
                "https://oauth2.googleapis.com/token",
                null,
                {
                    params: {
                        client_id: this.clientId,
                        client_secret: this.clientSecret,
                        refresh_token,
                        grant_type: "refresh_token",
                    },
                },
            );

            res.status(200).json({ success: true, tokens: response.data });
        } catch (error: any) {
            console.error(
                "🔥 GDrive Refresh error:",
                error?.response?.data || error,
            );
            res.status(400).json({ error: "Failed to refresh token" });
        }
    };

    private backupProject: RequestHandler = async (
        req: Request,
        res: Response,
    ): Promise<void> => {
        const { access_token, refresh_token, project_name } = req.body;

        if (!access_token || !project_name) {
            res.status(400).json({
                error: "access_token and project_name are required",
            });
            return;
        }

        const projectPath = path.join(PROJECTS_DIR, project_name);
        if (!fs.existsSync(projectPath)) {
            res.status(404).json({
                error: `Project '${project_name}' not found`,
            });
            return;
        }

        try {
            const zip = new AdmZip();
            zip.addLocalFolder(projectPath, project_name);
            const zipBuffer = zip.toBuffer();

            const folderId = await this.getOrCreateFolder(access_token);
            const fileName = `${project_name}.zip`;

            const existingRes = await axios.get(
                "https://www.googleapis.com/drive/v3/files",
                {
                    headers: { Authorization: `Bearer ${access_token}` },
                    params: {
                        q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
                        fields: "files(id,name)",
                    },
                },
            );

            if (existingRes.data.files && existingRes.data.files.length > 0) {
                const existingId = existingRes.data.files[0].id;
                await axios.patch(
                    `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media`,
                    zipBuffer,
                    {
                        headers: {
                            Authorization: `Bearer ${access_token}`,
                            "Content-Type": "application/zip",
                        },
                    },
                );
                res.status(200).json({
                    success: true,
                    message: `Backup updated for '${project_name}'`,
                });
            } else {
                const form = new FormData();
                form.append(
                    "metadata",
                    JSON.stringify({ name: fileName, parents: [folderId] }),
                    {
                        contentType: "application/json",
                    },
                );
                form.append("file", zipBuffer, {
                    filename: fileName,
                    contentType: "application/zip",
                });

                await axios.post(
                    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
                    form,
                    {
                        headers: {
                            Authorization: `Bearer ${access_token}`,
                            ...form.getHeaders(),
                        },
                    },
                );

                res.status(200).json({
                    success: true,
                    message: `Backup created for '${project_name}'`,
                });
            }
        } catch (error: any) {
            console.error(
                "🔥 GDrive Backup error:",
                error?.response?.data || error,
            );
            res.status(500).json({ error: "Backup failed" });
        }
    };

    private listBackups: RequestHandler = async (
        req: Request,
        res: Response,
    ): Promise<void> => {
        const { access_token } = req.query as { access_token: string };

        if (!access_token) {
            res.status(400).json({ error: "access_token is required" });
            return;
        }

        try {
            const folderId = await this.getOrCreateFolder(access_token);

            const listRes = await axios.get(
                "https://www.googleapis.com/drive/v3/files",
                {
                    headers: { Authorization: `Bearer ${access_token}` },
                    params: {
                        q: `'${folderId}' in parents and trashed=false and mimeType='application/zip'`,
                        fields: "files(id,name,size,modifiedTime)",
                        orderBy: "modifiedTime desc",
                    },
                },
            );

            const files = (listRes.data.files || []).map((f: any) => ({
                id: f.id,
                name: f.name.replace(/\.zip$/, ""),
                fileName: f.name,
                size: f.size,
                modifiedTime: f.modifiedTime,
            }));

            res.status(200).json({ success: true, backups: files });
        } catch (error: any) {
            console.error(
                "🔥 GDrive List error:",
                error?.response?.data || error,
            );
            res.status(500).json({ error: "Failed to list backups" });
        }
    };

    private restoreProject: RequestHandler = async (
        req: Request,
        res: Response,
    ): Promise<void> => {
        const { access_token, file_id, project_name } = req.body;

        if (!access_token || !file_id || !project_name) {
            res.status(400).json({
                error: "access_token, file_id, and project_name are required",
            });
            return;
        }

        try {
            const downloadRes = await axios.get(
                `https://www.googleapis.com/drive/v3/files/${file_id}?alt=media`,
                {
                    headers: { Authorization: `Bearer ${access_token}` },
                    responseType: "arraybuffer",
                },
            );

            const zipBuffer = Buffer.from(downloadRes.data);
            const zip = new AdmZip(zipBuffer);

            const projectPath = path.join(PROJECTS_DIR, project_name);
            if (!fs.existsSync(projectPath)) {
                fs.mkdirSync(projectPath, { recursive: true });
            }

            zip.extractAllTo(PROJECTS_DIR, true);

            res.status(200).json({
                success: true,
                message: `Project '${project_name}' restored from backup`,
            });
        } catch (error: any) {
            console.error(
                "🔥 GDrive Restore error:",
                error?.response?.data || error,
            );
            res.status(500).json({ error: "Restore failed" });
        }
    };

    private deleteBackup: RequestHandler = async (
        req: Request,
        res: Response,
    ): Promise<void> => {
        const { access_token, file_id } = req.body;

        if (!access_token || !file_id) {
            res.status(400).json({
                error: "access_token and file_id are required",
            });
            return;
        }

        try {
            await axios.delete(
                `https://www.googleapis.com/drive/v3/files/${file_id}`,
                {
                    headers: { Authorization: `Bearer ${access_token}` },
                },
            );

            res.status(200).json({ success: true, message: "Backup deleted" });
        } catch (error: any) {
            console.error(
                "🔥 GDrive Delete error:",
                error?.response?.data || error,
            );
            res.status(500).json({ error: "Failed to delete backup" });
        }
    };
}
