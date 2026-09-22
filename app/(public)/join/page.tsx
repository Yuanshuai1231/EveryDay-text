"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Heart, KeyRound, Users } from "lucide-react";
import { BrandMark, Mascot } from "@/components/ui/Mascot";
import { requestJson } from "@/components/space/SpaceProvider";

export default function JoinPage() {
  const router = useRouter(); const [inviteCode, setInviteCode] = useState(""); const [nickname, setNickname] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (busy) return; setBusy(true); setError(""); try { const result = await requestJson<{ spaceId: string }>("/api/spaces/join", { method: "POST", body: JSON.stringify({ inviteCode, nickname: nickname.trim() }) }); router.push(`/${result.spaceId}`); } catch (e) { setError(e instanceof Error ? e.message : "加入失败，请检查网络后重试"); setBusy(false); } }
  return <main className="public-page join-page"><header className="public-header"><Link href="/" className="brand"><BrandMark /><span>叮咚小组<small>DINGDONG CLUB</small></span></Link><Link href="/" className="text-button"><ArrowLeft size={16} />返回首页</Link></header><div className="join-main"><section className="join-story"><span className="intro-label"><span /> 你的小伙伴，正在等你</span><h1>叮咚，<br />来和大家见面吧。</h1><p>输入那串属于你们的暗号，<br />一起收集平凡日子里的小小闪光。</p><Mascot /></section><section className="public-form-card"><span className="form-card-icon lavender"><Users size={27} /></span><p className="eyebrow">BETTER TOGETHER</p><h2>加入打卡空间</h2><p className="form-card-description">有朋友在的地方，坚持会变得更容易。</p><form onSubmit={submit}><label className="field">小组邀请码<input className="invite-input" required value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase().replace(/\s/g, ""))} placeholder="8 位专属暗号" maxLength={8} minLength={8} pattern="[A-Z0-9]{8}" autoComplete="off" spellCheck={false} /><span className="field-hint"><KeyRound size={12} /> 向空间创建者获取 8 位邀请码</span></label><label className="field">你在小组里的昵称<input required value={nickname} onChange={e => setNickname(e.target.value)} placeholder="让朋友一眼认出你" maxLength={24} autoComplete="nickname" /></label>{error && <p role="alert" className="form-error">{error}</p>}<button type="submit" disabled={busy || inviteCode.length !== 8 || !nickname.trim()} className="button button-primary full-width">{busy ? "正在加入小伙伴…" : "我来啦，加入空间"}<ArrowRight size={17} /></button></form><div className="form-divider"><span />还没有属于你们的空间？<span /></div><Link href="/" className="button button-secondary full-width">创建一个新空间</Link></section></div><footer className="public-footer">每一份小小的坚持，都值得被看见。<Heart size={13} /></footer></main>;
}
