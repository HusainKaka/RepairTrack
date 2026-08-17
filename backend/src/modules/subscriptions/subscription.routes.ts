import { NotificationCategory, RoleCode, SubscriptionBillingCycle, SubscriptionPaymentStatus, SubscriptionStatus } from "../../generated/prisma/index.js";
import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError, notFound } from "../../errors/app-error.js";
import { writeAudit } from "../../lib/audit.js";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize, requireBusiness } from "../../middleware/authorize.js";
import { routeParam, validate } from "../../middleware/validate.js";
import { createInternalNotification } from "../notifications/notification.service.js";
import { type NormalizedSubscriptionEvent, verifyGatewaySignature } from "./subscription-gateway.js";
import { paymentMatchesPlan, subscriptionPeriodEnd } from "./subscription.service.js";

const router = Router();
const featureSchema = z.object({ inventory: z.boolean().default(true), reports: z.boolean().default(false), whatsapp: z.boolean().default(false), kraEtims: z.boolean().default(false) }).catchall(z.boolean());
const planSchema = z.object({ name: z.string().trim().min(2).max(100), monthlyPrice: z.number().nonnegative(), annualPrice: z.number().nonnegative(), currency: z.string().trim().length(3).default("KES"), trialDays: z.number().int().min(0).max(365).default(0), repairLimit: z.number().int().positive().nullable().optional(), technicianLimit: z.number().int().positive().nullable().optional(), businessUserLimit: z.number().int().positive().nullable().optional(), storageMb: z.number().int().positive().nullable().optional(), features: featureSchema, active: z.boolean().default(true) });
const eventSchema = z.object({ eventId: z.string().min(4).max(200), businessId: z.uuid(), subscriptionId: z.uuid(), transactionId: z.string().min(3).max(200), status: z.enum(["SUCCESS", "FAILED"]), amount: z.number().nonnegative(), currency: z.string().length(3), paidAt: z.iso.datetime().optional() });

router.post("/webhooks/:provider", validate(eventSchema), async (request, response) => {
  const provider = routeParam(request.params.provider, "payment provider").toUpperCase();
  if (provider !== env.PAYMENT_GATEWAY_PROVIDER.toUpperCase()) throw new AppError(404, "PAYMENT_PROVIDER_NOT_SUPPORTED", "This payment provider is not enabled.");
  if (!request.rawBody || !verifyGatewaySignature(request.rawBody, request.get("x-repairtrack-signature"))) throw new AppError(401, "INVALID_WEBHOOK_SIGNATURE", "The subscription payment webhook signature is invalid.");
  const event = request.body as NormalizedSubscriptionEvent;
  const existing = await prisma.paymentGatewayEvent.findUnique({ where: { provider_providerEventId: { provider, providerEventId: event.eventId } } });
  if (existing?.status === "PROCESSED") return response.json({ success: true, data: { duplicate: true } });
  const subscription = await prisma.businessSubscription.findFirst({ where: { id: event.subscriptionId, businessId: event.businessId }, include: { plan: true } });
  if (!subscription) throw notFound("Business subscription");
  const expectedAmount = subscription.billingCycle === SubscriptionBillingCycle.ANNUAL ? Number(subscription.plan.annualPrice) : Number(subscription.plan.monthlyPrice);
  const verified = event.status === "SUCCESS" && paymentMatchesPlan({ amount: event.amount, currency: event.currency, expectedAmount, expectedCurrency: subscription.plan.currency });
  const result = await prisma.$transaction(async (tx) => {
    const gatewayEvent = await tx.paymentGatewayEvent.upsert({ where: { provider_providerEventId: { provider, providerEventId: event.eventId } }, update: { businessId: event.businessId, payload: request.body, status: verified || event.status === "FAILED" ? "PROCESSED" : "REJECTED", processedAt: new Date(), failureReason: verified || event.status === "FAILED" ? undefined : "Payment amount or currency did not match the selected plan" }, create: { businessId: event.businessId, provider, providerEventId: event.eventId, payload: request.body, status: verified || event.status === "FAILED" ? "PROCESSED" : "REJECTED", processedAt: new Date(), failureReason: verified || event.status === "FAILED" ? undefined : "Payment amount or currency did not match the selected plan" } });
    const payment = await tx.subscriptionPayment.upsert({ where: { provider_providerTransactionId: { provider, providerTransactionId: event.transactionId } }, update: {}, create: { businessId: event.businessId, subscriptionId: subscription.id, provider, providerTransactionId: event.transactionId, idempotencyKey: `${provider}:${event.eventId}`, amount: event.amount, currency: event.currency.toUpperCase(), status: verified ? SubscriptionPaymentStatus.VERIFIED : SubscriptionPaymentStatus.FAILED, paidAt: verified ? new Date(event.paidAt ?? Date.now()) : undefined, failureReason: verified ? undefined : event.status === "FAILED" ? "Provider reported a failed payment" : "Payment amount or currency did not match the plan" } });
    if (!verified) return { gatewayEvent, payment, activated: false };
    const now = new Date(event.paidAt ?? Date.now());
    const start = subscription.currentPeriodEnd && subscription.currentPeriodEnd > now ? subscription.currentPeriodEnd : now;
    const periodEnd = subscriptionPeriodEnd(start, subscription.billingCycle);
    await tx.businessSubscription.update({ where: { id: subscription.id }, data: { status: SubscriptionStatus.ACTIVE, currentPeriodStart: now, currentPeriodEnd: periodEnd, renewalDate: periodEnd, cancelledDate: null, gracePeriodEndsAt: null } });
    await tx.business.update({ where: { id: event.businessId }, data: { subscriptionStatus: SubscriptionStatus.ACTIVE } });
    await writeAudit(tx, request, { businessId: event.businessId, action: "SUBSCRIPTION_PAYMENT_VERIFIED", resourceType: "business_subscription", resourceId: subscription.id, metadata: { provider, transactionId: event.transactionId, amount: event.amount, currency: event.currency, periodEnd: periodEnd.toISOString() } });
    return { gatewayEvent, payment, activated: true, periodEnd };
  }, { isolationLevel: "Serializable" });
  if (result.activated) {
    const administrators = await prisma.user.findMany({ where: { businessId: event.businessId, role: { code: RoleCode.BUSINESS_ADMIN }, status: "ACTIVE", deletedAt: null }, select: { id: true } });
    for (const administrator of administrators) await createInternalNotification({ businessId: event.businessId, userId: administrator.id, category: NotificationCategory.SUBSCRIPTION, template: `subscription.payment.${event.eventId}`, subject: "Subscription payment verified", body: `Your ${subscription.plan.name} subscription is active until ${result.periodEnd!.toLocaleDateString("en-KE")}.` });
  }
  response.json({ success: true, data: { activated: result.activated, paymentStatus: result.payment.status } });
});

