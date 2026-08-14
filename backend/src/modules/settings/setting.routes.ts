import { RoleCode } from "../../generated/prisma/index.js";
import { Router } from "express";
import { z } from "zod";
import { writeAudit } from "../../lib/audit.js";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize, requireBusiness } from "../../middleware/authorize.js";
import { routeParam, validate } from "../../middleware/validate.js";

const router = Router();
router.use(authenticate, authorize(RoleCode.SUPER_ADMIN, RoleCode.BUSINESS_ADMIN));

router.get("/", async (request, response) => {
  const scope = request.auth!.role === RoleCode.SUPER_ADMIN ? "platform" : `business:${requireBusiness(request)}`;
  const settings = await prisma.setting.findMany({ where: { scope }, orderBy: { key: "asc" } });
  response.json({ success: true, data: settings });
});

router.put("/:key", validate(z.object({ value: z.json() })), async (request, response) => {
  const businessId = request.auth!.role === RoleCode.BUSINESS_ADMIN ? requireBusiness(request) : null;
  const scope = businessId ? `business:${businessId}` : "platform";
  const key = routeParam(request.params.key, "setting key");
  const setting = await prisma.setting.upsert({ where: { scope_key: { scope, key } }, update: { value: request.body.value }, create: { businessId, scope, key, value: request.body.value } });
  await writeAudit(prisma, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "SETTING_CHANGED", resourceType: "setting", resourceId: setting.id, metadata: { key: setting.key } });
  response.json({ success: true, data: setting });
});

export { router as settingRouter };
