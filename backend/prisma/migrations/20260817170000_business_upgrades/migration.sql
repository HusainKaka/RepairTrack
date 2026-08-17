-- RepairTrack business upgrades are additive and preserve all existing records.
-- Back up production before applying this migration and run it once through `prisma migrate deploy`.

ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'VOID';
ALTER TYPE "NotificationChannel" ADD VALUE IF NOT EXISTS 'WHATSAPP';

CREATE TYPE "CustomerType" AS ENUM ('INDIVIDUAL', 'BUSINESS');
CREATE TYPE "CustomerNotificationPreference" AS ENUM ('EMAIL', 'WHATSAPP');
CREATE TYPE "InvoiceItemType" AS ENUM ('INVENTORY', 'NON_INVENTORY', 'LABOUR', 'SERVICE', 'CUSTOM');
CREATE TYPE "KraEtimsStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'CANCELLED_ADJUSTED');
CREATE TYPE "NotificationCategory" AS ENUM ('CUSTOMER_ACCEPTED_REPAIR', 'CUSTOMER_DECLINED_REPAIR', 'REPAIR_COMPLETED', 'PAYMENT', 'INVENTORY', 'SUBSCRIPTION', 'SYSTEM');
CREATE TYPE "CustomerRepairDecision" AS ENUM ('ACCEPTED', 'DECLINED');
CREATE TYPE "ExpenseCategory" AS ENUM ('RENT', 'ELECTRICITY', 'WATER', 'INTERNET', 'TELEPHONE', 'GAS', 'SALARIES', 'TRANSPORT', 'MARKETING', 'SOFTWARE', 'EQUIPMENT', 'MAINTENANCE', 'BANKING_CHARGES', 'TAX_FEES', 'OTHER');
CREATE TYPE "ExpenseStatus" AS ENUM ('ACTIVE', 'VOID');
CREATE TYPE "SubscriptionBillingCycle" AS ENUM ('MONTHLY', 'ANNUAL');
CREATE TYPE "SubscriptionPaymentStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'REFUNDED');
CREATE TYPE "GatewayEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'REJECTED');

ALTER TABLE "businesses"
  ADD COLUMN "defaultLabourCharge" DECIMAL(12,2) NOT NULL DEFAULT 1500,
  ADD COLUMN "allowInvoicePriceOverride" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "users"
  ADD COLUMN "canTakeRepairJobs" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "customers"
  ADD COLUMN "customerType" "CustomerType" NOT NULL DEFAULT 'INDIVIDUAL',
  ADD COLUMN "whatsappPhone" TEXT,
  ADD COLUMN "kraPin" TEXT,
  ADD COLUMN "preferredCommunication" "CustomerNotificationPreference" NOT NULL DEFAULT 'EMAIL';

ALTER TABLE "repairs"
  ADD COLUMN "notificationPreferenceOverride" "CustomerNotificationPreference",
  ADD COLUMN "approvalVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "publicTrackingTokenEncrypted" TEXT;

ALTER TABLE "invoices"
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "invoiceLevelDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "kraStatus" "KraEtimsStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "kraReference" TEXT,
  ADD COLUMN "voidedAt" TIMESTAMP(3),
  ADD COLUMN "voidReason" TEXT;

ALTER TABLE "invoice_items"
  ADD COLUMN "itemType" "InvoiceItemType" NOT NULL DEFAULT 'CUSTOM',
  ADD COLUMN "inventoryItemId" UUID,
  ADD COLUMN "repairId" UUID,
  ADD COLUMN "historicalUnitCost" DECIMAL(12,2),
  ADD COLUMN "stockDeductedAt" TIMESTAMP(3);

ALTER TABLE "notifications"
  ADD COLUMN "category" "NotificationCategory" NOT NULL DEFAULT 'SYSTEM',
  ADD COLUMN "metadata" JSONB;

