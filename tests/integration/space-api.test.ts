import { describe, expect, it } from "vitest";
import { createMemberSession, isSessionUsable } from "@/lib/auth/session";

describe("space API auth contracts", () => {
  it("rejects revoked, expired, and removed sessions", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(isSessionUsable({ revoked_at: null, expires_at: "2026-01-01T01:00:00.000Z", member_removed_at: null }, now)).toBe(true);
    expect(isSessionUsable({ revoked_at: "2025-12-31T23:00:00.000Z", expires_at: "2026-01-01T01:00:00.000Z", member_removed_at: null }, now)).toBe(false);
    expect(isSessionUsable({ revoked_at: null, expires_at: "2025-12-31T23:00:00.000Z", member_removed_at: null }, now)).toBe(false);
    expect(isSessionUsable({ revoked_at: null, expires_at: "2026-01-01T01:00:00.000Z", member_removed_at: "2025-12-31T23:00:00.000Z" }, now)).toBe(false);
  });

  it("creates a raw token and stores only its digest", async () => {
    const rows: Record<string, unknown>[] = [];
    const client = { from: () => ({ insert: async (row: Record<string, unknown>) => { rows.push(row); return { error: null }; } }) };
    const result = await createMemberSession(client as never, "member-1", new Date("2026-01-01T00:00:00.000Z"));
    expect(result.token.length).toBeGreaterThanOrEqual(22);
    expect(rows[0]).not.toHaveProperty("token");
    expect(rows[0].token_digest).not.toBe(result.token);
  });
});
