import { stdin as input, stdout as output } from "node:process";
import { AccountStatus, RoleCode } from "../generated/prisma/index.js";
import { hashPassword, passwordPolicy } from "../lib/crypto.js";
import { prisma } from "../lib/prisma.js";

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const email = arg("email")?.toLowerCase();
const fullName = arg("name");
if (!email || !fullName || !email.includes("@")) throw new Error("Usage: setup:admin -- --email owner@example.com --name \"Platform Owner\"");

const existing = await prisma.setupLock.findUnique({ where: { id: "primary" } });
if (existing) throw new Error("Initial setup has already completed. No changes were made.");
if (!input.isTTY || !input.setRawMode) throw new Error("Run the setup command in an interactive terminal so the password is not exposed in shell history.");

const password = await new Promise<string>((resolve, reject) => {
  let value = "";
  output.write("Enter a strong password: ");
  input.setRawMode(true);
  input.setEncoding("utf8");
  input.resume();
  const finish = (): void => {
    input.setRawMode(false);
    input.pause();
    input.removeListener("data", onData);
    output.write("\n");
    resolve(value);
  };
  const onData = (key: string): void => {
    if (key === "\u0003") {
      input.setRawMode(false);
      input.pause();
      reject(new Error("Setup cancelled."));
    } else if (key === "\r" || key === "\n") finish();
    else if (key === "\u007f" || key === "\b") value = value.slice(0, -1);
    else if (/^[\x20-\x7E]+$/.test(key)) value += key;
  };
  input.on("data", onData);
});
const errors = passwordPolicy(password);
if (errors.length) throw new Error(errors.join(" "));
const passwordHash = await hashPassword(password);

await prisma.$transaction(async (tx) => {
  const lock = await tx.setupLock.findUnique({ where: { id: "primary" } });
  if (lock) throw new Error("Initial setup has already completed.");
  const role = await tx.role.upsert({ where: { code: RoleCode.SUPER_ADMIN }, update: {}, create: { code: RoleCode.SUPER_ADMIN, name: "Super Administrator" } });
  const user = await tx.user.create({ data: { roleId: role.id, email, fullName, passwordHash, status: AccountStatus.ACTIVE, emailVerifiedAt: new Date() } });
  await tx.setupLock.create({ data: { id: "primary", completedAt: new Date(), userId: user.id } });
}, { isolationLevel: "Serializable" });

console.log("Initial super administrator created. The setup lock is now active.");
await prisma.$disconnect();
