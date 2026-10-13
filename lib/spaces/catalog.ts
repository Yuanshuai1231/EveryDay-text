export const SPACE_AVATAR_OPTIONS = [
  { id: "book", label: "书本", background: "#EDE6F8", color: "#8361AB" },
  { id: "coffee", label: "咖啡杯", background: "#F9E9D9", color: "#AE7553" },
  { id: "camera", label: "相机", background: "#E5ECF5", color: "#647EA1" },
  { id: "rocket", label: "火箭", background: "#FBE3DF", color: "#CB7B70" },
  { id: "lamp", label: "灯泡", background: "#FFF1CD", color: "#B59236" },
  { id: "headphones", label: "耳机", background: "#E8E5F6", color: "#8276AF" },
  { id: "backpack", label: "背包", background: "#F4E4EB", color: "#B97695" },
  { id: "compass", label: "指南针", background: "#E1F0EE", color: "#58968D" },
  { id: "trophy", label: "奖杯", background: "#FBEACD", color: "#BB9142" },
  { id: "plant", label: "花盆", background: "#E6F0DD", color: "#759658" },
  { id: "palette", label: "调色盘", background: "#F7E5DF", color: "#BA8471" },
  { id: "tent", label: "帐篷", background: "#E1EAF0", color: "#6D8EA1" },
] as const;

export type SpaceAvatarId = (typeof SPACE_AVATAR_OPTIONS)[number]["id"];

export function isGroupAvatarId(value: unknown): value is SpaceAvatarId {
  return typeof value === "string" && SPACE_AVATAR_OPTIONS.some(option => option.id === value);
}

const legacySpaceAvatars: Record<string, SpaceAvatarId> = {
  cat: "book", rabbit: "coffee", dog: "camera", fox: "rocket", bear: "lamp", panda: "headphones",
  koala: "backpack", frog: "compass", pig: "trophy", penguin: "plant", lion: "palette", raccoon: "tent",
};

export function resolveSpaceAvatar(avatarId: string | null | undefined, spaceId: string): (typeof SPACE_AVATAR_OPTIONS)[number] {
  const id = isGroupAvatarId(avatarId) ? avatarId : avatarId && Object.hasOwn(legacySpaceAvatars, avatarId) ? legacySpaceAvatars[avatarId] : null;
  const saved = SPACE_AVATAR_OPTIONS.find(option => option.id === id);
  if (saved) return saved;
  let hash = 2166136261;
  for (const character of spaceId) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619) >>> 0;
  return SPACE_AVATAR_OPTIONS[hash % SPACE_AVATAR_OPTIONS.length];
}
