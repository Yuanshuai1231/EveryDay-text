import { NextRequest } from "next/server";
import { getCurrentAccount, revokeAccountSessions } from "@/lib/auth/accounts";
import { authRequestGuard, rateLimitedResponse } from "@/lib/auth/request";

export async function POST(request: NextRequest) {
  const guard = authRequestGuard(request);
  if (!guard.allowed)
    return guard.status === 429
      ? rateLimitedResponse(guard.retryAfter)
      : Response.json(
          { error: { code: "FORBIDDEN", message: "请求来源不允许" } },
          { status: 403 },
        );
  try {
    const account = await getCurrentAccount();
    if (account) await revokeAccountSessions(account.user.id);
  } catch {}
  const response = Response.json({ message: "已退出登录" });
  for (const name of [
    "daily_account_session",
    "daily_member_session",
    "daily_account_recovery",
  ])
    response.headers.append(
      "set-cookie",
      `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );
  return response;
}
