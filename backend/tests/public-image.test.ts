import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn(), checkServerIdentity: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:https", () => ({ request: mocks.request }));
vi.mock("node:tls", () => ({ checkServerIdentity: mocks.checkServerIdentity }));
import { loadPublicLogo } from "../src/lib/public-image.js";

function png(width = 64, height = 64): Buffer {
  const value = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(value);
  value.writeUInt32BE(width, 16);
  value.writeUInt32BE(height, 20);
  return value;
}

function serve(body: Buffer, type = "image/png", status = 200, length?: number): void {
  mocks.request.mockImplementation((_options, callback) => {
    const response = Object.assign(new PassThrough(), { statusCode: status, headers: { "content-type": type, ...(length === undefined ? {} : { "content-length": String(length) }) } });
    const req = Object.assign(new EventEmitter(), { destroy: vi.fn(), end: () => { callback(response); if (!response.destroyed) response.end(body); } });
    return req;
  });
}

describe("public logo transport", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  });

  it("connects to the validated IP once, preserving SNI, Host and certificate verification", async () => {
    serve(png());
    expect(await loadPublicLogo("https://logos.example.test/logo.png?v=2")).toEqual(png());
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
    expect(mocks.lookup).toHaveBeenCalledWith("logos.example.test", { all: true });
    const options = mocks.request.mock.calls[0]![0];
    expect(options).toMatchObject({ hostname: "8.8.8.8", family: 4, servername: "logos.example.test", port: 443, path: "/logo.png?v=2", rejectUnauthorized: true, agent: false, headers: { host: "logos.example.test" } });
    const cert = {};
    options.checkServerIdentity("8.8.8.8", cert);
    expect(mocks.checkServerIdentity).toHaveBeenCalledWith("logos.example.test", cert);
  });

  it("rejects mixed public/private DNS answers before connecting", async () => {
    mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.1", family: 4 }]);
    expect(await loadPublicLogo("https://logos.example.test/logo.png")).toBeNull();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("never follows a redirect", async () => {
    serve(png(), "image/png", 302);
    expect(await loadPublicLogo("https://logos.example.test/logo.png")).toBeNull();
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it("bounds declared and streamed response sizes", async () => {
    serve(png(), "image/png", 200, 2_000_001);
    expect(await loadPublicLogo("https://logos.example.test/logo.png")).toBeNull();
    serve(Buffer.alloc(2_000_001));
    expect(await loadPublicLogo("https://logos.example.test/logo.png")).toBeNull();
  });

  it("rejects unsupported types, malformed images and oversized dimensions", async () => {
    for (const [body, type] of [[png(), "text/html"], [Buffer.from("not a png"), "image/png"], [png(4097), "image/png"], [Buffer.from("not a jpeg"), "image/jpeg"]] as const) {
      serve(body, type);
      expect(await loadPublicLogo("https://logos.example.test/logo.png")).toBeNull();
    }
  });

  it("fails closed on DNS and transport errors", async () => {
    mocks.lookup.mockRejectedValue(new Error("DNS failure"));
    expect(await loadPublicLogo("https://logos.example.test/logo.png")).toBeNull();
    mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    mocks.request.mockImplementation(() => {
      const req = new EventEmitter();
      return Object.assign(req, { end: () => req.emit("error", new Error("TLS failure")) });
    });
    expect(await loadPublicLogo("https://logos.example.test/logo.png")).toBeNull();
  });

  it("times out a stalled DNS lookup without connecting", async () => {
    vi.useFakeTimers();
    try {
      mocks.lookup.mockReturnValue(new Promise(() => {}));
      const pending = loadPublicLogo("https://logos.example.test/logo.png");
      await vi.advanceTimersByTimeAsync(8_001);
      expect(await pending).toBeNull();
      expect(mocks.request).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
});
