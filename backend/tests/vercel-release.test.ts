import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
// The release entry point is JavaScript so Node can run it before TypeScript builds.
// @ts-expect-error External build script has no declaration; its behavior is validated here.
import { releaseConfiguration, runRelease, safePrismaError } from "../scripts/vercel-release.mjs";

const require = createRequire(import.meta.url);
const production = {
  VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_ID: "prj_fC9wywwLIA8TdCICpBQdUeA4IIx2", VERCEL_GIT_COMMIT_REF: "main",
  DATABASE_URL: "postgresql://user:private-password@example.test/database",
};

describe("Vercel release migration boundary", () => {
  it("rejects production migration without the exact project and main branch identity", () => {
    for (const changed of [{ VERCEL_PROJECT_ID: "other-project" }, { VERCEL_GIT_COMMIT_REF: "feature" }, { VERCEL: "0" }, { DATABASE_URL: "" }]) {
      expect(() => releaseConfiguration({ ...production, ...changed })).toThrow();
    }
    const execute = vi.fn();
    expect(() => runRelease({ ...production, VERCEL_PROJECT_ID: undefined }, execute)).toThrow();
    expect(execute).not.toHaveBeenCalled();
  });
  it("never runs a migration from a preview even if production credentials were accidentally available", () => {
    const execute = vi.fn().mockReturnValue({ status: 0, stdout: "", stderr: "" });
    runRelease({ ...production, VERCEL_ENV: "preview" }, execute, vi.fn());
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0]![1]).toEqual([require.resolve("prisma/build/index.js"), "generate", "--schema", "prisma/schema.prisma"]);
  });
  it("applies migrations before generation/build only on the verified production target", () => {
    const execute = vi.fn().mockReturnValue({ status: 0, stdout: "", stderr: "" });
    runRelease(production, execute, vi.fn());
    expect(execute.mock.calls[0]![1]).toEqual([require.resolve("prisma/build/index.js"), "migrate", "deploy", "--schema", "prisma/schema.prisma"]);
    expect(execute).toHaveBeenCalledTimes(3);
  });
  it("halts when migration history is missing without attempting to baseline or compile", () => {
    const execute = vi.fn().mockReturnValue({ status: 1, stdout: production.DATABASE_URL, stderr: "Error: P3005 database has no baseline" });
    const log = vi.fn();
    expect(() => runRelease(production, execute, log)).toThrow(/P3005/);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-password");
  });
  it("never includes provider output or database secrets in release error messages", () => {
    const execute = vi.fn().mockReturnValue({ status: 1, stdout: "", stderr: `P1001 could not connect ${production.DATABASE_URL}` });
    expect(() => runRelease(production, execute, vi.fn())).toThrow(/P1001/);
    try { runRelease(production, execute, vi.fn()); } catch (error) { expect(String(error)).not.toContain("private-password"); }
    expect(safePrismaError("P1001 private value")).toBe("P1001");
    expect(safePrismaError("private value")).toBeNull();
  });
  it("uses a non-secret build-only placeholder when previews have no database URL", () => {
    const configuration = releaseConfiguration({ VERCEL_ENV: "preview" });
    expect(configuration.production).toBe(false);
    expect(configuration.buildEnvironment.DATABASE_URL).toMatch(/127\.0\.0\.1/);
  });
});
