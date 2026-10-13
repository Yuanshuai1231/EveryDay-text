"use client";

import { useState } from "react";
import { CheckCheck, ListTodo, Target } from "lucide-react";
import { useSpace } from "@/components/space/SpaceProvider";
import { DatePicker } from "@/components/ui/DatePicker";
import { TaskChecklist, tasksForDate } from "./TaskChecklist";
import styles from "./tasks.module.css";

export function TaskBoard() {
  const { data, date, setDate } = useSpace();
  const [memberFilter, setMemberFilter] = useState("all");
  const matchingDate = data?.date === date;
  const allTasks = matchingDate
    ? tasksForDate(data.tasks, date).filter((task) => task.scope === "group")
    : [];
  const tasks = allTasks.filter(
    (task) => memberFilter === "all" || task.assignee_id === memberFilter,
  );
  const members =
    data?.members.filter(
      (member) =>
        !member.removed_at ||
        allTasks.some((task) => task.assignee_id === member.id),
    ) ?? [];
  const selectedMember = members.find((member) => member.id === memberFilter);
  const completed = tasks.filter((task) => task.completed).length;
  return (
    <div className="tasks-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            <Target size={14} aria-hidden="true" />
            一起完成，会更有动力
          </p>
          <h1>
            小组任务<span className="hello-spark">✳</span>
          </h1>
          <p>选择伙伴，为组内成员制定目标，由负责人在这里勾选完成。</p>
        </div>
      </div>
      {matchingDate && (
        <section className="task-banner">
          <div>
            <span className="mini-pill">
              {date} ·{" "}
              {selectedMember
                ? `${selectedMember.nickname}的小组目标`
                : "我们的小组目标"}
            </span>
            <h2>今天，也离目标近一点。</h2>
            <p>
              已完成 <strong>{completed}</strong> 个任务 · 还有{" "}
              <strong>{tasks.length - completed}</strong> 个小组目标等着完成
            </p>
          </div>
          <div className="task-banner-art">
            <span className="drawn-check">
              <CheckCheck size={53} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <span className="decor-star">✳</span>
          </div>
        </section>
      )}
      <section className="panel task-board" style={{ padding: "22px" }}>
        <TaskChecklist
          selectedDate={date}
          memberId={data?.member.id ?? ""}
          scope="group"
          assigneeId={memberFilter === "all" ? undefined : memberFilter}
          showFilter
          dateControl={(locked) => (
            <>
              <label className={styles.memberFilter}>
                查看成员
                <select
                  aria-label="查看成员"
                  value={memberFilter}
                  disabled={locked}
                  onChange={(event) => setMemberFilter(event.target.value)}
                >
                  <option value="all">全部成员</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.nickname}
                      {member.removed_at
                        ? "（已离开）"
                        : member.id === data?.member.id
                          ? "（我）"
                          : ""}
                    </option>
                  ))}
                </select>
              </label>
              <DatePicker
                value={date}
                onChange={setDate}
                label="任务日期"
                timeZone={data?.space.timezone}
                disabled={locked}
              />
            </>
          )}
        />
        <div className="task-board-footer">
          <ListTodo size={15} aria-hidden="true" />
          小组目标与个人每日打卡分开；由负责人勾选完成，创建者编辑或删除。
        </div>
      </section>
    </div>
  );
}
