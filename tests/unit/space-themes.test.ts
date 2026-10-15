import { describe, expect, it } from "vitest";
import { SPACE_THEME_OPTIONS, isSpaceThemeId } from "@/lib/spaces/themes";

describe("space theme catalog", () => {
  it("exposes the four supported shared themes", () => {
    expect(SPACE_THEME_OPTIONS.map((option) => option.id)).toEqual([
      "growth-purple",
      "morning-cream",
      "mint-blue",
      "sunset-coral",
    ]);
  });

  it("accepts only catalog IDs", () => {
    expect(isSpaceThemeId("growth-purple")).toBe(true);
    expect(isSpaceThemeId("url(javascript:alert(1))")).toBe(false);
    expect(isSpaceThemeId(null)).toBe(false);
  });
});
