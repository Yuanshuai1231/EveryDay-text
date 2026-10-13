"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Check, Copy, Crown, KeyRound, LogOut, MessageCircle, UserPlus, Users, X } from "lucide-react";
import { Member, requestJson, useSpace } from "@/components/space/SpaceProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Mascot } from "@/components/ui/Mascot";
import { AvatarPicker } from "@/components/avatars/AvatarPicker";

export default function MembersPage() {
  const { data, spaceId, reload } = useSpace(); const router = useRouter();
  const [action, setAction] = useState<{ kind: "remove" | "transfer" | "invite"; member?: Member } | null>(null); const [invite, setInvite] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [copied, setCopied] = useState(false);
  if (!data) return null;
  const isCreator = data.member.role === "creator";
  function open(kind: "remove" | "transfer" | "invite", member?: Member) { setAction({ kind, member }); setError(""); }
  async function execute() {
    if (!action || busy || !data) return; setBusy(true); setError("");
    try {
      if (action.kind === "invite") { const result = await requestJson<{ inviteCode: string }>(`/api/spaces/${spaceId}/invite`, { method: "POST" }); setInvite(result.inviteCode); setCopied(false); }
      else if (action.kind === "transfer") await requestJson(`/api/spaces/${spaceId}/transfer`, { method: "POST", body: JSON.stringify({ memberId: action.member?.id }) });
      else { await requestJson(`/api/spaces/${spaceId}/members/${action.member?.id}`, { method: "DELETE" }); if (action.member?.id === data.member.id) { router.push("/"); return; } }
      setAction(null); await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "操作失败，请重试"); } finally { setBusy(false); }
  }
  async function copy() { try { await navigator.clipboard.writeText(invite); setCopied(true); } catch { setError("请手动选中邀请码复制。"); } }
  return <div className="members-page"><div className="page-heading"><div><p className="eyebrow"><Users size={14} /> 在一起，就是最好的动力</p><h1>我们的小伙伴<span className="hello-spark">✳</span></h1><p>{data.space.name} · {data.members.length} 位伙伴，一起把小日子过好。</p></div>{isCreator && <button className="button button-primary" onClick={() => open("invite")}><UserPlus size={17} />邀请小伙伴</button>}</div><section className="members-banner"><div><span className="mini-pill">BETTER TOGETHER</span><h2>每一个你，<br />都让这里更温暖。</h2><p>互相陪伴，互相鼓励，在自己的节奏里成长。</p></div><Mascot /></section>
    {invite && <section className="invite-panel panel" role="status"><span className="heading-icon yellow"><KeyRound size={23} /></span><div><h3>新邀请码已准备好</h3><p>仅本次显示，请及时保存。旧邀请码已失效。</p><strong className="inline-invite-code">{invite}</strong></div><button className="button button-secondary" onClick={() => void copy()}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "已复制" : "复制邀请码"}</button><button className="icon-button" aria-label="收起邀请码" onClick={() => setInvite("")}><X size={18} /></button></section>}
    {error && !action && <p role="alert" className="form-error">{error}</p>}<div className="member-section-heading"><h2>小组成员 <span className="count-chip">{data.members.length}</span></h2><span className="muted">每份努力，都值得被看见</span></div><section className="member-cards">{data.members.map(member => { const self = member.id === data.member.id; const checked = data.checkins.some(c => c.member_id === member.id); return <article className="member-card panel" key={member.id}><div className="member-card-top">{self ? <AvatarPicker member={member} spaceId={spaceId} onSaved={reload} variant="card" size="lg" /> : <Avatar member={member} size="lg" />}{member.role === "creator" ? <span className="creator-tag"><Crown size={12} />创建者</span> : <span className="member-tag">小组成员</span>}</div><h3>{member.nickname}{self && <span>我</span>}</h3><p className={`member-checkin ${checked ? "done" : ""}`}><span />{checked ? "今天已经打卡啦" : "正在积攒今天的小收获"}</p><div className="member-card-actions">{!self && <Link className="button button-soft" href={`/${spaceId}/chat?member=${member.id}`}><MessageCircle size={15} />聊一聊</Link>}{isCreator && !self && <><button className="icon-button" aria-label={`将创建者转移给${member.nickname}`} title="转移创建者" onClick={() => open("transfer", member)}><ArrowRightLeft size={16} /></button><button className="icon-button danger" aria-label={`移除${member.nickname}`} title="移除成员" onClick={() => open("remove", member)}><LogOut size={16} /></button></>}{self && <span className="self-card-label">很高兴，你也在这里 <span>♡</span></span>}</div></article>; })}{isCreator && <button className="invite-member-card" onClick={() => open("invite")}><span><UserPlus size={26} /></span><strong>再多一个伙伴</strong><p>把这份陪伴分享给朋友</p></button>}</section>
    <section className="space-settings panel"><div><h3><KeyRound size={17} />空间小贴士</h3><p>保留当前浏览器的登录状态，下次就能直接回来。{isCreator ? "退出前，请先将创建者身份交给一位伙伴。" : "退出后，需要有效的邀请码才能重新加入。"}</p></div>{!isCreator && <button className="button button-secondary danger" onClick={() => open("remove", data.member)}><LogOut size={16} />退出空间</button>}</section>
    {action && <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="member-action-title" className="modal small-modal"><div className="modal-heading"><h2 id="member-action-title">{action.kind === "invite" ? "生成新的邀请码？" : action.kind === "transfer" ? "将创建者身份交给伙伴？" : action.member?.id === data.member.id ? "要离开这个小组吗？" : `移除 ${action.member?.nickname}？`}</h2><button className="icon-button" disabled={busy} onClick={() => setAction(null)} aria-label="关闭"><X size={19} /></button></div><p>{action.kind === "invite" ? "旧邀请码会立即失效，新邀请码只显示一次。已经加入的伙伴不受影响。" : action.kind === "transfer" ? `${action.member?.nickname} 将可以管理成员和邀请码。你会成为普通成员，这个操作需要对方再次转移才能撤回。` : action.member?.id === data.member.id ? "退出后，你的登录状态会失效。请确认你想离开，再次加入需要邀请码。" : "该成员会退出空间，不能继续查看内容或发送消息。"}</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button className="button button-secondary" disabled={busy} onClick={() => setAction(null)}>取消</button><button className={`button ${action.kind === "remove" ? "button-danger" : "button-primary"}`} disabled={busy} onClick={() => void execute()}>{busy ? "正在处理…" : action.kind === "invite" ? "生成新邀请码" : action.kind === "transfer" ? "确认转移" : "确认退出"}</button></div></section></div>}
  </div>;
}
