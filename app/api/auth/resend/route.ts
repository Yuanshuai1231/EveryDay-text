import { NextRequest } from "next/server";
import { isCloudAuth, resendLocal, resendCloud } from "@/lib/auth/email-auth";
import { MailDeliveryError } from "@/lib/auth/mail-delivery";
import { authRequestGuard, rateLimitedResponse } from "@/lib/auth/request";
import {
  AccountExistsError,
  EmailCodeCooldownError,
  EmailVerificationInputError,
} from "@/lib/auth/email-code";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    const guard = authRequestGuard(request, email);
    if (!guard.allowed)
      return guard.status === 429
        ? rateLimitedResponse(guard.retryAfter)
        : Response.json(
            { error: { code: "FORBIDDEN", message: "请求来源不允许" } },
            { status: 403 },
          );
    const result = isCloudAuth()
      ? await resendCloud(email)
      : await resendLocal(email);
    return Response.json(result);
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
    if (error instanceof EmailVerificationInputError)
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
          code: "REQUEST_FAILED",
          message: "请求处理失败，请稍后重试。",
        },
      },
      { status: 503 },
    );
  }
}
