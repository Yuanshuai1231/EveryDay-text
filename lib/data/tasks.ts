import { z } from "zod";
import { ERROR_CODES } from "@/lib/auth/validation";
import type { Database, Json } from "@/lib/supabase/types";
import { isValidWorkDate } from "@/lib/data/checkins";
import { DataApiError, type DataClient, timestampSchema } from "./api";

type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type CompletionRow = Database["public"]["Tables"]["task_completions"]["Row"];
export type TaskRecord = TaskRow & { occurrence_date: string; overdue: boolean };
export type TaskScope = TaskRow["scope"];
export const taskScopeSchema = z.enum(["personal", "group"]);
const dateSchema = z.string().refine(isValidWorkDate);
const recurrenceSchema = z.enum(["once", "daily"]);
const titleSchema = z.string().trim().refine((text) => Array.from(text).length >= 1 && Array.from(text).length <= 120 && !text.includes("\u0000"));
const notesSchema = z.string().refine((text) => Array.from(text).length <= 5000 && !text.includes("\u0000"));

export const createTaskSchema = z.object({
  title: titleSchema, notes: notesSchema.default(""), targetDate: dateSchema,
  recurrence: recurrenceSchema.default("once"), scope: taskScopeSchema.default("personal"), assigneeId: z.string().uuid().optional(),
}).strict().refine(value => value.scope === "group" ? value.assigneeId !== undefined : value.assigneeId === undefined);
export const updateTaskSchema = z.object({
  updatedAt: timestampSchema.optional(), expectedUpdatedAt: timestampSchema.optional(),
  title: titleSchema.optional(), notes: notesSchema.optional(), targetDate: dateSchema.optional(), recurrence: recurrenceSchema.optional(), completed: z.boolean().optional(), date: dateSchema.optional(),
}).strict().refine((value) => Boolean(value.updatedAt ?? value.expectedUpdatedAt)).refine((value) => value.title !== undefined || value.notes !== undefined || value.targetDate !== undefined || value.recurrence !== undefined || value.completed !== undefined);

function projectTask(task: TaskRow, date: string, completion?: CompletionRow): TaskRecord {
  const completed = task.recurrence === "daily" ? Boolean(completion?.completed) : task.completed && task.completed_on === date;
  return { ...task, occurrence_date: date, completed, completed_at: completed ? (task.recurrence === "daily" ? completion?.completed_at ?? null : task.completed_at) : null, overdue: task.recurrence === "once" && task.target_date !== null && task.target_date < date && !completed };
}

export async function listTasks(db: DataClient, spaceId: string, date: string, scope?: TaskScope, assigneeId?: string): Promise<TaskRecord[]> {
  let query = db.from("tasks").select("*").eq("space_id", spaceId).lte("target_date", date);
  if (scope !== undefined) query = query.eq("scope", scope);
  if (assigneeId !== undefined) query = query.eq("assignee_id", assigneeId);
  const { data, error } = await query.order("created_at", { ascending: true }).order("id", { ascending: true });
  if (error) throw error;
  const tasks = (data ?? []).filter(task => task.recurrence === "daily" ? task.ends_on === null || date <= task.ends_on : task.completed_on === null || date <= task.completed_on);
  const dailyIds = tasks.filter(task => task.recurrence === "daily").map(task => task.id);
  let completions: CompletionRow[] = [];
  if (dailyIds.length) {
    const result = await db.from("task_completions").select("*").eq("space_id", spaceId).eq("work_date", date).in("task_id", dailyIds);
    if (result.error) throw result.error;
    completions = result.data ?? [];
  }
  const byTask = new Map(completions.map(completion => [completion.task_id, completion]));
  return tasks.map(task => projectTask(task, date, byTask.get(task.id)));
}

function throwMutationError(error: { code?: string; message?: string }): never {
  if (error.code === "42501") {
    const messages: Record<string, string> = { TASK_NOT_OWNER: "只有创建者可以修改这个任务", TASK_NOT_ASSIGNEE: "只有负责人可以完成这个任务" };
    throw new DataApiError(ERROR_CODES.FORBIDDEN, messages[error.message ?? ""] ?? "你已不在这个空间中", 403);
  }
  if (error.code === "40001") throw new DataApiError(ERROR_CODES.CONFLICT, "任务已更新，请刷新后重试", 409);
  if (error.code === "P0002") throw new DataApiError(ERROR_CODES.INVALID_INPUT, "任务不存在或已删除", 404);
  if (error.code === "22023" || error.code === "23514") {
    const messages: Record<string, string> = {
      TASK_DATE_REQUIRED: "每天任务需要选择操作日期",
      TASK_DAILY_SCHEDULE_FIXED: "每天任务的重复方式和起始日期在创建后不可修改，请新建任务",
      TASK_DATE_OUTSIDE_OCCURRENCE: "这个日期没有该任务，请刷新后重试",
      TASK_DATE_AFTER_COMPLETION: "计划日期不能晚于完成日期",
      TASK_REOPEN_BEFORE_REPEAT: "请先取消完成，再改为每天重复",
      TASK_COMPLETION_ON_OTHER_DATE: "任务已在其他日期完成，无法改写历史状态",
      TASK_ASSIGNEE_INACTIVE: "只能选择本小组中未退出的成员作为负责人",
      TASK_ASSIGNMENT_INVALID: "个人清单无需负责人，小组任务必须选择本小组中未退出的负责人",
      TASK_ASSIGNMENT_FIXED: "任务类别和负责人在创建后不可修改",
    };
    throw new DataApiError(ERROR_CODES.INVALID_INPUT, messages[error.message ?? ""] ?? "任务内容无效，请检查后重试", 400);
  }
  throw error;
}

export async function createTask(db: DataClient, spaceId: string, memberId: string, input: Omit<z.infer<typeof createTaskSchema>, "recurrence" | "scope"> & { recurrence?: "once" | "daily"; scope?: TaskScope }): Promise<TaskRecord> {
  const { data, error } = await db.rpc("create_owned_task", { p_space_id: spaceId, p_member_id: memberId, p_title: input.title, p_notes: input.notes, p_target_date: input.targetDate, p_recurrence: input.recurrence ?? "once", p_scope: input.scope ?? "personal", p_assignee_id: input.assigneeId ?? null });
  if (error) throwMutationError(error);
  if (!data) throw new Error("Task insert returned no row");
  return data as TaskRecord;
}

export async function updateTask(db: DataClient, spaceId: string, taskId: string, memberId: string, input: z.infer<typeof updateTaskSchema>): Promise<TaskRecord> {
  const { updatedAt, expectedUpdatedAt, ...changes } = input;
  const { data, error } = await db.rpc("update_owned_task", { p_space_id: spaceId, p_member_id: memberId, p_task_id: taskId, p_updated_at: (updatedAt ?? expectedUpdatedAt)!, p_changes: changes as Json });
  if (error) throwMutationError(error);
  if (!data) throw new Error("Task update returned no row");
  return data as TaskRecord;
}

export async function deleteTask(db: DataClient, spaceId: string, taskId: string, memberId: string, updatedAt: string, date?: string) {
  const { error } = await db.rpc("delete_owned_task", { p_space_id: spaceId, p_member_id: memberId, p_task_id: taskId, p_updated_at: updatedAt, ...(date ? { p_date: date } : {}) });
  if (error) throwMutationError(error);
}
