import { NextRequest } from "next/server";
import { accountCookieHeader, accountPublic } from "@/lib/auth/accounts";
import { authRequestGuard, rateLimitedResponse } from "@/lib/auth/request";
import {
  isCloudAuth,
  normalizeEmail,
  validEmail,
  verifyCloudEmailCode,
} from "@/lib/auth/email-auth";
import { validEmailCode, verifyLocalEmailCode } from "@/lib/auth/email-code";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = normalizeEmail(body.email);
    const code = typeof body.code === "string" ? body.code : "";
    const guard = authRequestGuard(request, email, "verify-email");
    if (!guard.allowed)
      return guard.status === 429
        ? rateLimitedResponse(guard.retryAfter)
        : Response.json(
            { error: { code: "FORBIDDEN", message: "请求来源不允许" } },
            { status: 403 },
          );
    if (!validEmail(email) || !validEmailCode(code))
      return Response.json(
        { error: { code: "INVALID_CODE", message: "验证码无效或已过期" } },
        { status: 400 },
      );
    const session = isCloudAuth()
      ? await verifyCloudEmailCode(email, code)
      : await verifyLocalEmailCode(email, code);
    if (!session)
      return Response.json(
        { error: { code: "INVALID_CODE", message: "验证码无效或已过期" } },
        { status: 400 },
      );
    const response = Response.json({
      user: accountPublic(session.account),
      spaceId: null,
    });
    response.headers.set("cache-control", "no-store");
    response.headers.append(
      "set-cookie",
      accountCookieHeader(session.token, session.expiresAt),
    );
    return response;
  } catch {
    return Response.json(
      { error: { code: "INVALID_CODE", message: "验证码无效或已过期" } },
      { status: 400 },
    );
  }
}
