export type CheckinSlot = "morning" | "afternoon";

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export { hasSameOrigin } from "@/lib/auth/origin";

export function isValidSlot(value: unknown): value is CheckinSlot {
  return value === "morning" || value === "afternoon";
}

export function isValidWorkDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function localDateInTimeZone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function selectedWorkDate(requestedDate: string | undefined, timeZone: string, now = new Date()): string | null {
  const date = requestedDate ?? localDateInTimeZone(now, timeZone);
  return isValidWorkDate(date) ? date : null;
}

export function nextEditedAt(previous: string | null, now = new Date()): string {
  return new Date(Math.max(now.getTime(), previous ? Date.parse(previous) + 1 : 0)).toISOString();
}

export type LogRecord = { id: string; space_id: string; member_id: string; work_date: string; slot: CheckinSlot; content: string; edited_at: string; created_at: string };
export type CheckinRecord = { id: string; space_id: string; member_id: string; work_date: string; checked_in_at: string };

