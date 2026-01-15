// @ts-check

import axios, { AxiosError, AxiosResponse } from 'axios';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { Request, Response } from 'express';

console.log(`[Login Module] src/login.ts file is being evaluated. __dirname is: ${__dirname}`);

interface PastebinData {
  link?: string;
  [key: string]: any; // To accommodate if res.data is an object with more fields
}

interface LoginClientRequestBody {
  user: string;
  pass: string;
}

interface LoginApiPayload {
  user: string;
  pass: string;
}

interface LoginApiResponseData {
  token: string;
  userDetails: object; // Consider defining a more specific interface if the structure is known
  message: string;
  status: string; // e.g., "success"
}

function isLoginClientRequestBody(body: any): body is LoginClientRequestBody {
  if (body && typeof body === 'object' &&
      typeof body.user === 'string' && body.user.length > 0 &&
      typeof body.pass === 'string' && body.pass.length > 0) {
    return true;
  }
  return false;
}

const ACC_FILE_PATH: string = path.resolve(__dirname, '../models/data/acc.json');
const ACC_DIR_PATH: string = path.dirname(ACC_FILE_PATH);

const api = {
  async getLink(): Promise<string> {
    console.log("[Login API - getLink] Attempting to fetch link...");
    try {
      const res: AxiosResponse<PastebinData | string> = await axios.get('https://pastebin.com/raw/pi3kz4LU');
      let extractedLink: string | null = null;

      if (res.data && typeof res.data === 'object' && typeof res.data.link === 'string') {
        extractedLink = res.data.link;
      } else if (typeof res.data === 'string' && res.data.startsWith('http')) {
        extractedLink = res.data;
      }

      if (!extractedLink) {
        console.error("[Login API - getLink] Invalid/missing link in Pastebin response:", res.data);
        throw new Error('Invalid or missing link in Pastebin response data.');
      }
      console.log("[Login API - getLink] Fetched link:", extractedLink);
      return extractedLink;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error("[Login API - getLink] Failed to get base link.", error.message, error.cause || error);
      throw new Error('Failed to get base link.', { cause: error });
    }
  },

  async login(body: LoginApiPayload): Promise<LoginApiResponseData> {
    console.log("[Login API - login] Attempting external API login.");
    try {
      const link = await api.getLink();
      console.log("[Login API - login] External API Link:", link);
      console.log("[Login API - login] Payload to external API:", body);

      const res: AxiosResponse<LoginApiResponseData> = await axios.post(`${link}/signin`, body);
      console.log("[Login API - login] Response from external API:", res.data);
      return res.data;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error("[Login API - login] Error with /signin endpoint.", error.message, error.cause || error);
      if (axios.isAxiosError(error) && error.response) {
        console.error("[Login API - login] Axios error data:", error.response.data, "Status:", error.response.status);
      }
      throw new Error('Failed to contact/process signin endpoint.', { cause: error });
    }
  },
};

interface LoginRouteParams {
  req: Request<any, any, unknown>; // Request body is unknown, will use typeguard
  res: Response;
}

interface LoginExpressRouteModule {
  method: "get" | "post" | "put" | "delete" | "patch" | "options" | "head" | "all";
  path: string;
  install: (params: LoginRouteParams) => Promise<void> | void;
}

export const modules: LoginExpressRouteModule[] = [
  {
    method: 'post',
    path: '/login',
    install: async ({ req, res }: LoginRouteParams): Promise<void> => {
      try {
        const requestBody: unknown = req.body;

        if (isLoginClientRequestBody(requestBody)) {
          const clientData: LoginClientRequestBody = requestBody;

          const apiLoginPayload: LoginApiPayload = {
            user: clientData.user,
            pass: clientData.pass,
          };

          const responseData: LoginApiResponseData = await api.login(apiLoginPayload);

          if (responseData && responseData.status === 'success' && responseData.token) {
            console.log("[Login Route] External login successful.");
            try {
              if (!fs.existsSync(ACC_DIR_PATH)) {
                await fsPromises.mkdir(ACC_DIR_PATH, { recursive: true });
              }
              await fsPromises.writeFile(ACC_FILE_PATH, JSON.stringify(responseData, null, 2));
            } catch (fileErr: unknown) {
              const fError = fileErr instanceof Error ? fileErr : new Error(String(fileErr));
              console.error(`[Login Route] CRITICAL: Failed to write acc.json:`, fError);
            }
            res.json({ success: true, data: responseData });
          } else {
            console.warn("[Login Route] External login failed or unexpected response:", responseData);
            res.status(401).json({ success: false, error: responseData?.message || 'Login failed.' });
          }
        } else {
          console.warn("[Login Route] Validation failed: req.body does not conform to LoginClientRequestBody. Received:", requestBody);
          res.status(400).json({ success: false, error: 'Invalid request format: user and pass are required strings.' });
          return;
        }
      } catch (err: unknown) {
        let error: Error & { cause?: unknown };
        if (err instanceof Error) {
            error = err as Error & { cause?: unknown };
        } else {
            error = new Error(String(err)) as Error & { cause?: unknown };
        }

        let errorMessage = "An unknown error occurred.";
        let statusCode = 500;
        console.error(`[Login Route] Overall error:`, error.message, error.cause || error);

        const originalError: unknown = error.cause || error;

        if (axios.isAxiosError(originalError)) {
          const axiosError = originalError as AxiosError<any>; // Type assertion
          errorMessage = axiosError.message;
          statusCode = axiosError.response?.status || 500;
          const responseDataError = axiosError.response?.data?.error || axiosError.response?.data?.message;
          if (responseDataError) {
            errorMessage = `Login API Error (${statusCode}): ${responseDataError}`;
          }
        } else if (originalError instanceof Error) {
            errorMessage = originalError.message || String(originalError);
        } else {
            errorMessage = String(originalError);
        }


        console.error(`[Login Route] Error to client: ${errorMessage}, Status: ${statusCode}`);
        if (!res.headersSent) {
          res.status(statusCode).json({ success: false, error: errorMessage });
        } else {
          console.warn("[Login Route] Headers sent, cannot send error to client.");
        }
      }
    },
  },
];
