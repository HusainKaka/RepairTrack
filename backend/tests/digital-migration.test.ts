import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const backendDirectory = fileURLToPath(new URL("../", import.meta.url));
const migration = readFileSync(new URL("../prisma/migrations/20261014150000_digital_services/migration.sql", import.meta.url), "utf8");
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
let generated: string;

beforeAll(() => {
  // Pure schema-to-SQL generation: does not connect to any database.
  const result = spawnSync(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script"], {
    cwd: backendDirectory, env: { ...process.env, DATABASE_URL: "postgresql://build:build@127.0.0.1:5432/build_only" }, encoding: "utf8", timeout: 30_000, maxBuffer: 1024 * 1024,
  });
  expect(result.status).toBe(0);
  generated = result.stdout;
}, 35_000);

describe("digital migration schema consistency", () => {
  it("uses one transaction and contains no destructive DDL or data rewrite", () => {
    expect(migration).toMatch(/\bBEGIN;/);
    expect(migration).toMatch(/\bCOMMIT;\s*$/);
    expect(migration).not.toMatch(/\b(DROP|TRUNCATE|DELETE\s+FROM|UPDATE\s+")\b/i);
    expect(migration).toContain('CHECK ("repairId" IS NULL OR "digitalTicketId" IS NULL)');
  });
  it("matches Prisma-generated definitions for every new digital table and enum", () => {
    for (const table of ["digital_tickets", "digital_status_history", "digital_notes"]) {
      const pattern = new RegExp(`CREATE TABLE "${table}" \\([\\s\\S]*?\\n\\);`);
      expect(normalize(migration.match(pattern)![0])).toBe(normalize(generated.match(pattern)![0]));
    }
    for (const name of ["DigitalServiceKind", "DigitalTicketStatus"]) {
      const pattern = new RegExp(`CREATE TYPE "${name}" AS ENUM \\([^;]*;`);
      expect(normalize(migration.match(pattern)![0])).toBe(normalize(generated.match(pattern)![0]));
    }
  });
  it("matches all added indexes and foreign keys to Prisma's generated SQL", () => {
    const definitions = migration.match(/(?:CREATE (?:UNIQUE )?INDEX [^;]+;|ALTER TABLE [^;]+ FOREIGN KEY [^;]+;)/g) ?? [];
    expect(definitions.length).toBeGreaterThan(15);
    const normalized = normalize(generated);
    for (const definition of definitions) expect(normalized).toContain(normalize(definition));
  });
  it("keeps all new columns optional or false by default for existing records", () => {
    expect(migration).toContain('ALTER TABLE "invoices" ADD COLUMN "digitalTicketId" UUID;');
    expect(migration).toContain('ALTER TABLE "notifications" ADD COLUMN "digitalTicketId" UUID;');
    expect(migration).toContain('ALTER TABLE "notifications" ADD COLUMN "deduplicationKey" TEXT;');
    expect(migration).toContain('ALTER TABLE "customers" ADD COLUMN "whatsappOptIn" BOOLEAN NOT NULL DEFAULT false;');
    expect(migration).toContain('ALTER TABLE "customers" ADD COLUMN "whatsappOptInAt" TIMESTAMP(3);');
  });
});
