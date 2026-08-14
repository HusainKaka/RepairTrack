import axios, { type InternalAxiosRequestConfig } from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:4000/api/v1",
  withCredentials: true,
  headers: { "content-type": "application/json" }
});

let accessToken: string | null = null;
export function setAccessToken(token: string | null): void { accessToken = token; }

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

interface RetryConfig extends InternalAxiosRequestConfig { _repairtrackRetried?: boolean }
let refreshPromise: Promise<string> | null = null;
api.interceptors.response.use((response) => response, async (error: unknown) => {
  if (!axios.isAxiosError(error)) throw error;
  const config = error.config as RetryConfig | undefined;
  if (error.response?.status !== 401 || !config || config._repairtrackRetried || config.url?.includes("/auth/")) throw error;
  config._repairtrackRetried = true;
  refreshPromise ??= axios.post<{ data: { accessToken: string } }>(`${api.defaults.baseURL}/auth/refresh`, undefined, { withCredentials: true }).then(({ data }) => { setAccessToken(data.data.accessToken); return data.data.accessToken; }).finally(() => { refreshPromise = null; });
  config.headers.Authorization = `Bearer ${await refreshPromise}`;
  return api(config);
});

export function apiMessage(error: unknown): string {
  if (axios.isAxiosError(error)) return (error.response?.data as { message?: string } | undefined)?.message ?? "The server could not complete the request.";
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}
