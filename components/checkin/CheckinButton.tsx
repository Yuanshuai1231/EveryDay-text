"use client";

import { useState } from "react";

export function CheckinButton({ spaceId, date, initialCheckedAt }: { spaceId: string; date: string; initialCheckedAt?: string }) {
  const [checkedAt, setCheckedAt] = useState(initialCheckedAt);
  const [error, setError] = useState("");
  async function complete(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const response = await fetch(`/api/spaces/${spaceId}/checkins`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ date }) });
      if (!response.ok) throw new Error("保存失败");
      const result = await response.json();
      setCheckedAt(result.checkin.checked_in_at);
      setError("");
    } catch { setError("打卡失败，请重试"); }
  }
  return <form action={`/api/spaces/${spaceId}/checkins`} method="post" onSubmit={complete} className="mt-6 flex flex-wrap items-center gap-3"><button type="submit" className="button button-primary">{checkedAt ? "更新完成时间" : "完成今日打卡 ✓"}</button><p role="status" className="muted">{error || (checkedAt ? `已完成 · ${new Date(checkedAt).toLocaleString("zh-CN")}` : "")}</p></form>;
}
