"use client";

import {
  Check,
  CloudSun,
  NotebookPen,
  RefreshCw,
  Sun,
  Users,
} from "lucide-react";
import { useSpace, type DailyLog } from "@/components/space/SpaceProvider";
import { Avatar } from "@/components/ui/Avatar";
import styles from "./checkin.module.css";

export function GroupDailyRecords({ selectedDate }: { selectedDate: string }) {
  const { data, error, reload } = useSpace();
  const matchingDay = data?.date === selectedDate;
  const logs = matchingDay
    ? data.logs.filter(
        (log) => !log.work_date || log.work_date === selectedDate,
      )
    : [];
  const members = matchingDay
    ? data.members.filter(
        (member) =>
          !member.removed_at ||
          logs.some((log) => log.member_id === member.id && log.content.trim()),
      )
    : [];

  function lastEdited(memberLogs: DailyLog[]) {
    return memberLogs
      .map((log) => log.edited_at)
      .filter(
        (value): value is string =>
          !!value && Number.isFinite(Date.parse(value)),
      )
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  }

  return (
    <section
      className={styles.groupSection}
      aria-labelledby="group-records-title"
    >
      <div className={styles.sectionHeading}>
        <div>
          <h2 id="group-records-title">
            <Users size={20} aria-hidden="true" />
            小组记录
          </h2>
          <p>看看伙伴们在做什么，一点点进步都值得被看见。</p>
        </div>
        <span className={styles.dayChip}>{selectedDate}</span>
      </div>
      {error && (
        <div className={styles.error} role="alert">
          <span>
            {matchingDay
              ? "记录更新失败，正在显示上次保存的内容。"
              : "暂时无法加载小组记录。"}
            {error}
          </span>
          <button type="button" onClick={() => void reload()}>
            <RefreshCw size={14} aria-hidden="true" />
            重试加载
          </button>
        </div>
      )}
      {!matchingDay ? (
        !error && (
          <div className={styles.loading} role="status">
            <NotebookPen size={24} aria-hidden="true" />
            <p>正在加载这一天的小组记录…</p>
          </div>
        )
      ) : (
        <>
          {!logs.some((log) => log.content.trim()) && (
            <p className={styles.emptyNotice}>
              这一天还没有保存的记录，从一件小事开始吧。
            </p>
          )}
          <div className={styles.memberGrid}>
            {members.map((member) => {
              const memberLogs = logs.filter(
                (log) => log.member_id === member.id,
              );
              const checked = data.checkins.some(
                (checkin) => checkin.member_id === member.id,
              );
              const editedAt = lastEdited(memberLogs);
              return (
                <article
                  key={member.id}
                  className={styles.memberCard}
                  aria-label={`${member.nickname}的记录`}
                >
                  <header className={styles.memberHeading}>
                    <Avatar member={member} />
                    <div className={styles.memberName}>
                      <h3>
                        {member.nickname}
                        {member.id === data.member.id && (
                          <span className={styles.selfTag}>我</span>
                        )}
                      </h3>
                      {member.removed_at && <p>已离开 · 历史记录</p>}
                    </div>
                    <span
                      className={`${styles.checkinBadge} ${checked ? styles.checked : ""}`}
                    >
                      {checked && <Check size={12} aria-hidden="true" />}
                      {checked ? "已完成打卡" : "未完成打卡"}
                    </span>
                  </header>
                  <div className={styles.recordSlots}>
                    {(["morning", "afternoon"] as const).map((slot) => {
                      const log = memberLogs.find(
                        (value) => value.slot === slot,
                      );
                      return (
                        <div
                          key={slot}
                          className={`${styles.recordSlot} ${slot === "morning" ? styles.morning : styles.afternoon}`}
                        >
                          <h4>
                            {slot === "morning" ? (
                              <Sun size={15} aria-hidden="true" />
                            ) : (
                              <CloudSun size={15} aria-hidden="true" />
                            )}
                            {slot === "morning" ? "上午记录" : "下午记录"}
                          </h4>
                          <p
                            className={
                              log?.content.trim()
                                ? styles.recordContent
                                : styles.placeholder
                            }
                          >
                            {log?.content.trim() ? log.content : "还没有记录"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <footer className={styles.memberFooter}>
                    {editedAt ? (
                      <>
                        最后更新{" "}
                        <time dateTime={editedAt}>
                          {new Intl.DateTimeFormat("zh-CN", {
                            timeZone: data.space.timezone,
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          }).format(new Date(editedAt))}
                        </time>
                      </>
                    ) : (
                      "保存后的记录会出现在这里"
                    )}
                  </footer>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
