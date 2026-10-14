-- Additive digital-service intake. Existing repair and billing records are retained.
-- Apply with prisma migrate deploy using the deployment's existing database secret.

BEGIN;

CREATE TYPE "DigitalServiceKind" AS ENUM ('WEBSITE', 'SOFTWARE', 'AI_AGENT');
CREATE TYPE "DigitalTicketStatus" AS ENUM ('INTAKE', 'DISCOVERY', 'AWAITING_APPROVAL', 'IN_PROGRESS', 'TESTING', 'READY_FOR_DELIVERY', 'DELIVERED', 'CANCELLED');

CREATE TABLE "digital_tickets" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "assignedTechnicianId" UUID,
  "kind" "DigitalServiceKind" NOT NULL,
  "reference" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "requirements" TEXT NOT NULL,
  "priority" "RepairPriority" NOT NULL DEFAULT 'NORMAL',
  "status" "DigitalTicketStatus" NOT NULL DEFAULT 'INTAKE',
  "internalNotes" TEXT,
  "customerVisibleNotes" TEXT,
  "estimatedCompletionAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "publicTrackingTokenHash" TEXT NOT NULL,
  "publicTrackingTokenEncrypted" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "digital_tickets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "digital_status_history" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "digitalTicketId" UUID NOT NULL,
  "fromStatus" "DigitalTicketStatus",
  "toStatus" "DigitalTicketStatus" NOT NULL,
  "changedByUserId" UUID,
  "customerMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "digital_status_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "digital_notes" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "digitalTicketId" UUID NOT NULL,
  "authorId" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "visibility" "NoteVisibility" NOT NULL DEFAULT 'INTERNAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "digital_notes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "invoices" ADD COLUMN "digitalTicketId" UUID;
ALTER TABLE "customers" ADD COLUMN "whatsappOptIn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "customers" ADD COLUMN "whatsappOptInAt" TIMESTAMP(3);
ALTER TABLE "notifications" ADD COLUMN "digitalTicketId" UUID;
ALTER TABLE "notifications" ADD COLUMN "deduplicationKey" TEXT;
CREATE UNIQUE INDEX "notifications_deduplicationKey_key" ON "notifications"("deduplicationKey");
ALTER TABLE "invoices" ADD CONSTRAINT "invoice_single_ticket_kind" CHECK ("repairId" IS NULL OR "digitalTicketId" IS NULL);
ALTER TABLE "notifications" ADD CONSTRAINT "notification_single_ticket_kind" CHECK ("repairId" IS NULL OR "digitalTicketId" IS NULL);

CREATE UNIQUE INDEX "digital_tickets_publicTrackingTokenHash_key" ON "digital_tickets"("publicTrackingTokenHash");
CREATE UNIQUE INDEX "digital_tickets_businessId_reference_key" ON "digital_tickets"("businessId", "reference");
CREATE INDEX "digital_tickets_businessId_kind_status_idx" ON "digital_tickets"("businessId", "kind", "status");
CREATE INDEX "digital_tickets_businessId_assignedTechnicianId_idx" ON "digital_tickets"("businessId", "assignedTechnicianId");
CREATE INDEX "digital_tickets_businessId_customerId_createdAt_idx" ON "digital_tickets"("businessId", "customerId", "createdAt");
CREATE INDEX "digital_status_history_businessId_digitalTicketId_createdAt_idx" ON "digital_status_history"("businessId", "digitalTicketId", "createdAt");
CREATE INDEX "digital_notes_businessId_digitalTicketId_createdAt_idx" ON "digital_notes"("businessId", "digitalTicketId", "createdAt");
CREATE INDEX "invoices_businessId_digitalTicketId_idx" ON "invoices"("businessId", "digitalTicketId");
CREATE INDEX "notifications_businessId_digitalTicketId_createdAt_idx" ON "notifications"("businessId", "digitalTicketId", "createdAt");

ALTER TABLE "digital_tickets" ADD CONSTRAINT "digital_tickets_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "digital_tickets" ADD CONSTRAINT "digital_tickets_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "digital_tickets" ADD CONSTRAINT "digital_tickets_assignedTechnicianId_fkey" FOREIGN KEY ("assignedTechnicianId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "digital_status_history" ADD CONSTRAINT "digital_status_history_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "digital_status_history" ADD CONSTRAINT "digital_status_history_digitalTicketId_fkey" FOREIGN KEY ("digitalTicketId") REFERENCES "digital_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "digital_notes" ADD CONSTRAINT "digital_notes_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "digital_notes" ADD CONSTRAINT "digital_notes_digitalTicketId_fkey" FOREIGN KEY ("digitalTicketId") REFERENCES "digital_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "digital_notes" ADD CONSTRAINT "digital_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_digitalTicketId_fkey" FOREIGN KEY ("digitalTicketId") REFERENCES "digital_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_digitalTicketId_fkey" FOREIGN KEY ("digitalTicketId") REFERENCES "digital_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
