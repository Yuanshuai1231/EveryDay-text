import { FixedWindowRateLimiter } from "./rate-limit";
import { hasSameOrigin } from "./origin";
import type { NextRequest } from "next/server";

const ipLimiter = new FixedWindowRateLimiter(30, 5 * 60_000);
const emailLimiter = new FixedWindowRateLimiter(6, 5 * 60_000);
const emailVerificationLimiter = new FixedWindowRateLimiter(30, 5 * 60_000);
export function authRequestGuard(
  request: NextRequest,
  email?: unknown,
  scope = "credentials",
) {
  if (!request.headers.get("origin"))
    return { allowed: false, status: 403, retryAfter: 0 };
  if (!hasSameOrigin(request))
    return { allowed: false, status: 403, retryAfter: 0 };
  const ip = (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0] ??
    "unknown"
  )
    .trim()
    .slice(0, 128);
  const ipCheck = ipLimiter.check(ip);
  if (!ipCheck.allowed)
    return { allowed: false, status: 429, retryAfter: ipCheck.retryAfter };
  if (typeof email === "string" && email.length <= 320) {
    const limiter =
      scope === "verify-email" ? emailVerificationLimiter : emailLimiter;
    const emailCheck = limiter.check(`${scope}:${email.trim().toLowerCase()}`);
    if (!emailCheck.allowed)
      return { allowed: false, status: 429, retryAfter: emailCheck.retryAfter };
  }
  return { allowed: true as const, status: 200, retryAfter: 0 };
}
export function rateLimitedResponse(retryAfter = 300) {
  return Response.json(
    {
      error: { code: "RATE_LIMITED", message: "操作较频繁，请稍后重试" },
      retryAfter,
    },
    { status: 429, headers: { "retry-after": String(retryAfter) } },
  );
}
