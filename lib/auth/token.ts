import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

const INVITE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function generateToken(bytes = 32): string {
  if (bytes < 16) throw new Error("token must contain at least 128 bits");
  return randomBytes(bytes).toString("base64url");
}

export function digestToken(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function generateInviteCode(): string {
  let result = "";
  for (let i = 0; i < 8; i += 1) result += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  return result;
}

export function digestInviteCode(value: string): string {
  return digestToken(value.toUpperCase());
}

export function tokensEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
