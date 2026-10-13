import {
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from "node:crypto";
function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    nodeScrypt(password, salt, keylen, options, (error, derived) =>
      error ? reject(error) : resolve(derived as Buffer),
    ),
  );
}
const N = 16384;
const R = 8;
const P = 1;

function assertPassword(password: string) {
  if (
    typeof password !== "string" ||
    Array.from(password).length < 8 ||
    Array.from(password).length > 128
  ) {
    throw new Error("Password must be 8-128 characters");
  }
}

export async function hashPassword(password: string): Promise<string> {
  assertPassword(password);
  const salt = randomBytes(16);
  const digest = (await scrypt(password, salt, 32, {
    N,
    r: R,
    p: P,
  })) as Buffer;
  return `scrypt$${N}$${salt.toString("hex")}$${digest.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  if (typeof password !== "string" || typeof encoded !== "string") return false;
  const parts = encoded.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt") return false;
  const cost = Number(parts[1]);
  const salt = Buffer.from(parts[2], "hex");
  const expected = Buffer.from(parts[3], "hex");
  if (
    !Number.isInteger(cost) ||
    cost < 1024 ||
    cost > 262144 ||
    (cost & (cost - 1)) !== 0 ||
    !salt.length ||
    expected.length !== 32
  )
    return false;
  try {
    const actual = (await scrypt(password, salt, expected.length, {
      N: cost,
      r: R,
      p: P,
    })) as Buffer;
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}

export function validatePassword(password: unknown): password is string {
  return (
    typeof password === "string" &&
    Array.from(password).length >= 8 &&
    Array.from(password).length <= 128
  );
}
