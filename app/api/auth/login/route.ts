import { NextRequest } from "next/server";
import { isCloudAuth, loginCloud, loginLocal } from "@/lib/auth/email-auth";
import { accountCookieHeader, accountPublic } from "@/lib/auth/accounts";
import { authRequestGuard, rateLimitedResponse } from "@/lib/auth/request";

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
      ? await loginCloud(body)
      : await loginLocal(body);
    if (!result)
      return Response.json(
        { error: { code: "UNAUTHORIZED", message: "邮箱或密码不正确" } },
        { status: 401 },
      );
    if ("unverified" in result)
      return Response.json(
        {
          error: { code: "UNVERIFIED", message: "请先验证邮箱" },
          requiresVerification: true,
        },
        { status: 401 },
      );
    const response = Response.json({
      user: accountPublic(result.account as Record<string, unknown>),
      spaceId: null,
    });
    response.headers.set("cache-control", "no-store");
    response.headers.append(
      "set-cookie",
      accountCookieHeader(result.token, result.expiresAt),
    );
    return response;
  } catch {
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "邮箱或密码不正确" } },
      { status: 401 },
    );
  }
}
