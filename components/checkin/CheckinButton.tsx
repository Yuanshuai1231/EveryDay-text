"use client";

import { useState } from "react";
import styles from "./checkin.module.css";

export function CheckinButton({
  spaceId,
  date,
  initialCheckedAt,
  timeZone = "Asia/Shanghai",
  onSaved,
  onBusyChange,
}: {
  spaceId: string;
  date: string;
  initialCheckedAt?: string;
  timeZone?: string;
  onSaved?: () => void | Promise<void>;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [checkedAt, setCheckedAt] = useState(initialCheckedAt);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function complete(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    onBusyChange?.(true);
    try {
      const response = await fetch(`/api/spaces/${spaceId}/checkins`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date }),
      });
      if (!response.ok) throw new Error("保存失败");
      const result = await response.json();
      setCheckedAt(result.checkin.checked_in_at);
      setError("");
      void Promise.resolve()
        .then(() => onSaved?.())
        .catch(() => {});
    } catch {
      setError("打卡失败，请重试");
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  return (
    <form
      action={`/api/spaces/${spaceId}/checkins`}
      method="post"
      onSubmit={complete}
      className={styles.completionForm}
    >
      <button type="submit" className="button button-primary" disabled={busy}>
        {busy ? "正在打卡…" : checkedAt ? "更新完成时间" : "完成今日打卡 ✓"}
      </button>
      <p role="status">
        {error ||
          (checkedAt
            ? `已完成 · ${new Date(checkedAt).toLocaleString("zh-CN", { timeZone })}`
            : "完成打卡，为这一天留个小标记。")}
      </p>
    </form>
  );
}
