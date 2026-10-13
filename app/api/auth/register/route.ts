import { NextRequest } from "next/server";
import {
  isCloudAuth,
  registerCloud,
  registerLocal,
} from "@/lib/auth/email-auth";
import { authRequestGuard, rateLimitedResponse } from "@/lib/auth/request";
import { MailDeliveryError } from "@/lib/auth/mail-delivery";
import {
  AccountExistsError,
  EmailCodeCooldownError,
} from "@/lib/auth/email-code";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const guard = authRequestGuard(request, body.email);
    if (!guard.allowed)
      return guard.status === 429
        ? rateLimitedResponse(guard.retryAfter)
        : Response.json(
            { error: { code: "FORBIDDEN", message: "请求来源不允许" } },
            { status: 403 },
          );
    const result = isCloudAuth()
      ? await registerCloud(body)
      : await registerLocal(body);
    return Response.json(result, { status: 202 });
  } catch (error) {
    if (error instanceof MailDeliveryError)
      return Response.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    if (error instanceof AccountExistsError)
      return Response.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    if (error instanceof EmailCodeCooldownError)
      return Response.json(
        {
          error: { code: "RATE_LIMITED", message: error.message },
          retryAfter: error.retryAfter,
        },
        { status: 429, headers: { "retry-after": String(error.retryAfter) } },
      );
    return Response.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: "请检查昵称、邮箱和密码，密码应为 8–128 个字符",
        },
      },
      { status: 400 },
    );
  }
}
