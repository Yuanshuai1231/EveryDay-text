"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NotebookPen } from "lucide-react";
import { useSpace } from "@/components/space/SpaceProvider";
import { LogEditor } from "./LogEditor";
import { CheckinButton } from "./CheckinButton";
import { GroupDailyRecords } from "./GroupDailyRecords";
import styles from "./checkin.module.css";

type InitialLog = { content: string; editedAt?: string };

export function CheckinWorkspace({
  spaceId,
  memberId,
  selectedDate,
  initialMorning,
  initialAfternoon,
  initialCheckedAt,
  timeZone = "Asia/Shanghai",
}: {
  spaceId: string;
  memberId: string;
  selectedDate: string;
  initialMorning?: InitialLog;
  initialAfternoon?: InitialLog;
  initialCheckedAt?: string;
  timeZone?: string;
}) {
  const { setDate, reload } = useSpace();
  // Shared refreshes must never replace an editor's draft or optimistic-lock baseline.
  const [initial] = useState({
    morning: initialMorning,
    afternoon: initialAfternoon,
    checkedAt: initialCheckedAt,
  });
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);
  const onSaved = useCallback(() => {
    void reloadRef.current().catch(() => {});
  }, []);

  useEffect(() => {
    setDate(selectedDate);
    return () => setDate("");
  }, [selectedDate, setDate]);

  return (
    <div className={styles.workspace}>
      <section
        className={styles.ownSection}
        aria-labelledby="own-records-title"
      >
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="own-records-title">
              <NotebookPen size={20} aria-hidden="true" />
              我的记录
            </h2>
            <p>写下今天的小进步。自动保存后，伙伴就能看到。</p>
          </div>
          <span className={styles.autosaveNote}>输入后自动保存</span>
        </div>
        <div className={styles.editorGrid}>
          <LogEditor
            spaceId={spaceId}
            memberId={memberId}
            date={selectedDate}
            slot="morning"
            initialContent={initial.morning?.content ?? ""}
            editedAt={initial.morning?.editedAt}
            onSaved={onSaved}
          />
          <LogEditor
            spaceId={spaceId}
            memberId={memberId}
            date={selectedDate}
            slot="afternoon"
            initialContent={initial.afternoon?.content ?? ""}
            editedAt={initial.afternoon?.editedAt}
            onSaved={onSaved}
          />
        </div>
        <CheckinButton
          spaceId={spaceId}
          date={selectedDate}
          initialCheckedAt={initial.checkedAt}
          timeZone={timeZone}
          onSaved={onSaved}
        />
      </section>
      <GroupDailyRecords selectedDate={selectedDate} />
    </div>
  );
}
