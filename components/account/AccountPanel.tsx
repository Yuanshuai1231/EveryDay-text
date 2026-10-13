"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, KeyRound, MailCheck, Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { requestJson } from "@/components/space/SpaceProvider";
import styles from "./account.module.css";

type Mode = "login" | "register";
type MailDelivery = "preview" | "smtp" | "supabase";
type MailResult = { mailDelivery?: MailDelivery; devMailUrl?: string };
type AuthResult = MailResult & {
  requiresVerification?: boolean;
  verificationMethod?: "code";
  expiresIn?: number;
  resendAfter?: number;
  retryAfter?: number;
  user?: Session["user"];
  error?: { code?: string; message?: string };
};

function getMailDelivery(result: MailResult): MailDelivery {
  return result.mailDelivery ?? (result.devMailUrl ? "preview" : "smtp");
}

type Session = {
  user: {
    id: string;
    email: string;
    nickname: string;
    avatar_id?: string | null;
  } | null;
  spaceId?: string | null;
  legacySpace?: { id: string; name: string; nickname: string } | null;
};

export function AccountPanel() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verification, setVerification] = useState<{
    email: string;
    devMailUrl?: string;
    mailDelivery: MailDelivery | null;
    submitted: boolean;
    expiresIn: number;
  } | null>(null);
  const [code, setCode] = useState("");
  const [resent, setResent] = useState(false);
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const resendSeconds = Math.max(
    0,
    Math.ceil((resendAvailableAt - now) / 1000),
  );
  const spacesUrl = params.get("join") === "1" ? "/spaces?join=1" : "/spaces";

  useEffect(() => {
    if (!resendAvailableAt) return;
    const timer = window.setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);
      if (currentTime >= resendAvailableAt) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [resendAvailableAt]);

  function startResendCountdown(seconds: number) {
    const currentTime = Date.now();
    setNow(currentTime);
    setResendAvailableAt(currentTime + Math.max(0, seconds) * 1000);
  }

  function returnToLogin(message = "") {
    setVerification(null);
    setMode("login");
    setCode("");
    setPassword("");
    setConfirmPassword("");
    setResent(false);
    setResendAvailableAt(0);
    setError(message);
  }

  useEffect(() => {
    void requestJson<Session>("/api/session")
      .then((session) => {
        if (session.user) router.replace(spacesUrl);
      })
      .catch(() => {});
    const authError = params.get("authError");
    if (authError)
      setError(
        authError === "expired"
          ? "验证链接已过期，请重新申请。"
          : "验证链接无效，请重试。 ",
      );
    // The page query is the initial entry intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setResent(false);
    if (mode === "register" && password !== confirmPassword) {
      setError("两次输入的密码不一致");
      setBusy(false);
      return;
    }
    try {
      const endpoint =
        mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "login"
            ? { email: email.trim(), password }
            : { email: email.trim(), password, nickname: nickname.trim() },
        ),
      });
      const result = (await response.json()) as AuthResult;
      if (result.error?.code === "ACCOUNT_EXISTS") {
        returnToLogin("此邮箱已注册并验证，请直接登录");
        return;
      }
      if (
        result.requiresVerification &&
        (response.ok ||
          (mode === "login" && result.error?.code === "UNVERIFIED"))
      ) {
        const mailDelivery =
          mode === "register" ? getMailDelivery(result) : null;
        setVerification({
          email: email.trim(),
          devMailUrl:
            mailDelivery === "preview" ? result.devMailUrl : undefined,
          mailDelivery,
          submitted: mode === "register",
          expiresIn: result.expiresIn ?? 600,
        });
        setCode("");
        startResendCountdown(
          mode === "register" ? (result.resendAfter ?? 60) : 0,
        );
      } else if (response.ok && mode === "login") router.push(spacesUrl);
      else if (response.ok)
        throw new Error("注册尚未完成邮箱验证，请重新申请验证码。");
      else
        throw new Error(
          result.error?.code === "UNAUTHORIZED"
            ? "邮箱或密码不正确，请重试。"
            : (result.error?.message ?? "暂时无法登录，请稍后重试。"),
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "暂时无法完成，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!verification || busy || Date.now() < resendAvailableAt) return;
    setBusy(true);
    setError("");
    setResent(false);
    try {
      const response = await fetch("/api/auth/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: verification.email }),
      });
      const result = (await response.json()) as AuthResult;
      if (result.error?.code === "ACCOUNT_EXISTS") {
        returnToLogin("此邮箱已注册并验证，请直接登录");
        return;
      }
      if (!response.ok) {
        if (response.status === 429) {
          const retryAfter =
            result.retryAfter ?? Number(response.headers?.get("Retry-After"));
          if (Number.isFinite(retryAfter) && retryAfter > 0)
            startResendCountdown(Math.ceil(retryAfter));
        }
        throw new Error(result.error?.message ?? "暂时无法重发，请稍后重试");
      }
      const mailDelivery = getMailDelivery(result);
      setVerification((value) =>
        value
          ? {
              ...value,
              submitted: true,
              mailDelivery,
              expiresIn: result.expiresIn ?? 600,
              devMailUrl:
                mailDelivery === "preview" ? result.devMailUrl : undefined,
            }
          : value,
      );
      setCode("");
      setResent(true);
      startResendCountdown(result.resendAfter ?? 60);
    } catch (e) {
      setError(e instanceof Error ? e.message : "暂时无法重发，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!verification || busy || !/^[0-9]{6}$/.test(code)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: verification.email, code }),
      });
      const result = (await response.json()) as AuthResult;
      if (!response.ok || !result.user)
        throw new Error(
          result.error?.message ?? "暂时无法完成邮箱验证，请稍后重试。",
        );
      router.push(spacesUrl);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "暂时无法完成邮箱验证，请稍后重试。",
      );
    } finally {
      setBusy(false);
    }
  }

  if (verification) {
    const preview = verification.mailDelivery === "preview";
    return (
      <section
        className={`public-form-card account-card ${styles.root}`}
        aria-label="验证邮箱"
        role="status"
      >
        <span className="form-card-icon">
          <MailCheck size={27} />
        </span>
        <p className="eyebrow">
          {preview
            ? "LOCAL EMAIL PREVIEW"
            : verification.submitted
              ? "CHECK YOUR INBOX"
              : "VERIFY YOUR EMAIL"}
        </p>
        <h2>
          {preview
            ? "验证码已生成"
            : verification.submitted
              ? "输入邮箱验证码"
              : "先验证邮箱"}
        </h2>
        <p className="form-card-description">
          {preview
            ? "当前使用本地邮件预览，验证码没有发送到真实邮箱。"
            : verification.submitted
              ? "验证码邮件已提交发送，请检查收件箱和垃圾邮件。"
              : "这个账号需要先完成邮箱验证。请输入已有验证码，或申请发送新的验证码。"}
        </p>
        <p className="form-card-description">
          需要验证的邮箱：<strong>{verification.email}</strong>
        </p>
        <div className="form-friendly-note">
          <Sparkles size={16} />
          <p>
            {resent
              ? preview
                ? "验证码已重新生成，请打开本地预览查看。"
                : "验证码邮件已再次提交发送，请检查收件箱和垃圾邮件。"
              : "在下方输入 6 位数字验证码，完成验证后进入你的空间。"}
          </p>
        </div>
        <form onSubmit={verifyCode}>
          <label className="field">
            验证码
            <input
              className={styles.verificationCode}
              aria-label="验证码"
              aria-describedby="verification-code-validity"
              required
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]{6}"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="6 位数字验证码"
              disabled={busy}
            />
          </label>
          <p id="verification-code-validity" className={styles.codeValidity}>
            验证码 {Math.ceil(verification.expiresIn / 60)}{" "}
            分钟内有效，请及时输入。
          </p>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="button button-primary full-width"
            disabled={busy || !/^[0-9]{6}$/.test(code)}
          >
            {busy ? "请稍候…" : "验证并进入空间"}
          </button>
        </form>
        {preview && verification.devMailUrl && (
          <Link
            className="text-button"
            href={verification.devMailUrl}
            target="_blank"
          >
            查看本地邮件预览
          </Link>
        )}
        <button
          type="button"
          className="button button-secondary full-width account-resend"
          onClick={() => void resend()}
          disabled={busy || resendSeconds > 0}
        >
          {resendSeconds > 0
            ? `${resendSeconds} 秒后可重新发送验证码`
            : !verification.submitted
              ? "发送验证码"
              : preview
                ? "重新生成验证码"
                : "重新发送验证码"}
        </button>
        <button
          type="button"
          className="text-button account-back"
          onClick={() => returnToLogin()}
          disabled={busy}
        >
          返回登录
        </button>
      </section>
    );
  }

  return (
    <section
      className={`public-form-card account-card ${styles.root}`}
      aria-label="账号登录注册"
    >
      <div className="account-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "login"}
          className={mode === "login" ? "active" : ""}
          onClick={() => {
            setMode("login");
            setError("");
          }}
        >
          登录
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "register"}
          className={mode === "register" ? "active" : ""}
          onClick={() => {
            setMode("register");
            setError("");
          }}
        >
          注册
        </button>
      </div>
      <span className="form-card-icon">
        <KeyRound size={27} />
      </span>
      <p className="eyebrow">A LITTLE SPACE FOR US</p>
      <h2>{mode === "login" ? "欢迎回来" : "创建你的账号"}</h2>
      <p className="form-card-description">
        {mode === "login"
          ? "登录后继续和小伙伴一起坚持。"
          : "用邮箱注册，找回你的每一份坚持。"}
      </p>
      <form onSubmit={submit}>
        {mode === "register" && (
          <label className="field">
            昵称
            <input
              aria-label="昵称"
              required
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={24}
              autoComplete="nickname"
              placeholder="朋友认识你的方式"
            />
          </label>
        )}
        <label className="field">
          邮箱
          <input
            aria-label="邮箱"
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
          />
        </label>
        <label className="field">
          密码
          <div className="password-field">
            <input
              aria-label="密码"
              required
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              placeholder="至少 8 位字符"
            />
            <button
              type="button"
              className="icon-button"
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </label>
        {mode === "register" && (
          <label className="field">
            确认密码
            <input
              aria-label="确认密码"
              required
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              autoComplete="new-password"
              placeholder="再输入一次密码"
            />
          </label>
        )}
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
          {busy ? "请稍候…" : mode === "login" ? "登录并进入空间" : "创建账号"}
        </button>
      </form>
      {mode === "login" && (
        <Link className="account-forgot" href="/forgot-password">
          忘记密码？
        </Link>
      )}
      <p className="privacy-note">邮箱只用于登录和找回账号。</p>
    </section>
  );
}
