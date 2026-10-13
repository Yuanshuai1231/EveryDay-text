"use client";
import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { requestJson } from "@/components/space/SpaceProvider";
import styles from "@/components/account/account.module.css";
function ResetPasswordForm() {
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password !== confirm) {
      setError("两次输入的密码不一致");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await requestJson("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          password,
          token: params.get("token") ?? undefined,
        }),
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "链接已失效，请重新申请");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={`public-page account-page ${styles.root}`}>
      <header className="public-header">
        <Link href="/" className="brand">
          <span>
            叮咚小组<small>DINGDONG CLUB</small>
          </span>
        </Link>
        {!saved && (
          <Link href="/" className="text-button">
            <ArrowLeft size={16} />
            返回登录
          </Link>
        )}
      </header>
      <section className={`public-form-card account-card ${styles.root}`}>
        {saved ? (
          <div role="status">
            <span className="form-card-icon">
              <KeyRound size={25} />
            </span>
            <p className="eyebrow">READY TO RETURN</p>
            <h2>密码已更新</h2>
            <p className="form-card-description">
              用新密码登录，继续和伙伴一起坚持。
            </p>
            <Link className="button button-primary full-width" href="/">
              返回登录
            </Link>
          </div>
        ) : (
          <>
            <span className="form-card-icon">
              <KeyRound size={25} />
            </span>
            <p className="eyebrow">CHOOSE A NEW PASSWORD</p>
            <h2>设置新密码</h2>
            <p className="form-card-description">设置一个至少 8 位的新密码。</p>
            <form onSubmit={submit}>
              <label className="field">
                新密码
                <input
                  required
                  minLength={8}
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <label className="field">
                确认新密码
                <input
                  required
                  minLength={8}
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
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
                disabled={busy}
              >
                {busy ? "正在保存…" : "保存新密码"}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="public-page">
          <div className="loading-space">
            <h2>正在打开密码设置…</h2>
          </div>
        </main>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
