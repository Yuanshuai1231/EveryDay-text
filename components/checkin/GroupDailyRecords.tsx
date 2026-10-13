"use client";

import { Check, ListTodo, RefreshCw, Users } from "lucide-react";
import { useSpace, type Task } from "@/components/space/SpaceProvider";
import { Avatar } from "@/components/ui/Avatar";
import { TaskList, tasksForDate } from "@/components/tasks/TaskChecklist";
import styles from "./checkin.module.css";

export function GroupDailyRecords({ selectedDate }: { selectedDate: string }) {
  const { data, error, reload } = useSpace();
  const matchingDay = data?.date === selectedDate;
  const tasks = matchingDay ? tasksForDate(data.tasks.filter((task) => (task.scope ?? "personal") === "personal"), selectedDate) : [];
  const members = matchingDay ? data.members.filter((member) => !member.removed_at || tasks.some((task) => task.creator_id === member.id)) : [];
  function lastEdited(memberTasks: Task[]) {
    return memberTasks.map((task) => task.updated_at).filter((value) => !!value && Number.isFinite(Date.parse(value))).sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  }
  return <section className={styles.groupSection} aria-labelledby="group-records-title">
    <div className={styles.sectionHeading}><div><h2 id="group-records-title"><Users size={20} aria-hidden="true" />小组记录</h2><p>看看伙伴们在做什么，为每一个小进步加油。</p></div><span className={styles.dayChip}>{selectedDate}</span></div>
    {error && <div className={styles.error} role="alert"><span>{matchingDay ? "记录更新失败，正在显示上次保存的内容。" : "暂时无法加载小组记录。"}{error}</span><button type="button" onClick={() => void reload().catch(() => {})}><RefreshCw size={14} aria-hidden="true" />重试加载</button></div>}
    {!matchingDay ? !error && <div className={styles.loading} role="status"><ListTodo size={24} aria-hidden="true" /><p>正在加载这一天的小组记录…</p></div>
      : <>{!tasks.length && <p className={styles.emptyNotice}>这一天还没有保存的任务，从一件小事开始吧。</p>}
        <div className={styles.memberGrid}>{members.map((member) => {
          const memberTasks = tasks.filter((task) => task.creator_id === member.id);
          const checked = data.checkins.some((checkin) => checkin.member_id === member.id);
          const editedAt = lastEdited(memberTasks);
          const completed = memberTasks.filter((task) => task.completed).length;
          return <article key={member.id} className={styles.memberCard} aria-label={`${member.nickname}的记录`}>
            <header className={styles.memberHeading}><Avatar member={member} /><div className={styles.memberName}><h3>{member.nickname}{member.id === data.member.id && <span className={styles.selfTag}>我</span>}</h3>{member.removed_at && <p>已离开 · 历史记录</p>}</div><span className={`${styles.checkinBadge} ${checked ? styles.checked : ""}`}>{checked && <Check size={12} aria-hidden="true" />}{checked ? "已完成打卡" : "未完成打卡"}</span></header>
            <div className={styles.memberProgress}><span>这一天的小目标</span><span>已完成 {completed} / {memberTasks.length}</span></div>
            {memberTasks.length ? <TaskList tasks={memberTasks} readOnly /> : <p className={styles.memberEmpty}>还没有任务</p>}
            <footer className={styles.memberFooter}>{editedAt ? <>最后更新 <time dateTime={editedAt}>{new Intl.DateTimeFormat("zh-CN", { timeZone: data.space.timezone, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(editedAt))}</time></> : "保存后的任务会出现在这里"}</footer>
          </article>;
        })}</div>
      </>}
  </section>;
}
