import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/session";
import { selectedWorkDate } from "@/lib/data/checkins";
import { CheckinWorkspace } from "@/components/checkin/CheckinWorkspace";
import styles from "@/components/checkin/checkin.module.css";

export default async function CheckinPage({
  params,
  searchParams,
}: {
  params: Promise<{ spaceId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { spaceId } = await params;
  const db = createSupabaseAdminClient();
  const session = await getCurrentSession(db);
  if (!session || session.space_id !== spaceId)
    return (
      <section>
        <p>请先加入此空间。</p>
      </section>
    );
  const { data: space } = await db
    .from("spaces")
    .select("name,timezone")
    .eq("id", spaceId)
    .maybeSingle();
  const date = selectedWorkDate(
    (await searchParams).date,
    space?.timezone ?? "Asia/Shanghai",
  );
  if (!date)
    return (
      <section className="checkin-page">
        <p role="alert">日期无效。请从打卡页面选择有效日期。</p>
      </section>
    );
  const { data: logs } = await db
    .from("daily_logs")
    .select("slot,content,edited_at")
    .eq("space_id", spaceId)
    .eq("member_id", session.member_id)
    .eq("work_date", date);
  const { data: checkin } = await db
    .from("daily_checkins")
    .select("checked_in_at")
    .eq("space_id", spaceId)
    .eq("member_id", session.member_id)
    .eq("work_date", date)
    .maybeSingle();
  const morning = logs?.find((log) => log.slot === "morning");
  const afternoon = logs?.find((log) => log.slot === "afternoon");
  return (
    <section className={styles.page}>
      <header className={`page-heading ${styles.pageHeader}`}>
        <div>
          <p className="eyebrow">{space?.name ?? "我的空间"}</p>
          <h1>
            每日打卡<span className="hello-spark">✳</span>
          </h1>
          <p>记录今天，也看看伙伴的小进步。</p>
        </div>
        <form method="get" className={styles.dateForm}>
          <label htmlFor="work-date">日期</label>
          <input
            className={styles.dateInput}
            id="work-date"
            name="date"
            type="date"
            defaultValue={date}
          />
          <button className="button button-secondary" type="submit">
            查看
          </button>
        </form>
      </header>
      <CheckinWorkspace
        key={`${spaceId}-${date}`}
        spaceId={spaceId}
        memberId={session.member_id}
        selectedDate={date}
        timeZone={space?.timezone ?? "Asia/Shanghai"}
        initialMorning={
          morning
            ? { content: morning.content, editedAt: morning.edited_at }
            : undefined
        }
        initialAfternoon={
          afternoon
            ? { content: afternoon.content, editedAt: afternoon.edited_at }
            : undefined
        }
        initialCheckedAt={checkin?.checked_in_at}
      />
    </section>
  );
}
