"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { requestJson } from "@/components/space/SpaceProvider";
import styles from "@/components/account/account.module.css";
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [devMailUrl, setDevMailUrl] = useState("");
  const [mailDelivery, setMailDelivery] = useState<
    "preview" | "smtp" | "supabase" | null
  >(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await requestJson<{
        devMailUrl?: string;
        mailDelivery?: "preview" | "smtp" | "supabase";
      }>("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      const delivery =
        result.mailDelivery ?? (result.devMailUrl ? "preview" : "smtp");
      setMailDelivery(delivery);
      setSent(true);
      setDevMailUrl(delivery === "preview" ? (result.devMailUrl ?? "") : "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "暂时无法发送，请稍后重试");
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
        <Link href="/" className="text-button">
          <ArrowLeft size={16} />
          返回登录
        </Link>
      </header>
      <section className={`public-form-card account-card ${styles.root}`}>
        {sent ? (
          <div role="status">
            <span className="form-card-icon">
              <Mail size={25} />
            </span>
            <p className="eyebrow">
              {mailDelivery === "preview"
                ? "LOCAL EMAIL PREVIEW"
                : "CHECK YOUR INBOX"}
            </p>
            <h2>
              {mailDelivery === "preview"
                ? "本地找回邮件预览"
                : "找回请求已处理"}
            </h2>
            <p className="form-card-description">
              {mailDelivery === "preview"
                ? "当前使用本地邮件预览。如果这个邮箱对应一个账号，找回邮件已在本地生成；重置链接没有发送到真实邮箱。"
                : "如果这个邮箱对应一个账号，找回邮件已提交发送，请检查收件箱和垃圾邮件。"}
            </p>
            <Link className="button button-primary full-width" href="/">
              返回登录
            </Link>
            {devMailUrl && (
              <Link
                className="text-button account-back"
                href={devMailUrl}
                target="_blank"
              >
                查看本地邮件预览
              </Link>
            )}
          </div>
        ) : (
          <>
            <span className="form-card-icon">
              <Mail size={25} />
            </span>
            <p className="eyebrow">RESET YOUR PASSWORD</p>
            <h2>忘记密码了？</h2>
            <p className="form-card-description">
              输入注册邮箱，申请重置密码的链接。
            </p>
            <form onSubmit={submit}>
              <label className="field">
                邮箱
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                {busy ? "正在处理…" : "发送找回邮件"}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
