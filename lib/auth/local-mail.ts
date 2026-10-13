import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type LocalMail = {
  id: string;
  to: string;
  subject: string;
  text: string;
  url?: string;
  createdAt: string;
};
function mailDir() {
  const dataDir = process.env.CHECKIN_DATA_DIR;
  return dataDir
    ? path.join(path.dirname(dataDir), "mail-outbox")
    : path.join(process.cwd(), ".data", "mail-outbox");
}
export async function writeLocalMail(
  mail: Omit<LocalMail, "id" | "createdAt">,
) {
  const value: LocalMail = {
    ...mail,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  const dir = mailDir();
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(
      dir,
      `${value.createdAt.replace(/[^0-9]/g, "")}-${value.id}.json`,
    ),
    JSON.stringify(value),
    "utf8",
  );
  return value;
}
export async function listLocalMail(): Promise<LocalMail[]> {
  try {
    const files = (await readdir(mailDir()))
      .filter((f) => f.endsWith(".json"))
      .sort();
    const result: LocalMail[] = [];
    for (const file of files) {
      try {
        result.push(
          JSON.parse(await readFile(path.join(mailDir(), file), "utf8")),
        );
      } catch {}
    }
    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}
export function localMailUrl(token: string, type: "signup" | "reset") {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return type === "reset"
    ? `${origin}/reset-password?token=${encodeURIComponent(token)}`
    : `${origin}/auth/confirm?token=${encodeURIComponent(token)}&type=signup`;
}
export function localMailPreviewAllowed(
  host: string,
  production: boolean,
  cloud: boolean,
) {
  if (production || cloud) return false;
  const authority = host.trim().toLowerCase();
  const hostname = authority.startsWith("[")
    ? authority.slice(1, authority.indexOf("]"))
    : authority.split(":")[0];
  if (hostname === "localhost" || hostname === "::1") return true;
  const octets = hostname.split(".");
  return (
    octets.length === 4 &&
    octets.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255) &&
    Number(octets[0]) === 127
  );
}
