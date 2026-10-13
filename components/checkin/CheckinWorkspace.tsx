"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListTodo } from "lucide-react";
import { useSpace } from "@/components/space/SpaceProvider";
import { DatePicker } from "@/components/ui/DatePicker";
import { TaskChecklist } from "@/components/tasks/TaskChecklist";
import { CheckinButton } from "./CheckinButton";
import { GroupDailyRecords } from "./GroupDailyRecords";
import styles from "./checkin.module.css";

export function CheckinWorkspace({ spaceId, memberId, selectedDate, initialCheckedAt, timeZone = "Asia/Shanghai" }: {
  spaceId: string;
  memberId: string;
  selectedDate: string;
  initialCheckedAt?: string;
  timeZone?: string;
}) {
  const { setDate, reload } = useSpace();
  const router = useRouter();
  const [taskLocked, setTaskLocked] = useState(false);
  const [checkinBusy, setCheckinBusy] = useState(false);
  const [navigating, startTransition] = useTransition();
  const reloadRef = useRef(reload);
  useEffect(() => { reloadRef.current = reload; }, [reload]);
  const onSaved = useCallback(() => { void reloadRef.current().catch(() => {}); }, []);
  useEffect(() => { setDate(selectedDate); return () => setDate(""); }, [selectedDate, setDate]);
  const locked = taskLocked || checkinBusy || navigating;
  return <div className={styles.workspace}>
    <div className={styles.dateBar}>
      <div><span className={styles.dateCaption}>查看这一天</span><p>每天的完成状态独立记录，一次任务未完成会继续保留。</p></div>
      <DatePicker value={selectedDate} onChange={(value) => { if (locked || value === selectedDate) return; startTransition(() => { setDate(value); router.push(`/${spaceId}/checkin?date=${value}`); }); }} label="打卡日期" timeZone={timeZone} disabled={locked} />
    </div>
    <section className={styles.ownSection} aria-labelledby="own-records-title">
      <div className={styles.sectionHeading}><div><h2 id="own-records-title"><ListTodo size={20} aria-hidden="true" />我的任务清单</h2><p>把要做的事写下来，完成一件就勾选一件。</p></div><span className={styles.dayChip}>{selectedDate}</span></div>
      <TaskChecklist selectedDate={selectedDate} memberId={memberId} scope="personal" ownOnly onLockChange={setTaskLocked} />
      <CheckinButton key={selectedDate} spaceId={spaceId} date={selectedDate} initialCheckedAt={initialCheckedAt} timeZone={timeZone} onSaved={onSaved} onBusyChange={setCheckinBusy} />
    </section>
    <GroupDailyRecords selectedDate={selectedDate} />
  </div>;
}
