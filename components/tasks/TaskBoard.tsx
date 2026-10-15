"use client";

import { CheckCheck, ListTodo, Target } from "lucide-react";
import { useSpace } from "@/components/space/SpaceProvider";
import { DatePicker } from "@/components/ui/DatePicker";
import { TaskChecklist } from "./TaskChecklist";

export function TaskBoard() {
  const { data, date, setDate } = useSpace();
  const matchingDate = data?.date === date;
  const tasks = matchingDate
    ? data.tasks.filter((task) => task.scope === "group")
    : [];
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
            <span className="mini-pill">{date} · 我们的小组目标</span>
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
          showFilter
          dateControl={(locked) => (
            <DatePicker
              value={date}
              onChange={setDate}
              label="任务日期"
              timeZone={data?.space.timezone}
              disabled={locked}
            />
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
