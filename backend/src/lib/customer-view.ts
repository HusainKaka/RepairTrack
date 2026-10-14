const privateFields = new Set(["internalNotes", "diagnosis", "publicTrackingTokenHash", "publicTrackingTokenEncrypted", "historicalUnitCost", "purchaseCost", "passwordHash", "googleSubject", "tokenHash", "ipAddress", "userAgent"]);

/** Redacts nested internal records as well as the top-level customer response. */
export function customerView(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(customerView);
  if (!value || typeof value !== "object" || value instanceof Date || typeof (value as { toJSON?: unknown }).toJSON === "function") return value;
  return Object.fromEntries(Object.entries(value).filter(([key, item]) => !privateFields.has(key) && !(key === "notes" && typeof item === "string")).map(([key, item]) => [key, customerView(key === "notes" && Array.isArray(item) ? item.filter(note => note?.visibility === "CUSTOMER") : item)]));
}
