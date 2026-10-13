export const AVATAR_OPTIONS = [
  { id: "cat", label: "小猫", background: "#FFE8B7" },
  { id: "rabbit", label: "小兔", background: "#FCE4EC" },
  { id: "dog", label: "小狗", background: "#F7E6D3" },
  { id: "fox", label: "狐狸", background: "#FFE0CE" },
  { id: "bear", label: "小熊", background: "#EADDD0" },
  { id: "panda", label: "熊猫", background: "#E4E9DF" },
  { id: "koala", label: "考拉", background: "#E2EAF0" },
  { id: "frog", label: "青蛙", background: "#DDF0D4" },
  { id: "pig", label: "小猪", background: "#F9DDE2" },
  { id: "penguin", label: "企鹅", background: "#DFF0F8" },
  { id: "lion", label: "狮子", background: "#FFE7B5" },
  { id: "raccoon", label: "浣熊", background: "#E4E1EC" },
] as const;

export type AvatarId = (typeof AVATAR_OPTIONS)[number]["id"];

export function isAvatarId(value: unknown): value is AvatarId {
  return typeof value === "string" && AVATAR_OPTIONS.some((option) => option.id === value);
}

export function resolveAvatar(avatarId: string | null | undefined, memberId: string): (typeof AVATAR_OPTIONS)[number] {
  const saved = AVATAR_OPTIONS.find((option) => option.id === avatarId);
  if (saved) return saved;
  let hash = 2166136261;
  for (const character of memberId) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619) >>> 0;
  return AVATAR_OPTIONS[hash % AVATAR_OPTIONS.length];
}
