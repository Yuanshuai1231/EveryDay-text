"use client";

import { useEffect, useRef, useState } from "react";
import { CloudSun, Sun } from "lucide-react";
import { clearDraft, loadDraft, saveDraft, type DraftSlot } from "@/lib/offline/drafts";
import { CheckinStatus, type SaveState } from "./CheckinStatus";
import { LogSaveQueue, type RemoteLog } from "./log-save-queue";

type Props = {
  spaceId: string;
  memberId: string;
  date: string;
  slot: DraftSlot;
  initialContent?: string;
  editedAt?: string;
};

export function LogEditor({ spaceId, memberId, date, slot, initialContent = "", editedAt }: Props) {
  const [content, setContent] = useState(initialContent);
  const [state, setState] = useState<SaveState>("idle");
  const [remote, setRemote] = useState<RemoteLog | null>(null);
  const [conflicted, setConflicted] = useState(false);
  const userEdited = useRef(false);
  const queue = useRef<LogSaveQueue | null>(null);

  useEffect(() => {
    let active = true;
    const current = new LogSaveQueue({
      baseEditedAt: editedAt ?? null,
      persist: (draft) => saveDraft(spaceId, memberId, date, slot, draft),
      clear: (revision) => clearDraft(spaceId, memberId, date, slot, revision),
      send: async (value) => {
        const response = await fetch(`/api/spaces/${spaceId}/logs`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ date, slot, ...value }),
        });
        if (response.status === 409) {
          const payload = await response.json();
          return { kind: "conflict" as const, remote: payload.remote as RemoteLog | null };
        }
        if (!response.ok) throw new Error("Save failed");
        const payload = await response.json();
        return { kind: "saved" as const, editedAt: payload.log.edited_at as string };
      },
      onState: (next) => { if (active) { setState(next); setConflicted(next === "conflict"); } },
      onConflict: (value) => { if (active) setRemote(value); },
      onRemoteSelected: (value) => { if (active) setContent(value); },
    });
    queue.current = current;
    loadDraft(spaceId, memberId, date, slot).then((draft) => {
      if (!active || !draft || userEdited.current) return;
      setContent(draft.content);
      void current.restore(draft);
    }).catch(() => { if (active) setState("failed"); });
    const reconnect = () => current.retry();
    window.addEventListener("online", reconnect);
    return () => {
      active = false;
      current.dispose();
      queue.current = null;
      window.removeEventListener("online", reconnect);
    };
  }, [spaceId, memberId, date, slot, editedAt]);

  function edit(value: string) {
    userEdited.current = true;
    setContent(value);
    void queue.current?.edit(value);
  }

  return (
    <div className="log-editor panel flex min-w-0 flex-col gap-3 border border-[#e4dbec] bg-white p-5">
      <label className="flex items-center gap-2 font-semibold" htmlFor={`${date}-${slot}`}>{slot === "morning" ? <Sun aria-hidden="true" className="text-[#e9a92f]" size={20} /> : <CloudSun aria-hidden="true" className="text-[#e78a69]" size={20} />}{slot === "morning" ? "上午记录" : "下午记录"}</label>
      <textarea id={`${date}-${slot}`} className="field min-h-40 w-full resize-y p-3" value={content} onChange={(event) => edit(event.target.value)} placeholder="写下今天做了什么…" rows={5} />
      <CheckinStatus state={state} />
      {state === "failed" && <button type="button" className="button" onClick={() => queue.current?.retry()}>重试保存</button>}
      {conflicted && <div className="conflict-actions" role="group" aria-label="版本冲突">
        <p>本地版本：{content}</p>
        <p>远端版本：{remote?.content ?? "（空）"}</p>
        <button type="button" className="button" onClick={() => void queue.current?.keepRemote()}>保留远端</button>
        <button type="button" className="button" onClick={() => queue.current?.keepLocal()}>保留本地</button>
      </div>}
    </div>
  );
}
