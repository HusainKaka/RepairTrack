import { prisma } from "./prisma.js";

export const GOOGLE_REVIEW_SETTING = "reviews.google";

/** Explicit public Google review destinations only; never fetched by the server. */
export function googleReviewUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048 || /[\s\p{Cc}\\]/u.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return null;
    const valid = (url.hostname === "g.page" && /^\/r\/[A-Za-z0-9_-]+\/review\/?$/.test(url.pathname))
      || (["search.google.com", "www.google.com", "google.com"].includes(url.hostname) && url.pathname === "/local/writereview" && Boolean(url.searchParams.get("placeid")?.match(/^[A-Za-z0-9_-]{5,256}$/)))
      || (url.hostname === "maps.app.goo.gl" && /^\/[A-Za-z0-9]+\/?$/.test(url.pathname));
    return valid ? url.href : null;
  } catch { return null; }
}

export async function getGoogleReviewUrl(businessId: string): Promise<string | null> {
  const setting = await prisma.setting.findUnique({ where: { scope_key: { scope: `business:${businessId}`, key: GOOGLE_REVIEW_SETTING } } });
  if (!setting || setting.businessId !== businessId || !setting.value || typeof setting.value !== "object" || Array.isArray(setting.value)) return null;
  return googleReviewUrl((setting.value as { googleReviewUrl?: unknown }).googleReviewUrl);
}
