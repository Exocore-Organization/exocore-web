// @ts-check

import axios, { AxiosResponse, AxiosError } from 'axios';
import { Request, Response } from 'express';

console.log(`[Register Module] src/register.ts file is being evaluated. __dirname is: ${__dirname}`);

interface PastebinResponse {
  link: string;
}

interface RegisterClientPayload {
  user: string;
  pass: string;
  email: string;
  nickname?: string;
  avatar?: string;
  bio?: string;
  dob?: string;
  cover_photo?: string;
  country?: string;
  timezone?: string;
}

type ExternalApiSignUpPayload = RegisterClientPayload;

interface RegisterApiResponseData {
  status: string; 
  token?: string;
  cookies?: string;
  avatar?: string;
  cover_photo?: string;
  message?: string;
}

function isRegisterClientPayload(body: any): body is RegisterClientPayload {
  return !!(body && typeof body === 'object' &&
      typeof body.user === 'string' && body.user.length > 0 &&
      typeof body.pass === 'string' && body.pass.length > 0 &&
      typeof body.email === 'string' && body.email.length > 0);
}

function isRegisterApiResponseData(data: any): data is RegisterApiResponseData {
  return !!(data && typeof data === 'object' && typeof data.status === 'string');
}

const api = {
  async getLink(): Promise<string> {
    console.log("[Register API - getLink] Attempting to fetch link...");
    try {
      const res: AxiosResponse<string | PastebinResponse> = await axios.get('https://pastebin.com/raw/pi3kz4LU');
      const responseData = res.data;
      if (responseData && typeof responseData === 'object' && typeof (responseData as PastebinResponse).link === 'string') {
        return (responseData as PastebinResponse).link;
      } else if (typeof responseData === 'string' && responseData.startsWith('http')) {
        return responseData;
      }
      throw new Error('Invalid or missing link in Pastebin response data.');
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      throw new Error('Failed to get base link.', { cause: error });
    }
  },

  async register(body: ExternalApiSignUpPayload): Promise<RegisterApiResponseData> {
    console.log("[Register API - register] Attempting external API signup, payload:", body);
    try {
      const link: string = await api.getLink();
      const res: AxiosResponse<RegisterApiResponseData> = await axios.post(`${link}/signup`, body);
      console.log("[Register API - register] Response from external API:", res.data);
      return res.data; // Axios automatically parses JSON response
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (axios.isAxiosError(error) && error.response) {
        console.error("Axios error data:", error.response.data, "Status:", error.response.status);
      }
      throw new Error('Failed to contact/process signup endpoint.', { cause: error });
    }
  },
};

interface RegisterRouteParams {
  req: Request<any, any, any>; // Body is initially any, refined by type guard
  res: Response;
}

interface RegisterExpressRouteModule {
  method: "get" | "post" | "put" | "delete" | "patch" | "options" | "head" | "all";
  path: string;
  install: (params: RegisterRouteParams) => Promise<void> | void;
}

export const modules: RegisterExpressRouteModule[] = [
  {
    method: 'post',
    path: '/register',
    install: async ({ req, res }: RegisterRouteParams): Promise<void> => {
      console.log(`[Register Route] Handler for ${req.method.toUpperCase()} ${req.path}`);
      const rawClientBody: unknown = req.body;
      console.log("[Register Route] Raw request body from client:", rawClientBody);

      try {
        if (isRegisterClientPayload(rawClientBody)) {
          const clientData: RegisterClientPayload = rawClientBody; // Type guard refines type

          const payloadForExternalApi: ExternalApiSignUpPayload = {
            user: clientData.user,
            pass: clientData.pass,
            email: clientData.email,
          };

          if (clientData.nickname && clientData.nickname.trim() !== "") payloadForExternalApi.nickname = clientData.nickname;
          if (clientData.avatar && clientData.avatar.trim() !== "") payloadForExternalApi.avatar = clientData.avatar;
          if (clientData.bio && clientData.bio.trim() !== "") payloadForExternalApi.bio = clientData.bio;
          if (clientData.dob && clientData.dob.trim() !== "") payloadForExternalApi.dob = clientData.dob;
          if (clientData.cover_photo && clientData.cover_photo.trim() !== "") payloadForExternalApi.cover_photo = clientData.cover_photo;
          if (clientData.country && clientData.country.trim() !== "") payloadForExternalApi.country = clientData.country;
          if (clientData.timezone && clientData.timezone.trim() !== "") payloadForExternalApi.timezone = clientData.timezone;

          const rawApiResult: RegisterApiResponseData = await api.register(payloadForExternalApi);

          if (isRegisterApiResponseData(rawApiResult)) { // Guard for external API response structure
            const resultFromExternalApi: RegisterApiResponseData = rawApiResult;

            if (resultFromExternalApi.status === 'success') {
              console.log("[Register Route] External API reported SUCCESS.");
              res.json({
                success: true,
                message: resultFromExternalApi.message || "Registration successful!",
                data: resultFromExternalApi
              });
            } else {
              console.warn("[Register Route] External API reported FAILURE. Status:", resultFromExternalApi.status, "Message:", resultFromExternalApi.message);
              res.status(400).json({
                success: false,
                error: resultFromExternalApi.message || "Registration failed at external API."
              });
            }
          } else {
            console.error("[Register Route] Unexpected response structure from external API:", rawApiResult);
            res.status(500).json({ success: false, error: "Received an unexpected response from the registration service." });
          }

        } else {
          console.warn("[Register Route] Validation failed: req.body does not conform to RegisterClientPayload. Received:", rawClientBody);
          res.status(400).json({ success: false, error: 'Invalid registration data: user, pass, and email are required and must be valid non-empty strings.' });
          return;
        }
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        let errorMessage = "An unknown error occurred";
        let statusCode = 500;
        console.error(`[Register Route] Overall error:`, error.message, (error as any).cause || error);

        const originalError = (error as any).cause || error;

        if (axios.isAxiosError(originalError)) {
          const axiosError = originalError as AxiosError<any>; // Type assertion
          errorMessage = axiosError.message;
          statusCode = axiosError.response?.status || 503;
          const responseData = axiosError.response?.data;
          const specificApiError = responseData?.error || responseData?.message;

          if (specificApiError) {
            errorMessage = `Reg API Error (${statusCode}): ${specificApiError}`;
          } else if (axiosError.response) {
            errorMessage = `Reg API Error (${statusCode}): Req failed (status ${statusCode}).`;
          } else if (axiosError.request) {
            errorMessage = `No response from reg service: ${axiosError.message}`;
          }
        } else if (originalError instanceof Error) {
          errorMessage = originalError.message || String(originalError);
        } else {
            errorMessage = String(originalError);
        }

        console.error(`[Register Route] Error to client: ${errorMessage}, Status: ${statusCode}`);
        if (!res.headersSent) {
          res.status(statusCode).json({ success: false, error: errorMessage });
        } else {
          console.warn("[Register Route] Headers sent, cannot send error.");
        }
      }
    },
  },
];
