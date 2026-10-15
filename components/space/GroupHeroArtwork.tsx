import { Avatar } from "@/components/ui/Avatar";
import { Mascot } from "@/components/ui/Mascot";
import type { Member } from "@/components/space/SpaceProvider";
import styles from "./GroupHeroArtwork.module.css";

export function GroupHeroArtwork({ members }: { members: Member[] }) {
  const active = members.filter((member) => !member.removed_at);
  const visible = active.slice(0, 2);
  const remaining = Math.max(0, active.length - visible.length);
  return (
    <div className={styles.artwork} aria-label="小组成员动物形象">
      {visible.length ? (
        <div className={`${styles.avatars} ${visible.length === 1 ? styles.single : ""}`}>
          {visible.map((member) => <Avatar key={member.id} member={member} size="lg" />)}
          {remaining > 0 && <span className={styles.more}>+{remaining} 位伙伴</span>}
        </div>
      ) : <Mascot className={styles.fallback} />}
    </div>
  );
}
