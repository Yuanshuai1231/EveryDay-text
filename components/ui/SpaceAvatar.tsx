import { Backpack, BookOpen, Camera, Coffee, Compass, Headphones, Lightbulb, Palette, Rocket, Sprout, Tent, Trophy } from "lucide-react";
import { resolveSpaceAvatar, SPACE_AVATAR_OPTIONS, type SpaceAvatarId } from "@/lib/spaces/catalog";
import styles from "./SpaceAvatar.module.css";

const objectIcons = { book: BookOpen, coffee: Coffee, camera: Camera, rocket: Rocket, lamp: Lightbulb, headphones: Headphones, backpack: Backpack, compass: Compass, trophy: Trophy, plant: Sprout, palette: Palette, tent: Tent };

export function SpaceObjectPortrait({ object }: { object: SpaceAvatarId }) {
  const option = SPACE_AVATAR_OPTIONS.find(option => option.id === object)!;
  const Icon = objectIcons[object];
  return <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true" focusable="false" className={styles.portrait}>
    <rect x="9" y="9" width="46" height="46" rx="14" fill="white" fillOpacity=".48" transform="rotate(-8 32 32)" />
    <circle cx="49" cy="16" r="3" fill={option.color} opacity=".22" />
    <path d="M12 48h5m-2.5-2.5v5" stroke={option.color} strokeWidth="1.8" strokeLinecap="round" opacity=".35" />
    {object === "plant" && <><path d="m22 39 2 14q8 5 16 0l2-14" fill="white" fillOpacity=".74" stroke={option.color} strokeWidth="2" strokeLinejoin="round"/><path d="M21 39h22" stroke={option.color} strokeWidth="2.4" strokeLinecap="round"/><Icon x="20" y="11" width="24" height="29" color={option.color} strokeWidth={1.85} /></>}
    {object !== "plant" && <Icon x="17" y="17" width="30" height="30" color={option.color} strokeWidth={1.85} />}
  </svg>;
}

export function SpaceAvatar({ space, size = "md", className = "" }: {
  space: { id: string; name: string; avatar_id?: string | null };
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const avatar = resolveSpaceAvatar(space.avatar_id, space.id);
  return <span className={`${styles.avatar} ${styles[size]} ${className}`} style={{ background: avatar.background }} role="img" aria-label={`${space.name}的${avatar.label}空间图标`} data-space-avatar-id={avatar.id}>
    <SpaceObjectPortrait object={avatar.id} />
  </span>;
}
