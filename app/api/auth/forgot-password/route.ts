import { NextRequest } from "next/server";
import {
  isCloudAuth,
  requestResetLocal,
  requestResetCloud,
  GENERIC_MESSAGE,
} from "@/lib/auth/email-auth";
import { MailDeliveryError, mailResponseInfo } from "@/lib/auth/mail-delivery";
import { authRequestGuard, rateLimitedResponse } from "@/lib/auth/request";

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
      ? await requestResetCloud(email)
      : await requestResetLocal(email);
    return Response.json(
      result ?? { message: GENERIC_MESSAGE, ...mailResponseInfo("supabase") },
    );
  } catch (error) {
    if (error instanceof MailDeliveryError)
      return Response.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
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
