import { z } from "zod";
import { ERROR_CODES } from "@/lib/auth/validation";
import type { Database } from "@/lib/supabase/types";
import { isValidWorkDate } from "@/lib/data/checkins";
import { DataApiError, type DataClient, timestampSchema } from "./api";

export type TaskRecord = Database["public"]["Tables"]["tasks"]["Row"];
const dateSchema = z.string().refine(isValidWorkDate);
const titleSchema = z.string().trim().refine((text) => Array.from(text).length >= 1 && Array.from(text).length <= 120 && !text.includes("\u0000"));
const notesSchema = z.string().refine((text) => Array.from(text).length <= 1000 && !text.includes("\u0000"));

export const createTaskSchema = z.object({ title: titleSchema, notes: notesSchema.default(""), targetDate: dateSchema }).strict();
export const updateTaskSchema = z.object({
  updatedAt: timestampSchema.optional(), expectedUpdatedAt: timestampSchema.optional(),
  title: titleSchema.optional(), notes: notesSchema.optional(), targetDate: dateSchema.optional(), completed: z.boolean().optional(),
}).strict().refine((value) => Boolean(value.updatedAt ?? value.expectedUpdatedAt)).refine((value) => value.title !== undefined || value.notes !== undefined || value.targetDate !== undefined || value.completed !== undefined);

export async function listTasks(db: DataClient, spaceId: string, date: string): Promise<TaskRecord[]> {
  const { data, error } = await db.from("tasks").select("*").eq("space_id", spaceId).eq("target_date", date).order("created_at", { ascending: true }).order("id", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createTask(db: DataClient, spaceId: string, memberId: string, input: z.infer<typeof createTaskSchema>): Promise<TaskRecord> {
  const { data, error } = await db.from("tasks").insert({ space_id: spaceId, creator_id: memberId, title: input.title, notes: input.notes, target_date: input.targetDate }).select("*").single();
  if (error) throw error;
  if (!data) throw new Error("Task insert returned no row");
  return data;
}

async function requireOwnedTask(db: DataClient, spaceId: string, taskId: string, memberId: string) {
  const { data, error } = await db.from("tasks").select("*").eq("space_id", spaceId).eq("id", taskId).maybeSingle();
  if (error) throw error;
  if (!data) throw new DataApiError(ERROR_CODES.INVALID_INPUT, "任务不存在或已删除", 404);
  if (data.creator_id !== memberId) throw new DataApiError(ERROR_CODES.FORBIDDEN, "只有创建者可以修改这个任务", 403);
  return data;
}

export async function updateTask(db: DataClient, spaceId: string, taskId: string, memberId: string, input: z.infer<typeof updateTaskSchema>): Promise<TaskRecord> {
  const original = await requireOwnedTask(db, spaceId, taskId, memberId);
  const version = input.updatedAt ?? input.expectedUpdatedAt!;
  // A distinct version is required even for two updates within one millisecond.
  const now = new Date(Math.max(Date.now(), Date.parse(original.updated_at) + 1)).toISOString();
  const update: Database["public"]["Tables"]["tasks"]["Update"] = { updated_at: now };
  if (input.title !== undefined) update.title = input.title;
  if (input.notes !== undefined) update.notes = input.notes;
  if (input.targetDate !== undefined) update.target_date = input.targetDate;
  if (input.completed !== undefined) { update.completed = input.completed; update.completed_at = input.completed ? original.completed_at ?? now : null; }
  const { data, error } = await db.from("tasks").update(update).eq("space_id", spaceId).eq("id", taskId).eq("creator_id", memberId).eq("updated_at", version).select("*").maybeSingle();
  if (error) throw error;
  if (!data) throw new DataApiError(ERROR_CODES.CONFLICT, "任务已更新，请刷新后重试", 409);
  return data;
}

export async function deleteTask(db: DataClient, spaceId: string, taskId: string, memberId: string, updatedAt: string) {
  await requireOwnedTask(db, spaceId, taskId, memberId);
  const { data, error } = await db.from("tasks").delete().eq("space_id", spaceId).eq("id", taskId).eq("creator_id", memberId).eq("updated_at", updatedAt).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new DataApiError(ERROR_CODES.CONFLICT, "任务已更新，请刷新后重试", 409);
}
