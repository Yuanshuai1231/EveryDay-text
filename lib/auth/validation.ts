import { z } from "zod";

const INVALID_TEXT = /[\u0000-\u001F\u007F<>]/u;

function textSchema(max: number) {
  return z.string().transform((value) => value.trim()).superRefine((value, ctx) => {
    const length = Array.from(value).length;
    if (length < 1 || length > max) ctx.addIssue({ code: z.ZodIssueCode.too_small, minimum: 1, inclusive: true, origin: "string", message: `must be 1-${max} characters` });
    if (INVALID_TEXT.test(value)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "control or HTML characters are not allowed" });
  });
}

export const nicknameSchema = textSchema(24);
export const spaceNameSchema = textSchema(48);
export const inviteSchema = z.string().regex(/^[A-Z0-9]{8}$/u, "invalid invite code");

export const createSpaceSchema = z.object({ name: spaceNameSchema, nickname: nicknameSchema, timezone: z.string().trim().min(1).max(64).optional() });
export const joinSpaceSchema = z.object({ inviteCode: inviteSchema, nickname: nicknameSchema });

export const ERROR_CODES = {
  INVALID_INPUT: "INVALID_INPUT",
  INVALID_INVITE: "INVALID_INVITE",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  RATE_LIMITED: "RATE_LIMITED",
  CONFLICT: "CONFLICT",
  CREATOR_TRANSFER_REQUIRED: "CREATOR_TRANSFER_REQUIRED",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export function errorResponse(code: ErrorCode, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}
