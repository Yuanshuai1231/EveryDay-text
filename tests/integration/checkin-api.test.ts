import { describe, expect, it, vi } from "vitest";
import { isValidWorkDate, isValidSlot, localDateInTimeZone, nextEditedAt, selectedWorkDate } from "@/lib/data/checkins";
import { PUT as putLog } from "@/app/api/spaces/[spaceId]/logs/route";
import { PUT as putCheckin } from "@/app/api/spaces/[spaceId]/checkins/route";

vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock("@/lib/auth/session", () => ({ getCurrentSession: async () => ({ member_id: "member-a", space_id: "space-a" }) }));
const context = { params: Promise.resolve({ spaceId: "space-a" }) };
function request(body: unknown, origin?: string) {
  return new Request("https://checkin.example/api/spaces/space-a/logs", { method: "PUT", headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify(body) }) as never;
}

describe("check-in API contracts", () => {
  it("accepts only ISO calendar dates and the two supported slots", () => {
    expect(isValidWorkDate("2026-09-22")).toBe(true);
    expect(isValidWorkDate("2026-02-30")).toBe(false);
    expect(isValidWorkDate("2026/09/22")).toBe(false);
    expect(isValidSlot("morning")).toBe(true);
    expect(isValidSlot("night")).toBe(false);
  });

  it("derives the date from the space IANA timezone", () => {
    const instant = new Date("2026-09-21T16:30:00.000Z");
    expect(localDateInTimeZone(instant, "Asia/Shanghai")).toBe("2026-09-22");
    expect(localDateInTimeZone(instant, "America/Los_Angeles")).toBe("2026-09-21");
  });

  it("selects historical dates without confusing the space's current day", () => {
    const now = new Date("2026-09-21T16:30:00.000Z");
    expect(selectedWorkDate(undefined, "Asia/Shanghai", now)).toBe("2026-09-22");
    expect(selectedWorkDate("2026-09-19", "Asia/Shanghai", now)).toBe("2026-09-19");
    expect(selectedWorkDate("2026-02-30", "Asia/Shanghai", now)).toBeNull();
  });

  it("advances a log version even for rapid edits in one millisecond", () => {
    const instant = new Date("2026-09-22T01:00:00.000Z");
    expect(nextEditedAt("2026-09-22T01:00:00.000Z", instant)).toBe("2026-09-22T01:00:00.001Z");
  });

  it.each([null, [], ["2026-09-22"]])("rejects non-object JSON bodies without throwing: %j", async (body) => {
    expect((await putLog(request(body), context)).status).toBe(400);
    expect((await putCheckin(request(body), context)).status).toBe(400);
  });

  it("rejects cross-origin log and check-in writes", async () => {
    const body = { date: "2026-09-22", slot: "morning", content: "hello", editedAt: null };
    expect((await putLog(request(body, "https://other.example"), context)).status).toBe(403);
    expect((await putCheckin(request(body, "https://other.example"), context)).status).toBe(403);
  });
});
