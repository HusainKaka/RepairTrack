import sharp from "sharp";
import { AppError } from "../errors/app-error.js";
import { prisma } from "./prisma.js";

export const BUSINESS_LOGO_KEY = "business.logo.v1";
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const MAX_LOGO_DATA_URL_LENGTH = Math.ceil(MAX_LOGO_BYTES / 3) * 4 + 64;
const MAX_LOGO_PIXELS = 16_777_216;
const MAX_LOGO_SIDE = 4096;
const invalid = () => new AppError(422, "INVALID_LOGO_IMAGE", "Upload a valid PNG, JPEG, WebP, GIF, AVIF or TIFF image, no larger than 2 MB or 4096 × 4096 pixels. SVG is not supported.");

function imageType(bytes: Buffer): string | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpeg";
  if (["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))) return "gif";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  if (bytes.subarray(0, 4).equals(Buffer.from([73, 73, 42, 0])) || bytes.subarray(0, 4).equals(Buffer.from([77, 77, 0, 42]))) return "tiff";
  if (bytes.subarray(4, 8).toString("ascii") === "ftyp" && ["avif", "avis"].includes(bytes.subarray(8, 12).toString("ascii"))) return "avif";
  return null;
}

/** Never trust extension/MIME; decode and re-encode pixels, stripping metadata and extra frames. */
export async function normalizeBusinessLogo(dataUrl: string): Promise<{ dataUrl: string; bytes: Buffer; width: number; height: number }> {
  if (dataUrl.length > MAX_LOGO_DATA_URL_LENGTH) throw invalid();
  const match = /^data:image\/(png|jpe?g|webp|gif|avif|tiff);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match || match[2]!.length % 4 !== 0) throw invalid();
  const source = Buffer.from(match[2]!, "base64");
  const actualType = imageType(source);
  const declaredType = match[1] === "jpg" ? "jpeg" : match[1];
  if (!source.length || source.length > MAX_LOGO_BYTES || actualType !== declaredType || source.toString("base64") !== match[2]) throw invalid();
  try {
    const decoder = sharp(source, { limitInputPixels: MAX_LOGO_PIXELS, failOn: "warning", pages: 1 });
    const metadata = await decoder.metadata();
    if (!metadata.width || !metadata.height || metadata.width > MAX_LOGO_SIDE || metadata.height > MAX_LOGO_SIDE || metadata.width * metadata.height > MAX_LOGO_PIXELS) throw invalid();
    const { data, info } = await decoder.rotate().resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
    if (data.length > MAX_LOGO_BYTES) throw invalid();
    return { dataUrl: `data:image/png;base64,${data.toString("base64")}`, bytes: data, width: info.width, height: info.height };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw invalid();
  }
}

export function storedLogoDataUrl(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("dataUrl" in value)) return null;
  const dataUrl = (value as { dataUrl?: unknown }).dataUrl;
  return typeof dataUrl === "string" && dataUrl.length <= MAX_LOGO_DATA_URL_LENGTH && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl) ? dataUrl : null;
}

export async function getBusinessLogoDataUrl(businessId: string): Promise<string | null> {
  const setting = await prisma.setting.findUnique({ where: { scope_key: { scope: `business:${businessId}`, key: BUSINESS_LOGO_KEY } }, select: { value: true } });
  return storedLogoDataUrl(setting?.value);
}

export async function getBusinessLogoBuffer(businessId: string): Promise<Buffer | null> {
  const dataUrl = await getBusinessLogoDataUrl(businessId);
  return dataUrl ? Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64") : null;
}

/** Hide provider-specific footer clauses until the administrator deliberately enables KRA. */
export function documentFooter(value: string | null | undefined, kraEnabled: boolean, fallback: string): string {
  if (!value) return fallback;
  if (kraEnabled) return value;
  return value.split(/\r?\n/).filter(line => !/\bKRA\b|\beTIMS\b/i.test(line)).join("\n").trim() || fallback;
}
