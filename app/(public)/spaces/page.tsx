"use client";

import {
  FormEvent,
  Suspense,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import {
  ArrowRight,
  Copy,
  LogOut,
  Plus,
  Settings2,
  Users,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { requestJson } from "@/components/space/SpaceProvider";
import { SPACE_AVATAR_OPTIONS, type SpaceAvatarId } from "@/lib/spaces/catalog";
import { SpaceAvatar, SpaceObjectPortrait } from "@/components/ui/SpaceAvatar";
import SpaceMembershipActions from "@/components/space/SpaceMembershipActions";
import styles from "./spaces.module.css";

type User = {
  id: string;
  email: string;
  nickname: string;
  avatar_id?: string | null;
};
type Space = {
  id: string;
  name: string;
  avatar_id?: string | null;
  timezone: string;
  memberId: string;
  role: "creator" | "member";
  memberCount: number;
};
type Modal = "create" | "join" | null;

function SpacesDashboard() {
  const router = useRouter();
  const params = useSearchParams();
  const modalPanel = useRef<HTMLElement>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [legacy, setLegacy] = useState<{
    id: string;
    name: string;
    nickname: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [joinNickname, setJoinNickname] = useState("");
  const [avatarId, setAvatarId] = useState<SpaceAvatarId>("book");
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState("");
  const [createdSpaceId, setCreatedSpaceId] = useState("");
  const [copied, setCopied] = useState(false);
  function openModal(next: Modal) {
    setError("");
    if (next === "create") {
      setInvite("");
      setCreatedSpaceId("");
      setName("");
      setAvatarId("book");
    }
    setModal(next);
  }
  async function closeModal() {
    if (busy) return;
    setModal(null);
    if (createdSpaceId) await load();
  }
  async function load() {
    try {
      const result = await requestJson<{ spaces: Space[]; user: User }>(
        "/api/spaces",
      );
      const session = await requestJson<{ legacySpace?: typeof legacy }>(
        "/api/session",
      );
      setSpaces(result.spaces ?? []);
      setUser(result.user);
      setLegacy(session.legacySpace ?? null);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 401) router.replace("/");
      else setError(e instanceof Error ? e.message : "暂时无法加载空间");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    if (params.get("create") === "1") setModal("create");
    else if (params.get("join") === "1") setModal("join");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    return () => previous?.focus();
  }, [modal]);
  useEffect(() => {
    if (!modal) return;
    const panel = modalPanel.current;
    const focusTarget =
      panel?.querySelector<HTMLElement>(
        invite ? ".invite-result button" : "input",
      ) ?? panel?.querySelector<HTMLButtonElement>("button");
    focusTarget?.focus();
  }, [modal, loading, invite]);
  function modalKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      void closeModal();
      return;
    }
    if (event.key !== "Tab") return;
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        "button:not(:disabled),input:not(:disabled)",
      ),
    );
    const first = items[0];
    const last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  async function selectSpace(spaceId: string) {
    try {
      await requestJson(`/api/spaces/${spaceId}/select`, {
        method: "POST",
        body: "{}",
      });
      router.push(`/${spaceId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "暂时无法进入这个空间");
    }
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await requestJson<{
        spaceId: string;
        memberId: string;
        inviteCode?: string;
      }>("/api/spaces", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          avatarId,
          timezone: "Asia/Shanghai",
        }),
      });
      setCreatedSpaceId(result.spaceId);
      setSpaces((current) => [
        ...current.filter((space) => space.id !== result.spaceId),
        {
          id: result.spaceId,
          name: name.trim(),
          avatar_id: avatarId,
          timezone: "Asia/Shanghai",
          memberId: result.memberId,
          role: "creator",
          memberCount: 1,
        },
      ]);
      if (result.inviteCode) {
        setInvite(result.inviteCode);
        setCopied(false);
      } else await selectSpace(result.spaceId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  }
  async function join(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await requestJson<{ spaceId: string }>(
        "/api/spaces/join",
        {
          method: "POST",
          body: JSON.stringify({
            inviteCode: inviteCode.trim().toUpperCase(),
            ...(joinNickname.trim() ? { nickname: joinNickname.trim() } : {}),
          }),
        },
      );
      await selectSpace(result.spaceId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加入失败，请检查邀请码");
    } finally {
      setBusy(false);
    }
  }
  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
    } catch {
      setError("暂时无法自动复制，请选中邀请码复制。");
    }
  }
  async function logout() {
    try {
      await requestJson("/api/auth/logout", { method: "POST", body: "{}" });
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "暂时无法退出，请重试。");
    }
  }
  async function claim() {
    setBusy(true);
    try {
      await requestJson("/api/auth/claim-legacy", {
        method: "POST",
        body: "{}",
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "绑定失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <main className={`public-page spaces-page ${styles.root}`}>
        <div className="loading-space">
          <h2>正在打开你的空间…</h2>
        </div>
      </main>
    );
  return (
    <main className={`public-page spaces-page ${styles.root}`}>
      <header className="public-header">
        <Link href="/" className="brand">
          <span className="brand-wordmark">
            叮咚小组<small>DINGDONG CLUB</small>
          </span>
        </Link>
        <div className="spaces-account">
          <span>{user?.nickname}</span>
          <button
            type="button"
            className="icon-button"
            aria-label="退出账号"
            onClick={() => void logout()}
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>
      <section className="spaces-content">
        <div className="spaces-heading">
          <div>
            <p className="eyebrow">MY LITTLE SPACES</p>
            <h1>我的空间</h1>
            <p>选择一个小组，继续今天的好心情。</p>
          </div>
          <div className="button-row">
            <button
              className="button button-secondary"
              type="button"
              onClick={() => openModal("join")}
            >
              <Users size={16} />
              加入空间
            </button>
            <button
              className="button button-primary"
              type="button"
              onClick={() => openModal("create")}
            >
              <Plus size={17} />
              创建空间
            </button>
          </div>
        </div>
        {error && !modal && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {legacy && (
          <div className="legacy-banner" role="status">
            <div>
              <strong>发现一个旧空间：{legacy.name}</strong>
              <p>确认绑定后，它会回到你的空间列表，保留原有记录。</p>
            </div>
            <button
              className="button button-secondary"
              type="button"
              disabled={busy}
              onClick={() => void claim()}
            >
              绑定已有空间
            </button>
          </div>
        )}
        {spaces.length ? (
          <div className="spaces-grid">
            {spaces.map((space) => (
              <article className="space-card" key={space.id}>
                <div className="space-card-head">
                  <SpaceAvatar space={space} size="lg" />
                  <span className="space-role">
                    {space.role === "creator" ? "创建者" : "成员"}
                  </span>
                </div>
                <h2>{space.name}</h2>
                <p>
                  <Users size={14} />
                  {space.memberCount} 位伙伴
                </p>
                <div className="space-card-actions">
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => void selectSpace(space.id)}
                  >
                    进入空间 <ArrowRight size={16} />
                  </button>
                  <Link
                    className="icon-button"
                    href={`/${space.id}/settings`}
                    aria-label={`${space.name}设置`}
                  >
                    <Settings2 size={17} />
                  </Link>
                </div>
                <SpaceMembershipActions
                  space={space}
                  onComplete={() => {
                    setSpaces((current) =>
                      current.filter((item) => item.id !== space.id),
                    );
                  }}
                />
              </article>
            ))}
          </div>
        ) : (
          <div className="spaces-empty">
            <span className="space-empty-icon">
              <Plus size={25} />
            </span>
            <h2>还没有空间</h2>
            <p>创建一个属于你们的小组，或输入邀请码加入朋友的空间。</p>
            <div className="button-row">
              <button
                className="button button-primary"
                type="button"
                onClick={() => openModal("create")}
              >
                创建第一个空间
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => openModal("join")}
              >
                输入邀请码加入
              </button>
            </div>
          </div>
        )}
      </section>
      {modal && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) void closeModal();
          }}
        >
          <section
            ref={modalPanel}
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="spaces-modal-title"
            onKeyDown={modalKeyDown}
          >
            <button
              className="icon-button modal-close"
              type="button"
              aria-label="关闭"
              disabled={busy}
              onClick={() => void closeModal()}
            >
              <X size={18} />
            </button>
            {modal === "create" ? (
              <>
                <h2 id="spaces-modal-title">创建一个新空间</h2>
                <p>给你们的日常取一个喜欢的名字。</p>
                {invite ? (
                  <div className="invite-result" role="status">
                    <strong>空间已创建</strong>
                    <span>邀请码：{invite}</span>
                    <button
                      className="button button-primary full-width"
                      type="button"
                      onClick={() =>
                        createdSpaceId && void selectSpace(createdSpaceId)
                      }
                    >
                      走，进入空间 <ArrowRight size={16} />
                    </button>
                    <button
                      className="button button-secondary full-width"
                      type="button"
                      onClick={() => void copyInvite()}
                    >
                      <Copy size={16} />
                      {copied ? "邀请码已复制" : "复制邀请码"}
                    </button>
                    <p className="invite-hint">
                      邀请码只在这里显示一次，记得保存后再进入。
                    </p>
                    {error && (
                      <p role="alert" className="form-error">
                        {error}
                      </p>
                    )}
                  </div>
                ) : (
                  <form onSubmit={create}>
                    <label className="field">
                      空间名称
                      <input
                        aria-label="空间名称"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={48}
                        placeholder="例如：晨光小组"
                      />
                    </label>
                    <fieldset className="avatar-grid">
                      <legend>选择空间头像</legend>
                      {SPACE_AVATAR_OPTIONS.map((option) => (
                        <label key={option.id} className="avatar-option">
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
                    {error && (
                      <p role="alert" className="form-error">
                        {error}
                      </p>
                    )}
                    <button
                      className="button button-primary full-width"
                      type="submit"
                      disabled={busy || !name.trim()}
                    >
                      {busy ? "正在创建…" : "创建空间"}
                    </button>
                  </form>
                )}
              </>
            ) : (
              <>
                <h2 id="spaces-modal-title">加入朋友的空间</h2>
                <p>输入创建者分享给你的 8 位邀请码。</p>
                <form onSubmit={join}>
                  <label className="field">
                    邀请码
                    <input
                      aria-label="邀请码"
                      required
                      minLength={8}
                      maxLength={8}
                      value={inviteCode}
                      onChange={(e) =>
                        setInviteCode(
                          e.target.value.toUpperCase().replace(/\s/g, ""),
                        )
                      }
                    />
                  </label>
                  <label className="field">
                    加入后的昵称 <span className="optional">可选</span>
                    <input
                      value={joinNickname}
                      onChange={(e) => setJoinNickname(e.target.value)}
                      placeholder={user?.nickname}
                    />
                  </label>
                  {error && (
                    <p role="alert" className="form-error">
                      {error}
                    </p>
                  )}
                  <button
                    className="button button-primary full-width"
                    type="submit"
                    disabled={busy || inviteCode.length !== 8}
                  >
                    {busy ? "正在加入…" : "加入并进入"}
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

export default function SpacesPage() {
  return (
    <Suspense
      fallback={
        <main className="public-page">
          <div className="loading-space">
            <h2>正在打开你的空间…</h2>
          </div>
        </main>
      }
    >
      <SpacesDashboard />
    </Suspense>
  );
}
