"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, RotateCcw, Save } from "lucide-react";
import { useSpace } from "@/components/space/SpaceProvider";
import {
  SPACE_AVATAR_OPTIONS,
  resolveSpaceAvatar,
  type SpaceAvatarId,
} from "@/lib/spaces/catalog";
import {
  SPACE_THEME_OPTIONS,
  resolveSpaceTheme,
  type SpaceThemeId,
} from "@/lib/spaces/themes";
import { SpaceObjectPortrait } from "@/components/ui/SpaceAvatar";
import styles from "./SpaceSettings.module.css";
import SpaceMembershipActions from "./SpaceMembershipActions";

export default function SpaceSettings() {
  const router = useRouter();
  const { spaceId, data, reload } = useSpace();
  const space = data?.space;
  const currentAvatar = resolveSpaceAvatar(space?.avatar_id, spaceId).id;
  const currentTheme = resolveSpaceTheme(space?.theme_id).id;
  const canEdit = data?.member.role === "creator";
  const [name, setName] = useState(space?.name ?? "");
  const [avatarId, setAvatarId] = useState<SpaceAvatarId>(currentAvatar);
  const [themeId, setThemeId] = useState<SpaceThemeId>(currentTheme);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setName(space?.name ?? "");
    setAvatarId(currentAvatar);
    setThemeId(currentTheme);
  }, [space?.name, currentAvatar, currentTheme]);
  const dirty =
    !!space && (name.trim() !== space.name || avatarId !== currentAvatar || themeId !== currentTheme);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || !dirty || busy) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch(`/api/spaces/${spaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), avatarId, themeId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.error?.message ?? "无法保存空间设置");
      await reload();
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法保存空间设置");
    } finally {
      setBusy(false);
    }
  }
  function cancel() {
    setName(space?.name ?? "");
    setAvatarId(currentAvatar);
    setThemeId(currentTheme);
    setError("");
    setSaved(false);
  }
  if (!data)
    return (
      <section className="panel">
        <p style={{ padding: 22 }} role="status">
          正在加载空间设置…
        </p>
      </section>
    );
  return (
    <div className={styles.page}>
      <div className="page-heading">
        <div>
          <Link className="text-button" href={`/${spaceId}`}>
            <ArrowLeft size={15} />
            返回空间
          </Link>
          <p className="eyebrow">SPACE SETTINGS</p>
          <h1>空间设置</h1>
          <p>为你们的小组选择合适的名字和头像。</p>
        </div>
      </div>
      <form className={styles.form} onSubmit={submit}>
        <section className={styles.section}>
          <div>
            <h2>基本资料</h2>
            <p>这些信息会显示在空间列表和小组内。</p>
          </div>
          <label className="field">
            空间名称
            <input
              aria-label="空间名称"
              readOnly={!canEdit}
              required
              maxLength={48}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        </section>
        <section className={styles.section}>
          <div>
            <h2>空间头像</h2>
            <p>用一件喜欢的物品，代表你们一起坚持的日常。</p>
          </div>
          <fieldset className={styles.avatarGrid} disabled={!canEdit}>
            <legend className={styles.visuallyHidden}>空间头像</legend>
            {SPACE_AVATAR_OPTIONS.map((option) => (
              <label className={styles.avatarOption} key={option.id}>
                <input
                  type="radio"
                  name="space-avatar"
                  aria-label={option.label}
                  checked={avatarId === option.id}
                  onChange={() => setAvatarId(option.id)}
                />
                <span style={{ background: option.background }}>
                  <SpaceObjectPortrait object={option.id} />
                </span>
                <small>{option.label}</small>
              </label>
            ))}
          </fieldset>
        </section>
        <section className={styles.section}>
          <div>
            <h2>首页主题</h2>
            <p>选择小组首页的背景氛围，成员头像会展示在主视觉中。</p>
          </div>
          <fieldset className={styles.themeGrid} disabled={!canEdit}>
            <legend className={styles.visuallyHidden}>首页主题</legend>
            {SPACE_THEME_OPTIONS.map((option) => (
              <label className={styles.themeOption} key={option.id}>
                <input
                  type="radio"
                  name="space-theme"
                  aria-label={option.label}
                  checked={themeId === option.id}
                  onChange={() => setThemeId(option.id)}
                />
                <span
                  className={styles.themeSwatch}
                  style={{ background: `linear-gradient(135deg, ${option.from}, ${option.to})` }}
                >
                  <b style={{ background: option.accent }} />
                </span>
                <small>{option.label}</small>
              </label>
            ))}
          </fieldset>
        </section>
        <div className={styles.footer}>
          {!canEdit && (
            <p className={styles.readOnly}>只有空间创建者可以修改这些资料。</p>
          )}
          {canEdit && (
            <div className="button-row">
              <button
                className="button button-secondary"
                type="button"
                disabled={!dirty || busy}
                onClick={cancel}
              >
                <RotateCcw size={15} />
                取消更改
              </button>
              <button
                className="button button-primary"
                type="submit"
                disabled={!dirty || busy || !name.trim()}
              >
                {saved ? <Check size={16} /> : <Save size={16} />}
                {busy ? "正在保存…" : saved ? "已保存" : "保存设置"}
              </button>
            </div>
          )}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {saved && !error && (
          <p className={styles.saved} role="status">
            空间资料已更新。
          </p>
        )}
      </form>
      <section className={styles.lifecycle}>
        <h2>{canEdit ? "删除空间" : "退出空间"}</h2>
        <p>
          {canEdit
            ? "删除后，所有成员的任务、打卡和聊天记录都将清除。"
            : "退出后保留已有记录，你仍可使用账号和其他空间。"}
        </p>
        <SpaceMembershipActions
          space={{
            id: spaceId,
            name: data.space.name,
            role: canEdit ? "creator" : "member",
          }}
          onComplete={() => router.replace("/spaces")}
        />
      </section>
    </div>
  );
}
