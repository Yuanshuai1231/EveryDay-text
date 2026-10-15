"use client";

import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  ListTodo,
  Pencil,
  Plus,
  Repeat2,
  Trash2,
  X,
} from "lucide-react";
import {
  requestJson,
  useSpace,
  type Member,
  type Task,
} from "@/components/space/SpaceProvider";
import { Avatar } from "@/components/ui/Avatar";
import { DatePicker } from "@/components/ui/DatePicker";
import styles from "./tasks.module.css";

export function tasksForDate(tasks: Task[], date: string) {
  return tasks.filter(
    (task) => !task.occurrence_date || task.occurrence_date === date,
  );
}

/** Read the current multi-assignee field while keeping older task rows usable. */
export function taskAssigneeIds(task: Task) {
  return task.assignee_ids?.length
    ? task.assignee_ids
    : task.assignee_id
      ? [task.assignee_id]
      : [];
}

export function TaskList({
  tasks,
  memberId,
  members = [],
  busy = "",
  readOnly = false,
  onToggle,
  onEdit,
  onDelete,
}: {
  tasks: Task[];
  memberId?: string;
  members?: Member[];
  busy?: string;
  readOnly?: boolean;
  onToggle?: (task: Task) => void;
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => void;
}) {
  return (
    <ul
      className={`${styles.list} ${readOnly ? styles.compact : ""}`}
      aria-label="任务清单"
    >
      {tasks.map((task) => {
        const own = !readOnly && task.creator_id === memberId;
        const group = task.scope === "group";
        const assignees = taskAssigneeIds(task)
          .map((id) => members.find((member) => member.id === id))
          .filter((member): member is Member => !!member);
        const canComplete =
          !readOnly &&
          (group ? taskAssigneeIds(task).includes(memberId ?? "") : own);
        const creator = members.find((member) => member.id === task.creator_id);
        return (
          <li
            key={task.id}
            className={`${styles.row} ${task.completed ? styles.completed : ""} ${task.overdue && !task.completed ? styles.overdueRow : ""}`}
          >
            {readOnly ? (
              <span
                className={`${styles.check} ${task.completed ? styles.checked : ""}`}
                aria-label={task.completed ? "任务已完成" : "任务待完成"}
              >
                {task.completed && <Check size={14} aria-hidden="true" />}
              </span>
            ) : (
              <button
                type="button"
                role="checkbox"
                aria-checked={task.completed}
                aria-label={`${task.completed ? "恢复" : "完成"}任务：${task.title}`}
                disabled={
                  !canComplete ||
                  !!busy ||
                  (task.recurrence !== "daily" &&
                    !!task.completed_on &&
                    task.completed_on !== task.occurrence_date)
                }
                className={`${styles.check} ${task.completed ? styles.checked : ""}`}
                onClick={() => onToggle?.(task)}
              >
                {task.completed && <Check size={14} aria-hidden="true" />}
              </button>
            )}
            <div className={styles.body}>
              <h3 className={styles.title}>{task.title}</h3>
              {task.notes && <p className={styles.notes}>{task.notes}</p>}
              <div className={styles.meta}>
                <span>
                  <CalendarDays size={12} aria-hidden="true" />
                  {task.target_date || "不限定日期"}
                </span>
                <span className={styles.repeat}>
                  <Repeat2 size={12} aria-hidden="true" />
                  {task.recurrence === "daily" ? "每天" : "仅这一次"}
                </span>
                {task.overdue && !task.completed && (
                  <span className={styles.overdue}>逾期未完成</span>
                )}
                {task.recurrence !== "daily" &&
                  task.completed_on &&
                  task.completed_on !== task.occurrence_date && (
                    <span className={styles.status}>
                      已于 {task.completed_on} 完成
                    </span>
                  )}
                <span
                  className={`${styles.status} ${task.completed ? styles.done : ""}`}
                >
                  {task.completed ? "已完成" : "待完成"}
                </span>
                {group && assignees.length > 0 && (
                  <span className={styles.assigneeList}>
                    <span>负责人：</span>
                    {assignees.map((assignee) => (
                      <span key={assignee.id} className={styles.assignee}>
                        <Avatar member={assignee} size="sm" />
                        {assignee.nickname}
                        {assignee.removed_at ? "（已离开）" : ""}
                      </span>
                    ))}
                  </span>
                )}
                {creator && (
                  <span>
                    <Avatar member={creator} size="sm" />
                    {group ? `创建者：${creator.nickname}` : creator.nickname}
                  </span>
                )}
              </div>
            </div>
            {own && (
              <div className={styles.actions}>
                <button
                  type="button"
                  className="icon-button"
                  disabled={!!busy}
                  onClick={() => onEdit?.(task)}
                  aria-label={`编辑任务：${task.title}`}
                >
                  <Pencil size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="icon-button danger"
                  disabled={!!busy}
                  onClick={() => onDelete?.(task)}
                  aria-label={`删除任务：${task.title}`}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

type Draft = {
  task: Task | "new";
  date: string;
  title: string;
  notes: string;
  targetDate: string;
  recurrence: "once" | "daily";
  assigneeIds: string[];
};

function TaskModal({
  children,
  titleId,
  onClose,
  busy,
}: {
  children: React.ReactNode;
  titleId: string;
  onClose: () => void;
  busy: boolean;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    (
      dialog?.querySelector<HTMLElement>("input:not(:disabled)") ??
      dialog?.querySelector<HTMLElement>("button:not(:disabled)")
    )?.focus();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    const dialog = dialogRef.current;
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onClose();
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
    };
  }, [busy, onClose]);
  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {children}
      </section>
    </div>
  );
}

export function TaskChecklist({
  selectedDate,
  memberId,
  ownOnly = false,
  showFilter = false,
  scope = "personal",
  onLockChange,
  dateControl,
}: {
  selectedDate: string;
  memberId: string;
  ownOnly?: boolean;
  showFilter?: boolean;
  scope?: "personal" | "group";
  onLockChange?: (locked: boolean) => void;
  dateControl?: (locked: boolean) => React.ReactNode;
}) {
  const { data, spaceId, reload, error: loadError } = useSpace();
  const [filter, setFilter] = useState("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<{ task: Task; date: string } | null>(
    null,
  );
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [optimisticTasks, setOptimisticTasks] = useState<Record<string, Task>>({});
  const lock = !!busy || !!draft || !!deleting;
  const editorId = useId();
  const deleteId = useId();
  const matchingDate = data?.date === selectedDate;
  const tasks = matchingDate
    ? tasksForDate(data.tasks, selectedDate)
        .map((task) => optimisticTasks[task.id] ?? task)
        .filter(
        (task) =>
          (task.scope ?? "personal") === scope &&
          (!ownOnly || task.creator_id === memberId),
      )
    : [];
  const filtered = tasks.filter(
    (task) =>
      filter === "all" ||
      (filter === "done" ? task.completed : !task.completed),
  );
  const fixedRecurrence =
    draft !== null && draft.task !== "new" && draft.task.recurrence === "daily";
  useEffect(() => {
    onLockChange?.(lock);
    return () => onLockChange?.(false);
  }, [lock, onLockChange]);
  function open(task: Task | "new") {
    if (
      busy ||
      !matchingDate ||
      (task !== "new" && task.creator_id !== memberId)
    )
      return;
    setDraft({
      task,
      date: selectedDate,
      title: task === "new" ? "" : task.title,
      notes: task === "new" ? "" : task.notes,
      targetDate:
        task === "new" ? selectedDate : task.target_date || selectedDate,
      recurrence: task === "new" ? "once" : (task.recurrence ?? "once"),
      assigneeIds: task === "new" ? [memberId] : taskAssigneeIds(task),
    });
    setError("");
    setNotice("");
  }
  async function refresh() {
    try {
      await reload();
    } catch {
      setNotice("操作已保存，列表更新失败，请重新加载。");
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !draft || !draft.title.trim()) return;
    const current = draft;
    setBusy("save");
    setError("");
    setNotice("");
    try {
      const isNew = current.task === "new";
      const existing = current.task as Task;
      await requestJson(
        `/api/spaces/${spaceId}/tasks${isNew ? "" : `/${existing.id}`}`,
        {
          method: isNew ? "POST" : "PATCH",
          body: JSON.stringify({
            title: current.title.trim(),
            notes: current.notes,
            ...(isNew
              ? {
                  targetDate: current.targetDate,
                  recurrence: current.recurrence,
                  scope,
                  ...(scope === "group"
                    ? { assigneeIds: current.assigneeIds }
                    : {}),
                }
              : {
                  updatedAt: existing.updated_at,
                  date: current.date,
                  ...(existing.recurrence === "daily"
                    ? {}
                    : {
                        targetDate: current.targetDate,
                        recurrence: current.recurrence,
                      }),
                }),
          }),
        },
      );
      setDraft(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，请重试");
    } finally {
      setBusy("");
    }
  }
  async function toggle(task: Task) {
    if (
      busy ||
      lock ||
      !matchingDate ||
      (task.scope === "group"
        ? !taskAssigneeIds(task).includes(memberId)
        : task.creator_id !== memberId)
    )
      return;
    const operationDate = selectedDate;
    const previousCompleted = task.completed;
    const optimisticTask = {
      ...task,
      completed: !previousCompleted,
      completed_on: !previousCompleted ? operationDate : null,
      completed_at: !previousCompleted ? new Date().toISOString() : null,
    };
    setBusy(task.id);
    setError("");
    setNotice("");
    // Reflect the click immediately; the shared provider refresh reconciles
    // the server result in the background.
    const currentData = data;
    if (currentData) {
      setOptimisticTasks((items) => ({ ...items, [task.id]: optimisticTask }));
    }
    try {
      await requestJson(`/api/spaces/${spaceId}/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          completed: !task.completed,
          updatedAt: task.updated_at,
          date: operationDate,
        }),
      });
      await refresh();
      setOptimisticTasks((items) => {
        const next = { ...items };
        delete next[task.id];
        return next;
      });
    } catch (e) {
      setOptimisticTasks((items) => {
        const next = { ...items };
        delete next[task.id];
        return next;
      });
      setError(e instanceof Error ? e.message : "更新失败，请重试");
      await refresh();
    } finally {
      setBusy("");
    }
  }
  async function remove() {
    if (!deleting || busy || deleting.task.creator_id !== memberId) return;
    const current = deleting;
    setBusy("delete");
    setError("");
    setNotice("");
    try {
      await requestJson(
        `/api/spaces/${spaceId}/tasks/${current.task.id}?updatedAt=${encodeURIComponent(current.task.updated_at)}&date=${current.date}`,
        { method: "DELETE" },
      );
      setDeleting(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败，请重试");
    } finally {
      setBusy("");
    }
  }
  return (
    <div className={styles.checklist}>
      <div className={styles.toolbar}>
        {showFilter && (
          <div className="segmented" aria-label="任务筛选">
            {[
              { id: "all", text: "全部任务" },
              { id: "todo", text: "待完成" },
              { id: "done", text: "已完成" },
            ].map((item) => (
              <button
                type="button"
                aria-pressed={filter === item.id}
                className={filter === item.id ? "selected" : ""}
                key={item.id}
                onClick={() => setFilter(item.id)}
              >
                {item.text}
                <span>
                  {
                    tasks.filter(
                      (task) =>
                        item.id === "all" ||
                        (item.id === "done" ? task.completed : !task.completed),
                    ).length
                  }
                </span>
              </button>
            ))}
          </div>
        )}
        {dateControl?.(lock)}
        <button
          type="button"
          className="button button-primary"
          disabled={
            lock ||
            !matchingDate ||
            (scope === "group" &&
              !data?.members.some((member) => !member.removed_at))
          }
          onClick={() => open("new")}
        >
          <Plus size={16} aria-hidden="true" />
          添加任务
        </button>
      </div>
      {error && !draft && !deleting && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className={styles.notice}>
          {notice}
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void refresh()}
          >
            重新加载
          </button>
        </p>
      )}
      {!matchingDate ? (
        <div className={styles.empty}>
          <ListTodo size={26} aria-hidden="true" />
          <p role="status">
            {loadError
              ? "暂时无法读取这一天的任务，请重试。"
              : "正在加载这一天的任务…"}
          </p>
          {loadError && (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => void refresh()}
            >
              重新加载
            </button>
          )}
        </div>
      ) : (
        <>
          {loadError && (
            <p role="alert" className={styles.error}>
              任务更新失败，正在显示上次保存的内容。{loadError}
              <button type="button" onClick={() => void refresh()}>
                重新加载
              </button>
            </p>
          )}
          {filtered.length ? (
            <TaskList
              tasks={filtered}
              memberId={memberId}
              members={ownOnly ? [] : data.members}
              busy={busy || (draft || deleting ? "editing" : "")}
              onToggle={(task) => void toggle(task)}
              onEdit={open}
              onDelete={(task) => {
                setDeleting({ task, date: selectedDate });
                setError("");
                setNotice("");
              }}
            />
          ) : (
            <div className={styles.empty}>
              <ListTodo size={28} aria-hidden="true" />
              <h3>
                {filter === "done"
                  ? "小成就正在路上"
                  : filter === "todo" && tasks.length
                    ? "今天的小目标都完成啦！"
                    : "从一件小事开始"}
              </h3>
              <p>
                {filter === "done"
                  ? "勾选完成后，今天的成就会出现在这里。"
                  : "写下要做的事，完成一件就勾选一件。"}
              </p>
            </div>
          )}
        </>
      )}
      {!!busy && (
        <p className={styles.pending} role="status">
          正在保存这一天的任务…
        </p>
      )}
      {draft && (
        <TaskModal
          titleId={editorId}
          busy={!!busy}
          onClose={() => setDraft(null)}
        >
          <div className="modal-heading">
            <div>
              <span className="eyebrow">一步一步，完成小目标</span>
              <h2 id={editorId}>
                {draft.task === "new" ? "种下一个小目标" : "调整一下小目标"}
              </h2>
            </div>
            <button
              type="button"
              className="icon-button"
              disabled={!!busy}
              onClick={() => setDraft(null)}
              aria-label="关闭"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <form onSubmit={(event) => void save(event)}>
            <label className="field">
              任务名称
              <input
                required
                maxLength={200}
                disabled={!!busy}
                value={draft.title}
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
                placeholder="想完成什么小事？"
              />
            </label>
            {scope === "group" && (
              <fieldset className={`field ${styles.assigneeField}`}>
                <legend>任务负责人</legend>
                <div className={styles.assigneeOptions}>
                  {data?.members
                    .filter(
                      (member) =>
                        !member.removed_at ||
                        (draft.task !== "new" &&
                          taskAssigneeIds(draft.task).includes(member.id)),
                    )
                    .map((member) => {
                      const selected = draft.assigneeIds.includes(member.id);
                      return (
                        <label
                          className={styles.assigneeOption}
                          key={member.id}
                        >
                          <input
                            type="checkbox"
                            aria-label={`负责人：${member.nickname}`}
                            disabled={!!busy || draft.task !== "new"}
                            checked={selected}
                            onChange={() =>
                              setDraft({
                                ...draft,
                                assigneeIds: selected
                                  ? draft.assigneeIds.filter(
                                      (id) => id !== member.id,
                                    )
                                  : [...draft.assigneeIds, member.id],
                              })
                            }
                          />
                          <Avatar member={member} size="sm" />
                          <span>
                            {member.nickname}
                            {member.removed_at ? "（已离开）" : ""}
                          </span>
                        </label>
                      );
                    })}
                </div>
                <span className={styles.assigneeHint}>
                  可选择多位成员共同负责
                </span>
              </fieldset>
            )}
            <label className="field">
              补充说明 <span className="optional">选填</span>
              <textarea
                rows={4}
                maxLength={5000}
                disabled={!!busy}
                value={draft.notes}
                onChange={(event) =>
                  setDraft({ ...draft, notes: event.target.value })
                }
                placeholder="写一点备注，帮自己记住细节…"
              />
            </label>
            <div className="field">
              <span>计划日期</span>
              <DatePicker
                label="计划日期"
                value={draft.targetDate}
                onChange={(value) => setDraft({ ...draft, targetDate: value })}
                timeZone={data?.space.timezone}
                disabled={
                  !!busy ||
                  (draft.task !== "new" && draft.task.recurrence === "daily")
                }
              />
            </div>
            <fieldset
              className={styles.repeatOptions}
              disabled={!!busy || fixedRecurrence}
            >
              <legend>重复</legend>
              {[
                { id: "once", text: "仅这一次" },
                { id: "daily", text: "每天" },
              ].map((item) => (
                <label key={item.id}>
                  <input
                    type="radio"
                    disabled={!!busy || fixedRecurrence}
                    name={`${editorId}-recurrence`}
                    value={item.id}
                    checked={draft.recurrence === item.id}
                    onChange={() =>
                      setDraft({
                        ...draft,
                        recurrence: item.id as "once" | "daily",
                      })
                    }
                  />
                  {item.text}
                </label>
              ))}
            </fieldset>
            {draft.task !== "new" && draft.task.recurrence === "daily" && (
              <p className={styles.seriesNote}>
                标题和备注会更新整个每日任务系列，已记录的每日完成状态会保留。
              </p>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                disabled={!!busy}
                onClick={() => setDraft(null)}
              >
                先想一想
              </button>
              <button
                className="button button-primary"
                disabled={
                  !!busy ||
                  !draft.title.trim() ||
                  (scope === "group" && draft.assigneeIds.length === 0)
                }
              >
                {busy === "save" ? "正在保存…" : "保存小目标"}
              </button>
            </div>
          </form>
        </TaskModal>
      )}
      {deleting && (
        <TaskModal
          titleId={deleteId}
          busy={!!busy}
          onClose={() => setDeleting(null)}
        >
          <h2 id={deleteId}>
            {deleting.task.recurrence === "daily"
              ? "停止这个每日任务？"
              : "删除这个任务？"}
          </h2>
          <p className={styles.deleteNote}>
            {deleting.task.recurrence === "daily"
              ? `从 ${deleting.date} 开始停止“${deleting.task.title}”的重复，较早日期的任务和完成记录会保留。`
              : `“${deleting.task.title}”删除后无法恢复。`}
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={!!busy}
              onClick={() => setDeleting(null)}
            >
              保留任务
            </button>
            <button
              type="button"
              className="button button-danger"
              disabled={!!busy}
              onClick={() => void remove()}
            >
              {busy
                ? "处理中…"
                : deleting.task.recurrence === "daily"
                  ? "停止重复"
                  : "确认删除"}
            </button>
          </div>
        </TaskModal>
      )}
    </div>
  );
}
