import type { RoleCode } from "../generated/prisma/index.js";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: {
        userId: string;
        businessId: string | null;
        role: RoleCode;
        sessionId: string;
      };
    }
  }
}

export {};
