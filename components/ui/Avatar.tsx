import type { Member } from "@/components/space/SpaceProvider";
import { resolveAvatar } from "@/lib/avatars/catalog";
import { AnimalPortrait } from "@/components/ui/AnimalPortrait";

export type AvatarMember = Pick<Member, "id" | "nickname" | "avatar_color"> & { avatar_id?: string | null };
export type AvatarSize = "sm" | "md" | "lg";

export function Avatar({ member, size = "md" }: { member: AvatarMember; size?: AvatarSize }) {
  const avatar = resolveAvatar(member.avatar_id, member.id);
  return <span className={`avatar avatar-${size}`} data-avatar-id={avatar.id} role="img" aria-label={`${member.nickname}的${avatar.label}头像`} title={member.nickname} style={{ background: avatar.background, overflow: "hidden", display: "inline-grid", flex: "none" }}><AnimalPortrait animal={avatar.id} /></span>;
}
