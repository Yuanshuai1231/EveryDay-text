"use client";

import { useRef, useState } from "react";
import { LogOut, Trash2 } from "lucide-react";
import { requestJson } from "./SpaceProvider";
import styles from "./SpaceMembershipActions.module.css";

export default function SpaceMembershipActions({
  space,
  onComplete,
}: {
  space: { id: string; name: string; role: "creator" | "member" };
  onComplete: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const deleting = space.role === "creator";
  const label = deleting ? "删除空间" : "退出空间";
  async function act() {
    if (pending.current) return;
    const confirmed = window.confirm(
      deleting
        ? `确定删除“${space.name}”吗？所有成员的任务、打卡和聊天记录将永久删除，无法恢复。`
        : `确定退出“${space.name}”吗？退出后将无法查看或编辑这个空间；已有记录会保留，账号和其他空间不受影响。`,
    );
    if (!confirmed) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await requestJson(`/api/spaces/${space.id}${deleting ? "" : "/leave"}`, {
        method: deleting ? "DELETE" : "POST",
      });
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败，请稍后重试");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className={styles.root}>
      <button
        type="button"
        className={styles.action}
        disabled={busy}
        aria-label={`${label} ${space.name}`}
        onClick={() => void act()}
      >
        {deleting ? <Trash2 size={15} /> : <LogOut size={15} />}
        {busy ? "正在处理…" : label}
      </button>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
