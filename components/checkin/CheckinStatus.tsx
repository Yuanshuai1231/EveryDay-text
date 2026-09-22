"use client";

export type SaveState = "idle" | "saving" | "saved" | "failed" | "conflict";

export function CheckinStatus({ state, message }: { state: SaveState; message?: string }) {
  const labels: Record<SaveState, string> = { idle: "", saving: "保存中…", saved: "已保存", failed: "保存失败，稍后重试", conflict: "有新版本，请选择保留内容" };
  return <span aria-live="polite" className={`checkin-status checkin-status-${state}`}>{message ?? labels[state]}</span>;
}
