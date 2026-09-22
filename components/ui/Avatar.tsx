import type { Member } from "@/components/space/SpaceProvider";
const colors = ["#FFE2AC", "#DCD6F1", "#CDE4D5", "#FFD1C7", "#CDDEEF"];
export function Avatar({ member, size = "md" }: { member: Pick<Member, "id" | "nickname" | "avatar_color">; size?: "sm" | "md" | "lg" }) {
  const index = Array.from(member.id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length;
  return <span className={`avatar avatar-${size}`} style={{ background: member.avatar_color || colors[index] }} title={member.nickname}>{member.nickname.slice(0, 1)}</span>;
}
