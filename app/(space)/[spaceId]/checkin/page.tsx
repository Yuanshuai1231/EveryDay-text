import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/session";
import { selectedWorkDate } from "@/lib/data/checkins";
import { LogEditor } from "@/components/checkin/LogEditor";
import { CheckinButton } from "@/components/checkin/CheckinButton";

export default async function CheckinPage({ params, searchParams }: { params: Promise<{ spaceId: string }>; searchParams: Promise<{ date?: string }> }) {
  const { spaceId } = await params; const db = createSupabaseAdminClient(); const session = await getCurrentSession(db);
  if (!session || session.space_id !== spaceId) return <section><p>请先加入此空间。</p></section>;
  const { data: space } = await db.from("spaces").select("name,timezone").eq("id", spaceId).maybeSingle();
  const date = selectedWorkDate((await searchParams).date, space?.timezone ?? "Asia/Shanghai");
  if (!date) return <section className="checkin-page"><p role="alert">日期无效。请从打卡页面选择有效日期。</p></section>;
  const { data: logs } = await db.from("daily_logs").select("slot,content,edited_at").eq("space_id", spaceId).eq("member_id", session.member_id).eq("work_date", date);
  const { data: checkin } = await db.from("daily_checkins").select("checked_in_at").eq("space_id", spaceId).eq("member_id", session.member_id).eq("work_date", date).maybeSingle();
  const morning = logs?.find((log) => log.slot === "morning"); const afternoon = logs?.find((log) => log.slot === "afternoon");
  return <section className="checkin-page mx-auto w-full max-w-5xl px-4 py-6"><header className="page-heading mb-6"><p className="eyebrow">{space?.name ?? "我的空间"}</p><h1>每日打卡</h1><form method="get" className="mt-4 flex flex-wrap items-center gap-3"><label htmlFor="work-date">日期</label><input className="field" id="work-date" name="date" type="date" defaultValue={date} /><button className="button" type="submit">查看</button></form></header><section className="checkin-grid grid gap-4 md:grid-cols-2"><LogEditor key={`${date}-morning`} spaceId={spaceId} memberId={session.member_id} date={date} slot="morning" initialContent={morning?.content ?? ""} editedAt={morning?.edited_at} /><LogEditor key={`${date}-afternoon`} spaceId={spaceId} memberId={session.member_id} date={date} slot="afternoon" initialContent={afternoon?.content ?? ""} editedAt={afternoon?.edited_at} /></section><CheckinButton key={date} spaceId={spaceId} date={date} initialCheckedAt={checkin?.checked_in_at} /></section>;
}

