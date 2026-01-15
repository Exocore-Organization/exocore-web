// @ts-check

import axios, { AxiosResponse, AxiosError } from 'axios';
import { Request, Response, Application } from 'express';
import { WebSocketServer } from 'ws';
import { Server as HttpServer } from 'http';

interface PastebinResponse {
  link: string;
}

interface UserInfoEditFunctionParams {
  token: string;
  cookies: Record<string, any> | string | undefined;
  field: string;
  edit: any; 
}

interface UserInfoEditApiResponseData {
  status: string;
  updatedFields: Record<string, any>;
  [key: string]: any; // Allow for other potential fields
}

const api = {
  async getLink(): Promise<string> {
    try {
      const res: AxiosResponse<PastebinResponse | string> = await axios.get('https://pastebin.com/raw/pi3kz4LU');
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

  async userinfoEdit({ token, cookies, field, edit }: UserInfoEditFunctionParams): Promise<UserInfoEditApiResponseData> {
    try {
      const link: string = await api.getLink();
      const res: AxiosResponse<UserInfoEditApiResponseData> = await axios.post(`${link}/userinfoEdit`, { token, cookies, field, edit });
      return res.data;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      throw new Error('Failed to contact userinfoEdit endpoint.', { cause: error });
    }
  },
};

interface UserInfoEditRouteHandlerParams {
  req: Request<any, any, UserInfoEditFunctionParams>;
  res: Response;
  app?: Application;
  wss?: WebSocketServer;
  wssConsole?: WebSocketServer;
  Shellwss?: WebSocketServer;
  server?: HttpServer;
}

interface UserInfoEditExpressRouteModule {
  method: "get" | "post" | "put" | "delete" | "patch" | "options" | "head" | "all";
  path: string;
  install: (params: UserInfoEditRouteHandlerParams) => Promise<void> | void;
}

export const modules: UserInfoEditExpressRouteModule[] = [
  {
    method: 'post',
    path: '/userinfoEdit',
    install: async ({ req, res }: UserInfoEditRouteHandlerParams): Promise<void> => {
      try {
        const { token, cookies, field, edit } = req.body;

        if (typeof token !== 'string' || !token) {
          res.status(400).json({ error: 'Token is required and must be a string.' });
          return;
        }
        if (typeof field !== 'string' || !field) {
          res.status(400).json({ error: 'Field to edit is required and must be a string.' });
          return;
        }
        if (edit === undefined) {
          res.status(400).json({ error: 'New value for edit is required.' });
          return;
        }
        if (cookies === undefined || cookies === null) {
          res.status(400).json({ error: 'Cookies are required.' });
          return;
        }

        let safeCookies: Record<string, any>;
        if (typeof cookies === 'string') {
          try {
            safeCookies = JSON.parse(cookies);
          } catch (parseError: unknown) {
            const errMsg = parseError instanceof Error ? parseError.message : String(parseError);
            res.status(400).json({ error: `Invalid cookies JSON format: ${errMsg}` });
            return;
          }
        } else if (typeof cookies === 'object' && cookies !== null) {
          safeCookies = cookies;
        } else {
          res.status(400).json({ error: 'Cookies must be a JSON string or an object.' });
          return;
        }

        const data: UserInfoEditApiResponseData = await api.userinfoEdit({ token, cookies: safeCookies, field, edit });
        res.json({ data });
      } catch (err: unknown) {
        let errorMessage = "An unknown error occurred while editing user info.";
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
            console.error(`Axios error response from /userinfoEdit endpoint: Status ${statusCode}`, axiosError.response.data);
          } else if (axiosError.request) {
            errorMessage = "No response received from userinfoEdit service.";
            statusCode = 503;
            console.error("Axios no response error for /userinfoEdit:", axiosError.request);
          }
        } else if (originalError instanceof Error) {
          errorMessage = originalError.message;
        } else if (typeof originalError === 'string') {
          errorMessage = originalError;
        } else {
          errorMessage = String(originalError);
        }

        console.error(`Error in /userinfoEdit route: ${errorMessage}`, topLevelError);
        if (!res.headersSent) {
            res.status(statusCode).json({ error: errorMessage });
        }
      }
    },
  },
];
