import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { requestContext } from "./middleware/request-context.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { businessRouter } from "./modules/businesses/business.routes.js";
import { customerRouter } from "./modules/customers/customer.routes.js";
import { deviceRouter } from "./modules/devices/device.routes.js";
import { expenseRouter } from "./modules/expenses/expense.routes.js";
import { inventoryRouter } from "./modules/inventory/inventory.routes.js";
import { invoiceRouter } from "./modules/invoices/invoice.routes.js";
import { notificationRouter } from "./modules/notifications/notification.routes.js";
import { repairRouter } from "./modules/repairs/repair.routes.js";
import { reportRouter } from "./modules/reports/report.routes.js";
import { settingRouter } from "./modules/settings/setting.routes.js";
import { subscriptionRouter } from "./modules/subscriptions/subscription.routes.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY);
  app.use(requestContext);
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }, crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true, methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], allowedHeaders: ["authorization", "content-type", "x-request-id"] }));
  app.use(express.json({ limit: "1mb", verify: (request, _response, buffer) => { (request as unknown as Express.Request).rawBody = Buffer.from(buffer); } }));
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));
  app.use(cookieParser());
  app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false }));

  app.get("/health", (_request, response) => response.json({ success: true, data: { status: "ok", uptimeSeconds: Math.floor(process.uptime()) } }));
  app.get("/ready", async (_request, response) => {
    await prisma.$queryRaw`SELECT 1`;
    response.json({ success: true, data: { status: "ready" } });
  });

  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/businesses", businessRouter);
  app.use("/api/v1/customers", customerRouter);
  app.use("/api/v1/devices", deviceRouter);
  app.use("/api/v1/repairs", repairRouter);
  app.use("/api/v1/inventory", inventoryRouter);
  app.use("/api/v1/expenses", expenseRouter);
  app.use("/api/v1/invoices", invoiceRouter);
  app.use("/api/v1/notifications", notificationRouter);
  app.use("/api/v1/reports", reportRouter);
  app.use("/api/v1/settings", settingRouter);
  app.use("/api/v1/subscriptions", subscriptionRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
