// @ts-check

import axios, { AxiosResponse } from 'axios';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { Request, Response } from 'express';

const ACC_FILE_PATH = path.resolve(__dirname, '../models/data/acc.json');
const ACC_DIR_PATH = path.dirname(ACC_FILE_PATH);

const api = {
  getLink: async (): Promise<string> => {
    const res = await axios.get('https://pastebin.com/raw/pi3kz4LU');
    if (typeof res.data === 'string' && res.data.startsWith('http')) {
      return res.data;
    }
    if (res.data && typeof res.data === 'object' && typeof res.data.link === 'string') {
      return res.data.link;
    }
    throw new Error('Failed to fetch external link from pastebin');
  },

  forgotPass: async (req: Request, res: Response) => {
    try {
      const { identifier, action, otpCode, newPass } = req.body;

      if (!identifier || !action) {
        return res.status(400).json({ error: 'Missing identifier or action' });
      }

      const link = await api.getLink();
      const apiURL = `${link}/forgot-password`;

      const body: Record<string, any> = { identifier };

      if (action === 'SendOtp') {
        body.action = 'sent';
      } else if (action === 'ResetPassword') {
        if (!otpCode || !newPass) {
          return res.status(400).json({ error: 'Missing otpCode or newPass for reset' });
        }
        body.action = 'submit';
        body.otpCode = otpCode;
        body.newPass = newPass;
      } else if (action === 'VerifyOtp') {
        if (!otpCode) {
          return res.status(400).json({ error: 'Missing otpCode for verification' });
        }
        body.action = 'verify';
        body.otpCode = otpCode;
      } else {
        return res.status(400).json({ error: 'Invalid action' });
      }

      const response: AxiosResponse = await axios.post(apiURL, body);
      const data = response.data;

      if (data.status === 'success' || data.message) {
        try {
          if (!fs.existsSync(ACC_DIR_PATH)) {
            await fsPromises.mkdir(ACC_DIR_PATH, { recursive: true });
          }
          await fsPromises.writeFile(ACC_FILE_PATH, JSON.stringify(data, null, 2));
        } catch (err) {
          console.error('[ForgotPass Route] Failed to write acc.json:', err);
        }
        return res.json({ success: true, data });
      } else {
        return res.status(400).json({ success: false, error: data.error || 'Unexpected error' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ForgotPass Route] Error:', msg);
      return res.status(500).json({ error: 'Server error', details: msg });
    }
  }
};

export const modules = [
  {
    method: 'post',
    path: '/forgotpass',
    install: async ({ req, res }: { req: Request; res: Response }) => {
      return api.forgotPass(req, res);
    },
  },
];
