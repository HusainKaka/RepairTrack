import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import { env } from "../config/env.js";

export const createOpaqueToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");

export const hashToken = (token: string): string => createHash("sha256").update(token, "utf8").digest("hex");

const tokenKey = (): Buffer => createHash("sha256").update(`repairtrack-public-token:${env.JWT_SECRET}`, "utf8").digest();

export function encryptPublicToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptPublicToken(value: string): string {
  const [ivValue, tagValue, ciphertextValue] = value.split(".");
  if (!ivValue || !tagValue || !ciphertextValue) throw new Error("Invalid encrypted tracking token");
  const decipher = createDecipheriv("aes-256-gcm", tokenKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64url")), decipher.final()]).toString("utf8");
}

export const hashPassword = async (password: string): Promise<string> => argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1
});

export const verifyPassword = async (hash: string, password: string): Promise<boolean> => {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
};

export const passwordPolicy = (password: string): string[] => {
  const errors: string[] = [];
  if (password.length < 12) errors.push("Password must contain at least 12 characters.");
  if (!/[a-z]/.test(password)) errors.push("Password must contain a lowercase letter.");
  if (!/[A-Z]/.test(password)) errors.push("Password must contain an uppercase letter.");
  if (!/\d/.test(password)) errors.push("Password must contain a number.");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("Password must contain a symbol.");
  if (password.length > 128) errors.push("Password must not exceed 128 characters.");
  return errors;
};