CREATE TABLE "customer_repair_responses" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "repairId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "decision" "CustomerRepairDecision" NOT NULL,
  "approvalVersion" INTEGER NOT NULL,
  "estimateAmountPresented" DECIMAL(12,2),
  "declineReason" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_repair_responses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "business_expenses" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "category" "ExpenseCategory" NOT NULL,
  "description" TEXT NOT NULL,
  "supplier" TEXT,
  "amount" DECIMAL(12,2) NOT NULL,
  "expenseDate" TIMESTAMP(3) NOT NULL,
  "reference" TEXT,
  "notes" TEXT,
  "attachmentUrl" TEXT,
  "recurring" BOOLEAN NOT NULL DEFAULT false,
  "status" "ExpenseStatus" NOT NULL DEFAULT 'ACTIVE',
  "voidReason" TEXT,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "business_expenses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "technician_profiles" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "technician_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "business_tax_settings" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "etimsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "environment" TEXT NOT NULL DEFAULT 'sandbox',
  "branchCode" TEXT,
  "deviceIdentifier" TEXT,
  "requireCustomerKraPin" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "business_tax_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kra_etims_submissions" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "invoiceId" UUID NOT NULL,
  "status" "KraEtimsStatus" NOT NULL DEFAULT 'PENDING',
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "officialReference" TEXT,
  "requestPayload" JSONB NOT NULL,
  "responsePayload" JSONB,
  "failureReason" TEXT,
  "submittedAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "kra_etims_submissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscription_plans" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "monthlyPrice" DECIMAL(12,2) NOT NULL,
  "annualPrice" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'KES',
  "trialDays" INTEGER NOT NULL DEFAULT 0,
  "repairLimit" INTEGER,
  "technicianLimit" INTEGER,
  "businessUserLimit" INTEGER,
  "storageMb" INTEGER,
  "features" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "business_subscriptions" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "planId" UUID NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
  "billingCycle" "SubscriptionBillingCycle" NOT NULL DEFAULT 'MONTHLY',
  "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "trialEnd" TIMESTAMP(3),
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "renewalDate" TIMESTAMP(3),
  "cancelledDate" TIMESTAMP(3),
  "gracePeriodEndsAt" TIMESTAMP(3),
  "gatewayCustomerReference" TEXT,
  "gatewaySubscriptionReference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "business_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscription_payments" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "subscriptionId" UUID NOT NULL,
  "recordedById" UUID,
  "provider" TEXT NOT NULL,
  "providerTransactionId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "status" "SubscriptionPaymentStatus" NOT NULL DEFAULT 'PENDING',
  "paidAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_gateway_events" (
  "id" UUID NOT NULL,
  "businessId" UUID,
  "provider" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "status" "GatewayEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "payload" JSONB NOT NULL,
  "failureReason" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_gateway_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_repair_responses_repairId_approvalVersion_key" ON "customer_repair_responses"("repairId", "approvalVersion");
CREATE INDEX "customer_repair_responses_businessId_createdAt_idx" ON "customer_repair_responses"("businessId", "createdAt");
CREATE INDEX "business_expenses_businessId_expenseDate_idx" ON "business_expenses"("businessId", "expenseDate");
CREATE INDEX "business_expenses_businessId_category_expenseDate_idx" ON "business_expenses"("businessId", "category", "expenseDate");
CREATE UNIQUE INDEX "technician_profiles_userId_key" ON "technician_profiles"("userId");
CREATE INDEX "technician_profiles_businessId_active_idx" ON "technician_profiles"("businessId", "active");
CREATE UNIQUE INDEX "business_tax_settings_businessId_key" ON "business_tax_settings"("businessId");
CREATE INDEX "kra_etims_submissions_businessId_status_createdAt_idx" ON "kra_etims_submissions"("businessId", "status", "createdAt");
CREATE INDEX "kra_etims_submissions_invoiceId_attempt_idx" ON "kra_etims_submissions"("invoiceId", "attempt");
CREATE UNIQUE INDEX "subscription_plans_name_key" ON "subscription_plans"("name");
CREATE INDEX "subscription_plans_active_idx" ON "subscription_plans"("active");
CREATE UNIQUE INDEX "business_subscriptions_businessId_key" ON "business_subscriptions"("businessId");
CREATE INDEX "business_subscriptions_status_currentPeriodEnd_idx" ON "business_subscriptions"("status", "currentPeriodEnd");
CREATE UNIQUE INDEX "subscription_payments_idempotencyKey_key" ON "subscription_payments"("idempotencyKey");
CREATE UNIQUE INDEX "subscription_payments_provider_providerTransactionId_key" ON "subscription_payments"("provider", "providerTransactionId");
CREATE INDEX "subscription_payments_businessId_status_createdAt_idx" ON "subscription_payments"("businessId", "status", "createdAt");
CREATE UNIQUE INDEX "payment_gateway_events_provider_providerEventId_key" ON "payment_gateway_events"("provider", "providerEventId");
CREATE INDEX "payment_gateway_events_status_createdAt_idx" ON "payment_gateway_events"("status", "createdAt");
CREATE INDEX "customers_businessId_kraPin_idx" ON "customers"("businessId", "kraPin");
CREATE INDEX "invoice_items_businessId_inventoryItemId_idx" ON "invoice_items"("businessId", "inventoryItemId");
CREATE INDEX "invoice_items_businessId_repairId_idx" ON "invoice_items"("businessId", "repairId");

ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "repairs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customer_repair_responses" ADD CONSTRAINT "customer_repair_responses_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_repair_responses" ADD CONSTRAINT "customer_repair_responses_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "repairs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_repair_responses" ADD CONSTRAINT "customer_repair_responses_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_expenses" ADD CONSTRAINT "business_expenses_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_expenses" ADD CONSTRAINT "business_expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "technician_profiles" ADD CONSTRAINT "technician_profiles_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "technician_profiles" ADD CONSTRAINT "technician_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_tax_settings" ADD CONSTRAINT "business_tax_settings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kra_etims_submissions" ADD CONSTRAINT "kra_etims_submissions_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kra_etims_submissions" ADD CONSTRAINT "kra_etims_submissions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_subscriptions" ADD CONSTRAINT "business_subscriptions_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_subscriptions" ADD CONSTRAINT "business_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "business_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_gateway_events" ADD CONSTRAINT "payment_gateway_events_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "subscription_plans" ("id", "name", "monthlyPrice", "annualPrice", "currency", "trialDays", "repairLimit", "technicianLimit", "businessUserLimit", "storageMb", "features", "active", "createdAt", "updatedAt") VALUES
  ('00000000-0000-4000-8000-000000000101', 'Starter', 2500, 25000, 'KES', 14, 100, 2, 3, 1024, '{"inventory":true,"reports":false,"whatsapp":false,"kraEtims":false}'::jsonb, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000102', 'Professional', 6000, 60000, 'KES', 14, NULL, 10, 15, 5120, '{"inventory":true,"reports":true,"whatsapp":true,"kraEtims":false}'::jsonb, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000103', 'Enterprise', 12000, 120000, 'KES', 30, NULL, NULL, NULL, 20480, '{"inventory":true,"reports":true,"whatsapp":true,"kraEtims":true}'::jsonb, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "business_subscriptions" ("id", "businessId", "planId", "status", "billingCycle", "startDate", "trialEnd", "createdAt", "updatedAt")
SELECT (
  substr(md5(b."id"::text || ':repairtrack-subscription'), 1, 8) || '-' ||
  substr(md5(b."id"::text || ':repairtrack-subscription'), 9, 4) || '-4' ||
  substr(md5(b."id"::text || ':repairtrack-subscription'), 14, 3) || '-8' ||
  substr(md5(b."id"::text || ':repairtrack-subscription'), 18, 3) || '-' ||
  substr(md5(b."id"::text || ':repairtrack-subscription'), 21, 12)
)::uuid, b."id", '00000000-0000-4000-8000-000000000101', b."subscriptionStatus", 'MONTHLY', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '14 days', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "businesses" b
WHERE b."deletedAt" IS NULL
ON CONFLICT ("businessId") DO NOTHING;
