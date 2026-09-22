import { describe, expect, it, beforeEach, vi } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";
import { draftKey, saveDraft, loadDraft, clearDraft, type Draft } from "@/lib/offline/drafts";

describe("offline check-in drafts", () => {
  beforeEach(async () => {
    await clearDraft("space-a", "member-a", "2026-09-22", "morning");
    await clearDraft("space-a", "member-a", "2026-09-22", "afternoon");
  });

  it("uses a stable space/member/date/slot key and keeps slots isolated", async () => {
    expect(draftKey("space-a", "member-a", "2026-09-22", "morning")).toBe("space-a:member-a:2026-09-22:morning");
    const morning: Draft = { content: "上午写代码", editedAt: "2026-09-22T01:00:00.000Z" };
    const afternoon: Draft = { content: "下午复盘", editedAt: "2026-09-22T08:00:00.000Z" };
    await saveDraft("space-a", "member-a", "2026-09-22", "morning", morning);
    await saveDraft("space-a", "member-a", "2026-09-22", "afternoon", afternoon);
    await expect(loadDraft("space-a", "member-a", "2026-09-22", "morning")).resolves.toEqual(morning);
    await expect(loadDraft("space-a", "member-a", "2026-09-22", "afternoon")).resolves.toEqual(afternoon);
  });

  it("does not mix historical dates", async () => {
    const draft: Draft = { content: "历史补写", editedAt: "2026-09-21T23:30:00.000Z" };
    await saveDraft("space-a", "member-a", "2026-09-21", "morning", draft);
    await expect(loadDraft("space-a", "member-a", "2026-09-22", "morning")).resolves.toBeNull();
  });

  it("conditionally clears only the acknowledged draft", async () => {
    const oldDraft: Draft = { content: "old", editedAt: "2026-09-22T01:00:00.000Z", baseEditedAt: null };
    const newDraft: Draft = { content: "new", editedAt: "2026-09-22T01:00:00.001Z", baseEditedAt: "server-v1" };
    await saveDraft("space-a", "member-a", "2026-09-22", "morning", oldDraft);
    await saveDraft("space-a", "member-a", "2026-09-22", "morning", newDraft);
    await clearDraft("space-a", "member-a", "2026-09-22", "morning", oldDraft.editedAt);
    expect(await loadDraft("space-a", "member-a", "2026-09-22", "morning")).toEqual(newDraft);
    await clearDraft("space-a", "member-a", "2026-09-22", "morning", newDraft.editedAt);
    expect(await loadDraft("space-a", "member-a", "2026-09-22", "morning")).toBeNull();
  });

  it("persists IndexedDB writes and conditionally deletes within one transaction", async () => {
    vi.stubGlobal("indexedDB", fakeIndexedDB);
    try {
      const older: Draft = { content: "older", editedAt: "2026-09-23T00:00:00.000Z", baseEditedAt: null };
      const newer: Draft = { content: "newer", editedAt: "2026-09-23T00:00:00.001Z", baseEditedAt: "remote-1" };
      await saveDraft("space-idb", "member-a", "2026-09-23", "morning", older);
      await saveDraft("space-idb", "member-a", "2026-09-23", "morning", newer);
      await clearDraft("space-idb", "member-a", "2026-09-23", "morning", older.editedAt);
      expect(await loadDraft("space-idb", "member-a", "2026-09-23", "morning")).toEqual(newer);
      await clearDraft("space-idb", "member-a", "2026-09-23", "morning", newer.editedAt);
      expect(await loadDraft("space-idb", "member-a", "2026-09-23", "morning")).toBeNull();
    } finally { vi.unstubAllGlobals(); }
  });
});
