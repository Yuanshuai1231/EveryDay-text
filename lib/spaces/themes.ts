export const SPACE_THEME_OPTIONS = [
  {
    id: "growth-purple",
    label: "成长紫",
    className: "theme-growth-purple",
    from: "#59416e",
    to: "#795f87",
    accent: "#f4bd4e",
  },
  {
    id: "morning-cream",
    label: "晨光米黄",
    className: "theme-morning-cream",
    from: "#b47b4f",
    to: "#e6b767",
    accent: "#fff0b7",
  },
  {
    id: "mint-blue",
    label: "薄荷蓝",
    className: "theme-mint-blue",
    from: "#397a85",
    to: "#6bb5ad",
    accent: "#f7df83",
  },
  {
    id: "sunset-coral",
    label: "晚霞珊瑚",
    className: "theme-sunset-coral",
    from: "#9b5361",
    to: "#e58a69",
    accent: "#ffe0a5",
  },
] as const;

export type SpaceThemeId = (typeof SPACE_THEME_OPTIONS)[number]["id"];
export const DEFAULT_SPACE_THEME_ID: SpaceThemeId = "growth-purple";

export function isSpaceThemeId(value: unknown): value is SpaceThemeId {
  return typeof value === "string" && SPACE_THEME_OPTIONS.some((option) => option.id === value);
}

export function resolveSpaceTheme(value: unknown): (typeof SPACE_THEME_OPTIONS)[number] {
  return SPACE_THEME_OPTIONS.find((option) => option.id === value) ?? SPACE_THEME_OPTIONS[0];
}
