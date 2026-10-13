"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  CalendarCheck2,
  ChevronDown,
  LayoutDashboard,
  ListTodo,
  LogOut,
  MessageCircle,
  Plus,
  Settings2,
  Sprout,
  Users,
  WifiOff,
} from "lucide-react";
import { SpaceProvider, useSpace } from "@/components/space/SpaceProvider";
import { BrandMark, Mascot } from "@/components/ui/Mascot";
import { AvatarPicker } from "@/components/avatars/AvatarPicker";
import { SpaceAvatar } from "@/components/ui/SpaceAvatar";
import { requestJson } from "@/components/space/SpaceProvider";
import { useRouter } from "next/navigation";
import styles from "./SpaceShell.module.css";

const navigation = [
  { path: "", label: "空间概览", short: "概览", icon: LayoutDashboard },
  { path: "/checkin", label: "每日打卡", short: "打卡", icon: CalendarCheck2 },
  { path: "/tasks", label: "小组任务", short: "任务", icon: ListTodo },
  { path: "/chat", label: "聊天小屋", short: "聊天", icon: MessageCircle },
  { path: "/members", label: "小组伙伴", short: "伙伴", icon: Users },
];
function Shell({ children }: { children: React.ReactNode }) {
  const { spaceId, data, loading, error, connection, reload } = useSpace();
  const router = useRouter();
  const pathname = usePathname();
  const [accountMenu, setAccountMenu] = React.useState(false);
  const [accountError, setAccountError] = React.useState("");
  const [accountBusy, setAccountBusy] = React.useState(false);
  const [hasAccount, setHasAccount] = React.useState(false);
  const [legacy, setLegacy] = React.useState<{
    id: string;
    name: string;
    nickname: string;
  } | null>(null);
  React.useEffect(() => {
    void requestJson<{ user?: unknown; legacySpace?: typeof legacy }>(
      "/api/session",
    )
      .then((session) => {
        setLegacy(session.legacySpace ?? null);
        setHasAccount(!!session.user);
      })
      .catch(() => {});
  }, []);
  async function logout() {
    try {
      await requestJson("/api/auth/logout", { method: "POST", body: "{}" });
      router.replace("/");
    } catch (e) {
      setAccountError(
        e instanceof Error ? e.message : "暂时无法退出，请重试。",
      );
    }
  }
  async function claimLegacy() {
    if (accountBusy) return;
    setAccountBusy(true);
    setAccountError("");
    try {
      await requestJson("/api/auth/claim-legacy", {
        method: "POST",
        body: "{}",
      });
      setLegacy(null);
      setAccountMenu(false);
      router.push("/spaces");
    } catch (e) {
      setAccountError(
        e instanceof Error ? e.message : "暂时无法绑定，请重试。",
      );
    } finally {
      setAccountBusy(false);
    }
  }
  const isChat = pathname.endsWith("/chat");
  return (
    <div className={`${styles.root} app-shell ${isChat ? "is-chat" : ""}`}>
      <aside className="sidebar">
        <Link href={`/${spaceId}`} className="brand">
          <BrandMark />
          <span>
            叮咚小组<small>DINGDONG CLUB</small>
          </span>
        </Link>
        <Link href="/spaces" className="space-switch">
          {data ? <SpaceAvatar space={data.space} size="sm" /> : <span className="space-icon"><Sprout size={21} /></span>}
          <span className="space-switch-copy">
            <strong>{data?.space.name || "我们的打卡空间"}</strong>
            <small>
              {data
                ? `${data.members.length} 位伙伴，一起成长`
                : "正在加载空间…"}
            </small>
          </span>
          <ChevronDown size={16} />
        </Link>
        <p className="nav-caption">我的小组</p>
        <nav className="desktop-nav" aria-label="空间导航">
          {navigation.map(({ path, label, icon: Icon }) => (
            <Link
              key={path}
              href={`/${spaceId}${path}`}
              title={label}
              className={pathname === `/${spaceId}${path}` ? "active" : ""}
            >
              <Icon size={20} />
              <span>{label}</span>
              {path === "/tasks" && !!data?.stats.totalTasks && (
                <b>{data.stats.totalTasks - data.stats.completedTasks}</b>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Mascot variant="cat" />
            <strong>一点点，也很了不起。</strong>
            <p>每天来见面，让坚持有回响。</p>
            <Link href={`/${spaceId}/checkin`}>
              记录我的今天 <ArrowUpRight size={15} />
            </Link>
          </div>
          <Link className="sidebar-help" href="/spaces?create=1">
            <Plus size={17} />
            <span>创建新的空间</span>
          </Link>
          {data && (
            <Link className="sidebar-help" href={`/${spaceId}/settings`}>
              <Settings2 size={17} />
              <span>空间设置</span>
            </Link>
          )}
          {legacy &&
            (hasAccount ? (
              <button
                className="legacy-shell"
                type="button"
                disabled={accountBusy}
                onClick={() => void claimLegacy()}
              >
                绑定旧空间：{legacy.name}
              </button>
            ) : (
              <Link className="legacy-shell" href="/">
                登录账号，绑定已有空间
              </Link>
            ))}
          {data ? (
            <AvatarPicker
              member={data.member}
              spaceId={spaceId}
              onSaved={reload}
              variant="profile"
            />
          ) : (
            <div className="sidebar-profile">
              <span>
                <strong>你好，小伙伴</strong>
                <small>正在打开空间…</small>
              </span>
            </div>
          )}
        </div>
      </aside>
      <div className="app-content">
        <header className="topbar">
          <Link href="/spaces" className="mobile-brand">
            <BrandMark />
            <strong>叮咚小组</strong>
          </Link>
          <div className="breadcrumb">
            <Link href="/spaces">我的空间</Link> <span>/</span>{" "}
            <strong>{data?.space.name || "每日打卡"}</strong>
          </div>
          <div className="topbar-right">
            <span
              className={`connection-status ${connection === "connected" ? "" : "pending"}`}
            >
              {connection === "connected" ? (
                <>
                  <i />
                  已连接
                </>
              ) : (
                <>
                  <WifiOff size={13} />
                  {connection === "connecting" ? "连接中" : "重连中"}
                </>
              )}
            </span>
            {data && (
              <AvatarPicker
                member={data.member}
                spaceId={spaceId}
                onSaved={reload}
                size="sm"
              />
            )}
            <button
              type="button"
              className="icon-button account-menu-trigger"
              aria-label="账号菜单"
              aria-expanded={accountMenu}
              onClick={() => setAccountMenu((value) => !value)}
            >
              <Users size={17} />
            </button>
            {accountMenu && (
              <div
                className="account-menu"
                role="menu"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setAccountMenu(false);
                    document
                      .querySelector<HTMLButtonElement>(".account-menu-trigger")
                      ?.focus();
                  }
                }}
              >
                <Link
                  role="menuitem"
                  href="/spaces"
                  onClick={() => setAccountMenu(false)}
                >
                  我的空间
                </Link>
                <Link
                  role="menuitem"
                  href={`/${spaceId}/settings`}
                  onClick={() => setAccountMenu(false)}
                >
                  空间设置
                </Link>
                <Link
                  role="menuitem"
                  href="/spaces?create=1"
                  onClick={() => setAccountMenu(false)}
                >
                  创建新的空间
                </Link>
                {legacy &&
                  (hasAccount ? (
                    <button
                      role="menuitem"
                      type="button"
                      disabled={accountBusy}
                      onClick={() => void claimLegacy()}
                    >
                      {accountBusy ? "正在绑定…" : `绑定旧空间：${legacy.name}`}
                    </button>
                  ) : (
                    <Link
                      role="menuitem"
                      href="/"
                      onClick={() => setAccountMenu(false)}
                    >
                      登录账号，绑定已有空间
                    </Link>
                  ))}
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => void logout()}
                >
                  <LogOut size={15} />
                  退出账号
                </button>
              </div>
            )}
          </div>
        </header>
        <main className={`workspace ${isChat ? "chat-workspace" : ""}`}>
          {accountError && (
            <p role="alert" className="form-error">
              {accountError}
            </p>
          )}
          {loading && !data ? (
            <div className="loading-space">
              <Mascot />
              <h2>正在打开小组空间…</h2>
              <p>美好的一天，从这里开始。</p>
              <span className="loading-dots">
                <i />
                <i />
                <i />
              </span>
            </div>
          ) : !data ? (
            <div className="empty-state access-error">
              <Mascot variant="bunny" />
              <h2>暂时无法进入这个空间</h2>
              <p>{error || "请使用邀请码加入后继续。"}</p>
              <div className="button-row">
                <button
                  className="button button-secondary"
                  onClick={() => void reload()}
                >
                  重新加载
                </button>
                <Link href="/join" className="button button-primary">
                  加入空间
                </Link>
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div role="alert" className="connection-banner">
                  <WifiOff size={16} />
                  {error}
                  <button onClick={() => void reload()}>重试</button>
                </div>
              )}
              {children}
            </>
          )}
        </main>
      </div>
      <nav className="bottom-nav" aria-label="移动空间导航">
        {navigation.map(({ path, short, icon: Icon }) => (
          <Link
            key={path}
            href={`/${spaceId}${path}`}
            className={pathname === `/${spaceId}${path}` ? "active" : ""}
          >
            <Icon size={21} />
            <span>{short}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
export function SpaceShell({
  spaceId,
  children,
}: {
  spaceId: string;
  children: React.ReactNode;
}) {
  return (
    <SpaceProvider spaceId={spaceId}>
      <Shell>{children}</Shell>
    </SpaceProvider>
  );
}
