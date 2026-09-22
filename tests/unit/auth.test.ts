import { describe, expect, it, vi } from "vitest";
import { digestToken, generateInviteCode, generateToken } from "@/lib/auth/token";
import { inviteSchema, nicknameSchema, spaceNameSchema } from "@/lib/auth/validation";
import { FixedWindowRateLimiter } from "@/lib/auth/rate-limit";

describe("auth primitives", () => {
  it("trims Unicode nicknames and enforces 1-24 Unicode characters", () => {
    expect(nicknameSchema.parse("  张三  ")).toBe("张三");
    expect(() => nicknameSchema.parse(" ")).toThrow();
    expect(() => nicknameSchema.parse("a".repeat(25))).toThrow();
    expect(() => nicknameSchema.parse("a\u0000b")).toThrow();
    expect(() => nicknameSchema.parse("<b>name</b>")).toThrow();
  });

  it("validates space names and invite codes", () => {
    expect(spaceNameSchema.parse("  Team  ")).toBe("Team");
    expect(() => spaceNameSchema.parse("x".repeat(49))).toThrow();
    expect(inviteSchema.parse("AB12CD34")).toBe("AB12CD34");
    expect(() => inviteSchema.parse("ab12CD34")).toThrow();
    expect(() => inviteSchema.parse("AB12-CD3")).toThrow();
  });

  it("generates a token with at least 128 bits and stable digest", () => {
    const token = generateToken();
    expect(token.length).toBeGreaterThanOrEqual(22);
    expect(digestToken(token)).toBe(digestToken(token));
    expect(digestToken(token)).not.toBe(token);
  });

  it("generates exactly eight uppercase alphanumeric invite characters", () => {
    expect(generateInviteCode()).toMatch(/^[A-Z0-9]{8}$/);
  });

  it("enforces a fixed five minute window", () => {
    vi.useFakeTimers();
    const limiter = new FixedWindowRateLimiter(2, 300_000);
    expect(limiter.check("ip:code").allowed).toBe(true);
    expect(limiter.check("ip:code").allowed).toBe(true);
    expect(limiter.check("ip:code").allowed).toBe(false);
    vi.advanceTimersByTime(300_001);
    expect(limiter.check("ip:code").allowed).toBe(true);
    vi.useRealTimers();
  });
});
