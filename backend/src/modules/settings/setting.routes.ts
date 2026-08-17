import { RoleCode } from "../../generated/prisma/index.js";
import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
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

router.get("/integrations/status", async (request, response) => {
  response.json({ success: true, data: { email: Boolean(env.SMTP_HOST), whatsapp: Boolean(env.WHATSAPP_API_VERSION && env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID), kraEtims: Boolean(env.KRA_ETIMS_BASE_URL && env.KRA_ETIMS_CLIENT_ID && env.KRA_ETIMS_CLIENT_SECRET), subscriptionGateway: Boolean(env.PAYMENT_GATEWAY_WEBHOOK_SECRET), google: Boolean(env.GOOGLE_WEB_CLIENT_ID) } });
});

router.get("/tax", authorize(RoleCode.BUSINESS_ADMIN), async (request, response) => {
  const businessId = requireBusiness(request);
  const value = await prisma.businessTaxSetting.findUnique({ where: { businessId } });
  response.json({ success: true, data: value ?? { businessId, etimsEnabled: false, environment: "sandbox", requireCustomerKraPin: false } });
});

router.put("/tax", authorize(RoleCode.BUSINESS_ADMIN), validate(z.object({ etimsEnabled: z.boolean(), environment: z.enum(["sandbox", "production"]), branchCode: z.string().trim().max(80).optional(), deviceIdentifier: z.string().trim().max(160).optional(), requireCustomerKraPin: z.boolean() })), async (request, response) => {
  const businessId = requireBusiness(request);
  const setting = await prisma.businessTaxSetting.upsert({ where: { businessId }, update: request.body, create: { businessId, ...request.body } });
  await writeAudit(prisma, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "BUSINESS_TAX_SETTINGS_CHANGED", resourceType: "business_tax_setting", resourceId: setting.id, metadata: { etimsEnabled: setting.etimsEnabled, environment: setting.environment, requireCustomerKraPin: setting.requireCustomerKraPin } });
  response.json({ success: true, data: setting });
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
