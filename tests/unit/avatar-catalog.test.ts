import { beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";

const avatarIds = ["cat", "rabbit", "dog", "fox", "bear", "panda", "koala", "frog", "pig", "penguin", "lion", "raccoon"];
type Option = { id: string; label: string; background: string };
type Catalog = {
  AVATAR_OPTIONS: readonly Option[];
  isAvatarId: (value: unknown) => boolean;
  resolveAvatar: (avatarId: string | null | undefined, memberId: string) => Option;
};
let catalog: Catalog | undefined;

beforeAll(async () => {
  const filename = path.resolve("lib/avatars/catalog.ts");
  if (existsSync(filename)) catalog = await import(filename);
});

function getCatalog() {
  expect(catalog, "the shared avatar catalog must exist").toBeDefined();
  return catalog!;
}

describe("shared animal avatar catalog", () => {
  it("offers the twelve supported animals with labels and background colors", () => {
    const { AVATAR_OPTIONS } = getCatalog();
    expect(AVATAR_OPTIONS.map((option) => option.id)).toEqual(avatarIds);
    expect(new Set(AVATAR_OPTIONS.map((option) => option.label)).size).toBe(12);
    for (const option of AVATAR_OPTIONS) {
      expect(option.label.trim()).not.toBe("");
      expect(option.background).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("accepts only exact supported identifiers", () => {
    const { isAvatarId } = getCatalog();
    for (const id of avatarIds) expect(isAvatarId(id)).toBe(true);
    for (const value of [null, undefined, {}, [], 1, "", "Cat", " cat ", "unicorn", "toString"]) {
      expect(isAvatarId(value)).toBe(false);
    }
  });

  it("uses a member's saved avatar when it is supported", () => {
    const { resolveAvatar, AVATAR_OPTIONS } = getCatalog();
    for (const option of AVATAR_OPTIONS) expect(resolveAvatar(option.id, "member-a")).toBe(option);
  });

  it("gives legacy members a stable fallback for missing or unknown avatar identifiers", () => {
    const { resolveAvatar, AVATAR_OPTIONS } = getCatalog();
    const fallback = resolveAvatar(null, "member-a");
    expect(AVATAR_OPTIONS).toContain(fallback);
    expect(resolveAvatar(undefined, "member-a")).toBe(fallback);
    expect(resolveAvatar("obsolete-avatar", "member-a")).toBe(fallback);
    expect(resolveAvatar(null, "member-a")).toBe(fallback);
    expect(AVATAR_OPTIONS).toContain(resolveAvatar(null, ""));
    expect(new Set(Array.from({ length: 120 }, (_, index) => resolveAvatar(null, `member-${index}`).id)).size).toBeGreaterThan(8);
  });
});
