import { Router } from "express";
import { z } from "zod";
import { notFound } from "../../errors/app-error.js";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";

const router = Router();
router.use(authenticate);

router.get("/", async (request, response) => {
  const notifications = await prisma.notification.findMany({ where: { userId: request.auth!.userId }, orderBy: { createdAt: "desc" }, take: 100 });
  response.json({ success: true, data: notifications });
});

router.patch("/:id/read", async (request, response) => {
  const notification = await prisma.notification.findFirst({ where: { id: request.params.id, userId: request.auth!.userId } });
  if (!notification) throw notFound("Notification");
  const updated = await prisma.notification.update({ where: { id: notification.id }, data: { readAt: new Date(), status: notification.status === "SENT" ? "READ" : notification.status } });
  response.json({ success: true, data: updated });
});

router.post("/devices", validate(z.object({ token: z.string().min(20).max(4096), platform: z.enum(["android", "web"]) })), async (request, response) => {
  const device = await prisma.devicePushToken.upsert({ where: { token: request.body.token }, update: { userId: request.auth!.userId, businessId: request.auth!.businessId, platform: request.body.platform, lastSeenAt: new Date(), revokedAt: null }, create: { userId: request.auth!.userId, businessId: request.auth!.businessId, token: request.body.token, platform: request.body.platform } });
  response.status(201).json({ success: true, data: { id: device.id } });
});

router.delete("/devices", validate(z.object({ token: z.string().min(20).max(4096) })), async (request, response) => {
  await prisma.devicePushToken.updateMany({ where: { token: request.body.token, userId: request.auth!.userId }, data: { revokedAt: new Date() } });
  response.status(204).end();
});

export { router as notificationRouter };

