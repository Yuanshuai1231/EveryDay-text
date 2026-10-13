"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, LoaderCircle, Pencil, X } from "lucide-react";
import { requestJson } from "@/components/space/SpaceProvider";
import { Avatar, type AvatarMember, type AvatarSize } from "@/components/ui/Avatar";
import { AVATAR_OPTIONS, resolveAvatar, type AvatarId } from "@/lib/avatars/catalog";
import styles from "./AvatarPicker.module.css";

type AvatarPickerProps = {
  member: AvatarMember & { role?: "creator" | "member" };
  spaceId: string;
  onSaved: () => void | Promise<void>;
  variant?: "avatar" | "profile" | "card";
  size?: AvatarSize;
};

export function AvatarPicker({ member, spaceId, onSaved, variant = "avatar", size = "md" }: AvatarPickerProps) {
  const current = resolveAvatar(member.avatar_id, member.id);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<AvatarId>(current.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const chosen = resolveAvatar(selected, member.id);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    dialog.querySelector<HTMLButtonElement>('[role="radio"][aria-checked="true"]')?.focus();
    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open]);

  function showPicker() {
    setSelected(current.id);
    setError("");
    setOpen(true);
  }

  function dismiss() { if (!busy) setOpen(false); }

  async function save() {
    if (busy || selected === current.id) return;
    setBusy(true);
    setError("");
    try {
      await requestJson(`/api/spaces/${spaceId}/members/${member.id}`, { method: "PATCH", body: JSON.stringify({ avatarId: selected }) });
      await onSaved();
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "头像暂时没能保存，请再试一次。");
    } finally { setBusy(false); }
  }

  function handleDialogKey(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") { event.preventDefault(); dismiss(); return; }
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"])'));
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  function handleOptionKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!direction && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? AVATAR_OPTIONS.length - 1 : (index + direction + AVATAR_OPTIONS.length) % AVATAR_OPTIONS.length;
    setSelected(AVATAR_OPTIONS[nextIndex].id);
    const options = dialogRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    options?.[nextIndex]?.focus();
  }

  return <>
    <button ref={triggerRef} type="button" className={`${styles.trigger} ${variant === "profile" ? `sidebar-profile ${styles.profileTrigger}` : variant === "card" ? styles.cardTrigger : styles.avatarTrigger}`} aria-label="更换头像" title="更换头像" aria-haspopup="dialog" onClick={showPicker}>
      <span className={styles.triggerPortrait}><Avatar member={member} size={size} />{variant === "card" && <span className={styles.editBadge}><Pencil size={10} /></span>}</span>
      {variant === "profile" && <><span className={styles.profileCopy}><strong>{member.nickname}</strong><small>{member.role === "creator" ? "空间创建者" : "小组成员"}</small></span><Pencil size={14} className={styles.profileEdit} aria-hidden="true" /></>}
      {variant === "card" && <span className={styles.changeLabel}>更换头像</span>}
    </button>
    {open && createPortal(<dialog ref={dialogRef} className={styles.dialog} aria-labelledby={titleId} aria-describedby={descriptionId} onKeyDown={handleDialogKey} onCancel={event => { event.preventDefault(); dismiss(); }}>
      <div className={styles.heading}><div><span className={styles.eyebrow}>MEET YOUR LITTLE FRIEND</span><h2 id={titleId}>挑一个喜欢的小伙伴</h2></div><button className={styles.close} type="button" disabled={busy} aria-label="关闭头像选择" onClick={dismiss}><X size={20} /></button></div>
      <p id={descriptionId} className={styles.description}>换个可爱的头像，让伙伴一眼认出你。</p>
      <div className={styles.preview}><span className={styles.previewPortrait}><Avatar member={{ ...member, avatar_id: selected }} size="lg" /></span><div><strong>{chosen.label}</strong><p>{selected === current.id ? "这是你现在的小伙伴" : "准备好陪你一起打卡啦"}</p><span>{member.nickname}</span></div><span className={styles.previewSpark} aria-hidden="true">✳</span></div>
      <div className={styles.options} role="radiogroup" aria-label="动物头像">
        {AVATAR_OPTIONS.map((option, index) => <button key={option.id} type="button" role="radio" aria-label={option.label} aria-checked={selected === option.id} tabIndex={selected === option.id ? 0 : -1} disabled={busy} className={`${styles.option} ${selected === option.id ? styles.selected : ""}`} onClick={() => setSelected(option.id)} onKeyDown={event => handleOptionKey(event, index)}>
          <span className={styles.optionPortrait}><Avatar member={{ ...member, avatar_id: option.id }} size="lg" /></span><span>{option.label}</span>{selected === option.id && <span className={styles.check}><Check size={10} strokeWidth={3} /></span>}
        </button>)}
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.footer}><span>头像会在整个小组里同步</span><div><button type="button" className="button button-secondary" disabled={busy} onClick={dismiss}>取消</button><button type="button" className="button button-primary" disabled={busy || selected === current.id} onClick={() => void save()}>{busy && <LoaderCircle size={15} className={styles.spinner} />}{busy ? "正在保存…" : "保存头像"}</button></div></div>
    </dialog>, document.body)}
  </>;
}
