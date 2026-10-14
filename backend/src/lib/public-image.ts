import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request } from "node:https";
import { checkServerIdentity } from "node:tls";

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number) as [number, number];
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) || (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0));
  }
  if (isIP(address) !== 6) return false;
  const normalized = address.toLowerCase();
  const [first, second] = normalized.split(":").slice(0, 2).map(part => Number.parseInt(part || "0", 16)) as [number, number];
  // Only global unicast; exclude mapped IPv4, NAT64, local, multicast and tunnels.
  return first >= 0x2000 && first < 0x3fff && first !== 0x2002 && !(first === 0x2001 && (second < 0x200 || second === 0xdb8));
}

export async function loadPublicLogo(value: unknown): Promise<Buffer | null> {
  if (typeof value !== "string") return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await Promise.race([lookup(hostname, { all: true }), new Promise<never>((_resolve, reject) => controller.signal.addEventListener("abort", () => reject(new Error("Image DNS lookup timed out")), { once: true }))]);
    if (!addresses.length || addresses.some(entry => !isPublicAddress(entry.address)) || controller.signal.aborted) return null;
    const pinned = addresses[0]!;
    return await new Promise<Buffer | null>((resolve) => {
      const req = request({ hostname: pinned.address, family: pinned.family, port: 443, servername: hostname, path: url.pathname + url.search, method: "GET", agent: false, signal: controller.signal, rejectUnauthorized: true, checkServerIdentity: (_host, cert) => checkServerIdentity(hostname, cert), headers: { host: url.host, accept: "image/png, image/jpeg" } }, response => {
        const type = response.headers["content-type"]?.split(";")[0];
        if (response.statusCode !== 200 || !["image/png", "image/jpeg"].includes(type ?? "") || Number(response.headers["content-length"] ?? 0) > 2_000_000) { response.destroy(); resolve(null); return; }
        const chunks: Buffer[] = []; let size = 0;
        response.on("data", (chunk: Buffer) => { size += chunk.length; if (size > 2_000_000) { response.destroy(); req.destroy(); resolve(null); } else chunks.push(chunk); });
        response.on("error", () => resolve(null));
        response.on("end", () => {
          const buffer = Buffer.concat(chunks);
          if (type === "image/png" && (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || buffer.readUInt32BE(16) > 4096 || buffer.readUInt32BE(20) > 4096)) { resolve(null); return; }
          if (type === "image/jpeg" && (buffer.length < 3 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff)) { resolve(null); return; }
          resolve(buffer);
        });
      });
      req.on("error", () => resolve(null));
      req.end();
    });
  } catch { return null; } finally { clearTimeout(timer); }
}
