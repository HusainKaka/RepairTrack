import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "../src/app.js";

const app = createApp();

/**
 * Vercel exposes functions from the /api directory.  Requests are rewritten
 * here and this adapter restores the paths expected by the Express app
 * (for example, /health and /api/v1/auth).
 */
export default function handler(request: IncomingMessage, response: ServerResponse): void {
  request.url = request.url?.replace(/^\/api(?=\/|$)/, "") || "/";
  app(request, response);
}
