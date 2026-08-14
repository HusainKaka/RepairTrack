export type Role = "SUPER_ADMIN" | "BUSINESS_ADMIN" | "TECHNICIAN" | "CUSTOMER";

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  businessId: string | null;
}

export interface ApiEnvelope<T> { success: true; data: T }

export interface Repair {
  id: string; reference: string; reportedIssue: string; diagnosis?: string; status: string; priority: string; createdAt: string; estimatedCompletionAt?: string;
  customer: { id: string; fullName: string; phone: string };
  device: { id: string; type: string; brand: string; model: string; serialNumber?: string };
  assignedTechnician?: { id: string; fullName: string };
}

export interface Customer { id: string; fullName: string; email?: string; phone: string; alternativePhone?: string; address?: string; notes?: string; _count?: { devices: number; repairs: number; invoices: number } }
export interface Device { id: string; customerId: string; type: string; brand: string; model: string; serialNumber?: string; imei?: string; reportedFault: string; customer?: { id: string; fullName: string; phone: string } }
export interface InventoryItem { id: string; sku: string; name: string; category: string; purchaseCost: string; sellingPrice: string; quantity: number; minimumStock: number; location?: string }
export interface Invoice { id: string; number: string; status: string; paymentStatus: string; total: string; amountPaid: string; balance: string; createdAt: string; customer: { id: string; fullName: string }; repair?: { id: string; reference: string } }

export interface Technician { id: string; fullName: string; email: string; phone?: string; status: string; lastLoginAt?: string; _count?: { assignedRepairs: number } }
export interface Business { id: string; name: string; email: string; phone: string; city: string; country: string; status: string; subscriptionStatus: string; createdAt: string; _count?: { users: number; repairs: number } }
export interface Notification { id: string; title: string; body: string; channel: string; status: string; readAt?: string; createdAt: string }
export interface AuditLog { id: string; action: string; resourceType: string; resourceId?: string; ipAddress?: string; createdAt: string; user?: { fullName: string; email: string }; metadata?: Record<string, unknown> }
export interface RepairDetail extends Repair {
  diagnosis?: string; internalNotes?: string; customerVisibleNotes?: string; estimatedCost?: string; acceptedAt?: string;
  statusHistory: { id: string; fromStatus?: string; toStatus: string; customerMessage?: string; createdAt: string }[];
  notes: { id: string; body: string; visibility: string; createdAt: string; author: { fullName: string } }[];
  parts: { id: string; quantity: number; unitPrice: string; inventoryItem: { name: string; sku: string } }[];
  invoices: Invoice[];
}
