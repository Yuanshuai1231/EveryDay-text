import { beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import * as catalog from "@/lib/spaces/catalog";
import { AVATAR_OPTIONS as ANIMALS } from "@/lib/avatars/catalog";
import type { ComponentType } from "react";

const ids = ["book", "coffee", "camera", "rocket", "lamp", "headphones", "backpack", "compass", "trophy", "plant", "palette", "tent"];
type SpaceCatalog = {
  SPACE_AVATAR_OPTIONS: readonly { id: string; label: string; background: string }[];
  isGroupAvatarId: (value: unknown) => boolean;
  resolveSpaceAvatar: (avatarId: string | null | undefined, spaceId: string) => { id: string };
};
const objects = catalog as unknown as SpaceCatalog;
let SpaceAvatar: ComponentType<{ space: { id: string; name: string; avatar_id?: string | null } }> | undefined;

beforeAll(async () => {
  const filename = path.resolve("components/ui/SpaceAvatar.tsx");
  if (existsSync(filename)) SpaceAvatar = (await import(filename)).SpaceAvatar;
});

describe("space object avatars", () => {
  it("has twelve labelled objects in a catalog separate from member animals", () => {
    expect(objects.SPACE_AVATAR_OPTIONS).toBeDefined();
    expect(objects.SPACE_AVATAR_OPTIONS.map(option => option.id)).toEqual(ids);
    expect(new Set(objects.SPACE_AVATAR_OPTIONS.map(option => option.label)).size).toBe(12);
    for (const option of objects.SPACE_AVATAR_OPTIONS) {
      expect(option.background).toMatch(/^#[0-9a-f]{6}$/i);
      expect(ANIMALS.some(animal => animal.id === option.id)).toBe(false);
    }
  });

  it("accepts objects and rejects animal identifiers in space writes", () => {
    for (const id of ids) expect(objects.isGroupAvatarId(id)).toBe(true);
    for (const value of [...ANIMALS.map(option => option.id), "Book", " book ", "toString", null, {}, 1]) {
      expect(objects.isGroupAvatarId(value)).toBe(false);
    }
  });

  it("maps legacy animals predictably and gives unsaved spaces a stable object", () => {
    expect(objects.resolveSpaceAvatar).toBeDefined();
    ANIMALS.forEach((animal, index) => expect(objects.resolveSpaceAvatar(animal.id, "s1").id).toBe(ids[index]));
    expect(objects.resolveSpaceAvatar("rocket", "s1").id).toBe("rocket");
    expect(objects.resolveSpaceAvatar(null, "s1")).toBe(objects.resolveSpaceAvatar("unknown", "s1"));
  });

  it("renders a labelled object portrait for legacy space data", () => {
    expect(SpaceAvatar).toBeDefined();
    const Avatar = SpaceAvatar!;
    const { container } = render(<Avatar space={{ id: "s1", name: "晨光组", avatar_id: "cat" }} />);
    expect(container.querySelector("[data-space-avatar-id='book']")).not.toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector("[role='img']")?.getAttribute("aria-label")).toBe("晨光组的书本空间图标");
  });
});