router.use(authenticate);

router.get("/plans", authorize(RoleCode.SUPER_ADMIN, RoleCode.BUSINESS_ADMIN), async (request, response) => {
  const plans = await prisma.subscriptionPlan.findMany({ where: request.auth!.role === RoleCode.BUSINESS_ADMIN ? { active: true } : {}, orderBy: { monthlyPrice: "asc" } });
  response.json({ success: true, data: plans });
});

router.post("/plans", authorize(RoleCode.SUPER_ADMIN), validate(planSchema), async (request, response) => {
  const plan = await prisma.subscriptionPlan.create({ data: { ...request.body, currency: request.body.currency.toUpperCase() } });
  await writeAudit(prisma, request, { userId: request.auth!.userId, userRole: request.auth!.role, action: "SUBSCRIPTION_PLAN_CREATED", resourceType: "subscription_plan", resourceId: plan.id });
  response.status(201).json({ success: true, data: plan });
});

router.patch("/plans/:id", authorize(RoleCode.SUPER_ADMIN), validate(planSchema.partial()), async (request, response) => {
  const id = routeParam(request.params.id);
  const existing = await prisma.subscriptionPlan.findUnique({ where: { id } });
  if (!existing) throw notFound("Subscription plan");
  const plan = await prisma.subscriptionPlan.update({ where: { id }, data: { ...request.body, currency: request.body.currency?.toUpperCase() } });
  await writeAudit(prisma, request, { userId: request.auth!.userId, userRole: request.auth!.role, action: "SUBSCRIPTION_PLAN_CHANGED", resourceType: "subscription_plan", resourceId: plan.id, metadata: { fields: Object.keys(request.body) } });
  response.json({ success: true, data: plan });
});

router.get("/current", authorize(RoleCode.BUSINESS_ADMIN), async (request, response) => {
  const subscription = await prisma.businessSubscription.findUnique({ where: { businessId: requireBusiness(request) }, include: { plan: true, payments: { orderBy: { createdAt: "desc" }, take: 20 } } });
  if (!subscription) throw notFound("Business subscription");
  response.json({ success: true, data: subscription });
});

router.get("/businesses", authorize(RoleCode.SUPER_ADMIN), async (_request, response) => {
  const subscriptions = await prisma.businessSubscription.findMany({ include: { business: { select: { name: true, email: true } }, plan: true, payments: { orderBy: { createdAt: "desc" }, take: 5 } }, orderBy: { updatedAt: "desc" } });
  response.json({ success: true, data: subscriptions });
});

router.put("/businesses/:businessId", authorize(RoleCode.SUPER_ADMIN), validate(z.object({ planId: z.uuid(), status: z.enum(SubscriptionStatus), billingCycle: z.enum(SubscriptionBillingCycle), reason: z.string().trim().min(3).max(500) })), async (request, response) => {
  const businessId = routeParam(request.params.businessId, "business");
  const [business, plan] = await Promise.all([prisma.business.findFirst({ where: { id: businessId, deletedAt: null } }), prisma.subscriptionPlan.findUnique({ where: { id: request.body.planId } })]);
  if (!business) throw notFound("Business");
  if (!plan) throw notFound("Subscription plan");
  const subscription = await prisma.$transaction(async (tx) => {
    const value = await tx.businessSubscription.upsert({ where: { businessId }, update: { planId: plan.id, status: request.body.status, billingCycle: request.body.billingCycle }, create: { businessId, planId: plan.id, status: request.body.status, billingCycle: request.body.billingCycle } });
    await tx.business.update({ where: { id: businessId }, data: { subscriptionStatus: request.body.status } });
    await writeAudit(tx, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "SUBSCRIPTION_OVERRIDE", resourceType: "business_subscription", resourceId: value.id, metadata: { planId: plan.id, status: request.body.status, billingCycle: request.body.billingCycle, reason: request.body.reason } });
    return value;
  });
  response.json({ success: true, data: subscription });
});

router.post("/checkout", authorize(RoleCode.BUSINESS_ADMIN), validate(z.object({ planId: z.uuid(), billingCycle: z.enum(SubscriptionBillingCycle) })), async (request, response) => {
  if (!env.MPESA_CONSUMER_KEY || !env.MPESA_CONSUMER_SECRET || !env.MPESA_SHORTCODE || !env.MPESA_PASSKEY) throw new AppError(503, "PAYMENT_GATEWAY_NOT_CONFIGURED", "The subscription payment gateway is not configured. No subscription was activated.");
  response.status(501).json({ success: false, code: "CHECKOUT_ADAPTER_REQUIRED", message: "Provider credentials are present, but the hosted checkout adapter must be configured for this account before collecting payment." });
});

export { router as subscriptionRouter };
