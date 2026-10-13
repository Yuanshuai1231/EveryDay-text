"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { localDateInTimeZone } from "@/lib/data/checkins";

export type Member = { id: string; nickname: string; role?: "creator" | "member"; avatar_color?: string; avatar_id?: string | null; joined_at?: string; removed_at?: string | null };
export type Task = { id: string; creator_id: string; scope?: "personal" | "group"; assignee_id?: string | null; title: string; notes: string; target_date: string | null; completed: boolean; updated_at: string; created_at: string; recurrence?: "once" | "daily"; overdue?: boolean; occurrence_date?: string; completed_on?: string | null; completed_at?: string | null };
export type DailyLog = { id: string; member_id: string; slot: "morning" | "afternoon"; content: string; edited_at?: string; work_date?: string };
export type Activity = { id: string; member_id?: string; memberId?: string; text?: string; time?: string; type?: string; kind?: string; title?: string; body?: string; created_at?: string; timestamp?: string; nickname?: string };
export type SpaceSummary = { space: { id: string; name: string; avatar_id?: string | null; timezone: string }; member: Member; members: Member[]; date: string; checkins: { member_id: string; checked_in_at: string }[]; tasks: Task[]; logs: DailyLog[]; activity: Activity[]; stats: { checkedIn: number; totalMembers: number; completedTasks: number; totalTasks: number; streak: number } };
type SpaceState = { spaceId: string; data: SpaceSummary | null; date: string; setDate: (date: string) => void; loading: boolean; error: string; connection: "connecting" | "connected" | "reconnecting"; reload: () => Promise<void> };
const SpaceContext = createContext<SpaceState | null>(null);

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(body.error?.message ?? "暂时无法完成操作，请稍后重试") as Error & { status: number }; error.status = response.status; throw error; }
  return body as T;
}

export function SpaceProvider({ spaceId, children }: { spaceId: string; children: React.ReactNode }) {
  const router = useRouter();
  const eventSource = useRef<EventSource | null>(null);
  const [data, setData] = useState<SpaceSummary | null>(null);
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState<SpaceState["connection"]>("connecting");
  const requestId = useRef(0);
  const reload = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const result = await requestJson<SpaceSummary>(`/api/spaces/${spaceId}/summary${date ? `?date=${date}` : ""}`);
      if (id !== requestId.current) return;
      setData(result); setError("");
    } catch (e) { if (id === requestId.current) { setError(e instanceof Error ? e.message : "连接失败，请检查网络"); if ((e as { status?: number }).status === 401 || (e as { status?: number }).status === 403) { setData(null); eventSource.current?.close(); router.replace("/join"); } } }
    finally { if (id === requestId.current) setLoading(false); }
  }, [spaceId, date, router]);
  useEffect(() => {
    const requestCounter = requestId;
    void reload();
    const events = new EventSource(`/api/spaces/${spaceId}/events`);
    eventSource.current = events;
    const refresh = () => { void reload(); };
    events.onopen = () => { setConnection("connected"); refresh(); };
    events.onerror = () => { setConnection("reconnecting"); };
    events.addEventListener("update", refresh);
    events.addEventListener("revoked", () => { events.close(); setData(null); router.replace("/join"); });
    const interval = setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => { events.close(); clearInterval(interval); window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); requestCounter.current++; };
  }, [reload, spaceId, router]);
  const selectedDate = date || (data ? localDateInTimeZone(new Date(), data.space.timezone) : "");
  return <SpaceContext.Provider value={{ spaceId, data, date: selectedDate, setDate, loading, error, connection, reload }}>{children}</SpaceContext.Provider>;
}

export function useSpace() { const context = useContext(SpaceContext); if (!context) throw new Error("useSpace requires SpaceProvider"); return context; }
