import { NextRequest } from "next/server";
import { resetLocal, resetCloud, isCloudAuth } from "@/lib/auth/email-auth";
import { authRequestGuard, rateLimitedResponse } from "@/lib/auth/request";
import { cookies } from "next/headers";
import { RECOVERY_COOKIE } from "@/lib/auth/accounts";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const guard = authRequestGuard(request);
    if (!guard.allowed)
      return guard.status === 429
        ? rateLimitedResponse(guard.retryAfter)
        : Response.json(
            { error: { code: "FORBIDDEN", message: "请求来源不允许" } },
            { status: 403 },
          );
    const token = isCloudAuth()
      ? ((await cookies()).get(RECOVERY_COOKIE)?.value ?? "")
      : String(body.token ?? "");
    const ok = isCloudAuth()
      ? await resetCloud(token, body.password)
      : await resetLocal(token, body.password);
    if (!ok)
      return Response.json(
        { error: { code: "INVALID_INPUT", message: "重置链接已过期或无效" } },
        { status: 400 },
      );
    const response = Response.json({ message: "密码已更新，请用新密码登录" });
    response.headers.append(
      "set-cookie",
      `${RECOVERY_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );
    return response;
  } catch {
    return Response.json(
      { error: { code: "INVALID_INPUT", message: "重置链接已过期或无效" } },
      { status: 400 },
    );
  }
}
