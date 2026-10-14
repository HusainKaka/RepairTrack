import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const backendDirectory = fileURLToPath(new URL("../", import.meta.url));
const productionProjectId = "prj_fC9wywwLIA8TdCICpBQdUeA4IIx2";
const buildOnlyDatabaseUrl = "postgresql://build:build@127.0.0.1:5432/build_only";

/** Preview builds never get permission to migrate, even if database credentials exist. */
export function releaseConfiguration(environment) {
  const production = environment.VERCEL_ENV === "production";
  if (production) {
    if (environment.VERCEL !== "1" || environment.VERCEL_PROJECT_ID !== productionProjectId || environment.VERCEL_GIT_COMMIT_REF !== "main") {
      throw new Error("Production migration refused: verified Vercel API project and main branch are required.");
    }
    if (!environment.DATABASE_URL) throw new Error("Production migration refused: DATABASE_URL is not configured.");
    let database;
    try { database = new URL(environment.DATABASE_URL); } catch { throw new Error("Production migration refused: invalid database configuration."); }
    if (!["postgres:", "postgresql:"].includes(database.protocol)) throw new Error("Production migration refused: PostgreSQL is required.");
  }
  return { production, buildEnvironment: { ...environment, DATABASE_URL: environment.DATABASE_URL ?? buildOnlyDatabaseUrl } };
}

/** Only a safe Prisma error code is logged; never echo connection strings or provider output. */
export function safePrismaError(output) {
  return typeof output === "string" ? output.match(/\bP\d{4}\b/)?.[0] ?? null : null;
}

export function runRelease(environment = process.env, execute = spawnSync, log = console.log) {
  const { production, buildEnvironment } = releaseConfiguration(environment);
  const prismaCli = require.resolve("prisma/build/index.js");
  const typescriptCli = require.resolve("typescript/bin/tsc");
  const step = (label, script, args, timeout = 300_000) => {
    log(`[release] ${label}`);
    const result = execute(process.execPath, [script, ...args], { cwd: backendDirectory, env: buildEnvironment, encoding: "utf8", stdio: "pipe", maxBuffer: 2 * 1024 * 1024, timeout });
    if (result.error || result.status !== 0) {
      const code = safePrismaError(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
      const detail = code ? ` (${code})` : "";
      if (code === "P3005") throw new Error("Migration stopped (P3005): existing database has no Prisma baseline. Verify migration history manually; automatic baselining is prohibited.");
      throw new Error(`${label} failed${detail}. Deployment was stopped; inspect configuration and reproduce the check locally without exposing secrets.`);
    }
  };

  if (production) {
    // Prisma deploy applies only unapplied migrations under its advisory lock.
    // Never use migrate dev, reset, db push, or automatic migrate resolve here.
    step("Apply reviewed additive database migrations", prismaCli, ["migrate", "deploy", "--schema", "prisma/schema.prisma"]);
  } else {
    log("[release] Non-production build: migrations are disabled. A separate staging database is required for runtime testing.");
  }
  step("Generate Prisma client", prismaCli, ["generate", "--schema", "prisma/schema.prisma"]);
  step("Compile backend", typescriptCli, ["-p", "tsconfig.build.json"]);
  log("[release] Backend build completed.");
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { runRelease(); } catch (error) {
    console.error(error instanceof Error ? error.message : "Release failed.");
    process.exitCode = 1;
  }
}
