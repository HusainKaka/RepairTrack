import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";

export const createOpaqueToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");

export const hashToken = (token: string): string => createHash("sha256").update(token, "utf8").digest("hex");

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

