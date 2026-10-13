// @vitest-environment node
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { applyMigrations } from "@/lib/local/database";
import { makeLocalFetch } from "@/lib/local/fetch";

const state = vi.hoisted(() => ({
  client: null as unknown,
  factory: undefined as (() => unknown) | undefined,
  sendMail: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () =>
    state.factory ? state.factory() : state.client,
}));
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail: state.sendMail }) },
}));
let db: PGlite;
let sequence = 0;
const email = () => `otp-${++sequence}@example.com`;
const transport = () =>
  createClient("http://email-code.test", "test", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: makeLocalFetch(async () => db) },
  });

beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await applyMigrations(db);
}, 60000);
beforeEach(async () => {
  vi.stubEnv("CHECKIN_STORAGE", "local");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost");
  vi.stubEnv("CHECKIN_MAIL_TRANSPORT", "smtp");
  vi.stubEnv("MAIL_SMTP_HOST", "smtp.qq.com");
  vi.stubEnv("MAIL_SMTP_PORT", "465");
  vi.stubEnv("MAIL_SMTP_SECURE", "true");
  vi.stubEnv("MAIL_SMTP_USER", "sender@qq.com");
  vi.stubEnv("MAIL_SMTP_PASSWORD", "test-only");
  vi.stubEnv("MAIL_FROM", "sender@qq.com");
  state.factory = undefined;
  state.client = transport();
  state.sendMail.mockReset();
  state.sendMail.mockImplementation(async ({ to }: { to: string }) => ({
    accepted: [to],
    rejected: [],
  }));
  await db.exec("TRUNCATE app_accounts CASCADE");
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  await db?.close();
});
async function post(
  route: "register" | "resend" | "verify-email",
  body: unknown,
  origin = "http://localhost",
) {
  const handler =
    route === "register"
      ? await import("@/app/api/auth/register/route")
      : route === "resend"
        ? await import("@/app/api/auth/resend/route")
        : await import("@/app/api/auth/verify-email/route");
  return handler.POST(
    new NextRequest(`http://localhost/api/auth/${route}`, {
      method: "POST",
      headers: {
        origin,
        host: "localhost",
        "content-type": "application/json",
        "x-forwarded-for": `198.18.${Math.floor(sequence / 200)}.${(sequence % 200) + 1}`,
      },
      body: JSON.stringify(body),
    }),
  );
}
async function register(address: string) {
  return post("register", {
    email: address,
    nickname: "Original",
    password: "original-password-value",
  });
}
function latestCode() {
  const text = state.sendMail.mock.calls.at(-1)![0].text as string;
  return text.match(/验证码：([0-9]{6})/)![1];
}
async function releaseCooldown() {
  await db.exec(
    "UPDATE account_email_codes SET created_at=created_at-interval '61 seconds', delivered_at=delivered_at-interval '61 seconds'",
  );
}

describe("email verification code lifecycle", () => {
  it("sends six digits with a ten minute lifetime and exposes no code in the registration response", async () => {
    const address = email();
    const response = await register(address);
    const body = await response.json();
    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      requiresVerification: true,
      verificationMethod: "code",
      expiresIn: 600,
      resendAfter: 60,
      mailDelivery: "smtp",
    });
    const code = latestCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(JSON.stringify(body)).not.toContain(code);
    expect(body).not.toHaveProperty("devMailUrl");
    expect(response.headers.has("set-cookie")).toBe(false);
    const rows = await db.query<{
      code_digest: string;
      id: string;
      delivered_at: string;
      seconds: number;
    }>(
      "SELECT id,code_digest,delivered_at,extract(epoch from expires_at-delivered_at)::int seconds FROM account_email_codes",
    );
    expect(rows.rows[0].seconds).toBe(600);
    expect(rows.rows[0].code_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(rows.rows[0].code_digest).not.toContain(code);
  });
  it("verifies the matching email once and establishes only a public HttpOnly account session", async () => {
    const address = email();
    await register(address);
    const code = latestCode();
    const verified = await post("verify-email", {
      email: ` ${address.toUpperCase()} `,
      code,
    });
    expect(verified.status).toBe(200);
    expect(await verified.json()).toEqual({
      user: {
        id: expect.any(String),
        email: address,
        nickname: "Original",
        avatar_id: null,
      },
      spaceId: null,
    });
    expect(verified.headers.get("set-cookie")).toContain(
      "daily_account_session=",
    );
    expect(verified.headers.get("set-cookie")).toContain("HttpOnly");
    expect(verified.headers.get("set-cookie")).toContain("SameSite=Lax");
    expect(verified.headers.get("cache-control")).toBe("no-store");
    const replay = await post("verify-email", { email: address, code });
    expect(replay.status).toBe(400);
    expect(await replay.json()).toMatchObject({
      error: { code: "INVALID_CODE" },
    });
    expect(replay.headers.has("set-cookie")).toBe(false);
    expect(
      (await db.query("select id from account_sessions")).rows,
    ).toHaveLength(1);
  });
  it("persists each wrong attempt and rejects the correct code after five wrong attempts", async () => {
    const address = email();
    await register(address);
    const code = latestCode();
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 1; i <= 5; i++) {
      expect(
        (await post("verify-email", { email: address, code: wrong })).status,
      ).toBe(400);
      expect(
        (
          await db.query<{ attempts: number }>(
            "select attempts from account_email_codes",
          )
        ).rows[0].attempts,
      ).toBe(i);
    }
    const blocked = await post("verify-email", { email: address, code });
    expect(blocked.status).toBe(400);
    expect(blocked.headers.has("set-cookie")).toBe(false);
    expect(
      (await db.query("select id from account_sessions")).rows,
    ).toHaveLength(0);
  });
  it("rejects an expired code", async () => {
    const address = email();
    await register(address);
    const code = latestCode();
    await db.exec(
      "update account_email_codes set expires_at=now()-interval '1 second'",
    );
    expect((await post("verify-email", { email: address, code })).status).toBe(
      400,
    );
    expect(
      (await db.query("select id from account_sessions")).rows,
    ).toHaveLength(0);
  });
  it("does not verify a different email with a code", async () => {
    const address = email();
    await register(address);
    const code = latestCode();
    expect((await post("verify-email", { email: email(), code })).status).toBe(
      400,
    );
    expect(
      (
        await db.query<{ verified_at: unknown }>(
          "select verified_at from app_accounts",
        )
      ).rows[0].verified_at,
    ).toBeNull();
  });
  it("enforces a persistent sixty second cooldown with a Retry-After header", async () => {
    const address = email();
    await register(address);
    const response = await post("resend", { email: address });
    const body = await response.json();
    expect(response.status).toBe(429);
    expect(body).toMatchObject({
      error: { code: "RATE_LIMITED" },
      retryAfter: expect.any(Number),
    });
    expect(body.retryAfter).toBeGreaterThan(0);
    expect(body.retryAfter).toBeLessThanOrEqual(60);
    expect(response.headers.get("retry-after")).toBe(String(body.retryAfter));
    expect(state.sendMail).toHaveBeenCalledTimes(1);
  });
  it("replaces the old code only when the replacement email has been accepted", async () => {
    const address = email();
    await register(address);
    const oldCode = latestCode();
    await releaseCooldown();
    expect((await post("resend", { email: address })).status).toBe(200);
    const code = latestCode();
    // The digest is salted by a different challenge even if the random digits repeat.
    const rows = (
      await db.query<{ used_at: unknown; delivered_at: unknown }>(
        "select used_at,delivered_at from account_email_codes order by created_at",
      )
    ).rows;
    expect(rows[0].used_at).not.toBeNull();
    expect(rows[1].delivered_at).not.toBeNull();
    if (oldCode !== code)
      expect(
        (await post("verify-email", { email: address, code: oldCode })).status,
      ).toBe(400);
    expect((await post("verify-email", { email: address, code })).status).toBe(
      200,
    );
  });
  it("keeps the previously delivered code usable when a resend fails", async () => {
    const address = email();
    await register(address);
    const code = latestCode();
    await releaseCooldown();
    state.sendMail.mockRejectedValueOnce({ code: "ECONNECTION" });
    const failed = await post("resend", { email: address });
    expect(failed.status).toBe(503);
    expect(await failed.json()).toMatchObject({
      error: { code: "MAIL_CONNECTION_ERROR" },
    });
    const canceled = await db.query(
      "select id from account_email_codes where canceled_at is not null",
    );
    expect(canceled.rows).toHaveLength(1);
    expect((await post("verify-email", { email: address, code })).status).toBe(
      200,
    );
  });
  it("releases a failed initial send so retry can immediately succeed", async () => {
    const address = email();
    state.sendMail.mockRejectedValueOnce({ code: "EAUTH" });
    expect((await register(address)).status).toBe(503);
    expect((await register(address)).status).toBe(202);
    expect(
      (await post("verify-email", { email: address, code: latestCode() }))
        .status,
    ).toBe(200);
  });
  it("lets a fresh challenge succeed after the previous challenge exhausted its attempts", async () => {
    const address = email();
    await register(address);
    const firstCode = latestCode();
    const wrong = firstCode === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++)
      expect(
        (await post("verify-email", { email: address, code: wrong })).status,
      ).toBe(400);
    expect(
      (await post("verify-email", { email: address, code: firstCode })).status,
    ).toBe(400);
    await releaseCooldown();
    expect((await post("resend", { email: address })).status).toBe(200);
    expect(
      (await post("verify-email", { email: address, code: latestCode() }))
        .status,
    ).toBe(200);
  });
  it("keeps a pending challenge unusable until SMTP accepts it", async () => {
    const address = email();
    let release: (() => void) | undefined;
    state.sendMail.mockImplementationOnce(
      ({ to }: { to: string }) =>
        new Promise((resolve) => {
          release = () => resolve({ accepted: [to], rejected: [] });
        }),
    );
    const sending = register(address);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    const code = latestCode();
    expect((await post("verify-email", { email: address, code })).status).toBe(
      400,
    );
    expect(
      (await db.query("select id from account_sessions")).rows,
    ).toHaveLength(0);
    release!();
    expect((await sending).status).toBe(202);
    expect((await post("verify-email", { email: address, code })).status).toBe(
      200,
    );
  });
  it("accepts the older delivered code while a replacement SMTP send is pending", async () => {
    const address = email();
    await register(address);
    const oldCode = latestCode();
    await releaseCooldown();
    let release: (() => void) | undefined;
    state.sendMail.mockImplementationOnce(
      ({ to }: { to: string }) =>
        new Promise((resolve) => {
          release = () => resolve({ accepted: [to], rejected: [] });
        }),
    );
    const resending = post("resend", { email: address });
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    expect(
      (await post("verify-email", { email: address, code: oldCode })).status,
    ).toBe(200);
    release!();
    expect((await resending).status).toBe(503);
    expect(
      (await db.query("select id from account_sessions")).rows,
    ).toHaveLength(1);
  });
  it("reserves just one replacement send under concurrent resend requests", async () => {
    const address = email();
    await register(address);
    await releaseCooldown();
    const responses = await Promise.all([
      post("resend", { email: address }),
      post("resend", { email: address }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 429]);
    expect(state.sendMail).toHaveBeenCalledTimes(2);
  });
  it("atomically persists five concurrent wrong attempts without accepting a sixth", async () => {
    const address = email();
    await register(address);
    const code = latestCode();
    const wrong = code === "000000" ? "111111" : "000000";
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        post("verify-email", { email: address, code: wrong }),
      ),
    );
    expect(responses.every((r) => r.status === 400)).toBe(true);
    expect(
      (
        await db.query<{ attempts: number }>(
          "select attempts from account_email_codes",
        )
      ).rows[0].attempts,
    ).toBe(5);
    expect((await post("verify-email", { email: address, code })).status).toBe(
      400,
    );
  });
  it("allows only one concurrent consumption of a code", async () => {
    const address = email();
    await register(address);
    const code = latestCode();
    const responses = await Promise.all([
      post("verify-email", { email: address, code }),
      post("verify-email", { email: address, code }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(
      (await db.query("select id from account_sessions")).rows,
    ).toHaveLength(1);
  });
  it("refuses verified registration and resends with a useful login message", async () => {
    const address = email();
    await register(address);
    await post("verify-email", { email: address, code: latestCode() });
    for (const response of [
      await register(address),
      await post("resend", { email: address }),
    ]) {
      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error.code).toBe("ACCOUNT_EXISTS");
      expect(body.error.message).toContain("直接登录");
      expect(body).not.toHaveProperty("mailDelivery");
    }
    expect(state.sendMail).toHaveBeenCalledTimes(1);
  });
  it("never claims a code was sent for an invalid address or an unregistered email", async () => {
    for (const [address, errorCode] of [
      ["bad-address", "INVALID_INPUT"],
      [email(), "REGISTRATION_REQUIRED"],
    ]) {
      const response = await post("resend", { email: address });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: errorCode },
      });
    }
    expect(state.sendMail).not.toHaveBeenCalled();
  });
  it("rejects malformed codes and hostile origins before consuming attempts", async () => {
    const address = email();
    await register(address);
    const code = latestCode();
    expect(
      (await post("verify-email", { email: address, code: "12345a" })).status,
    ).toBe(400);
    expect(
      (
        await post(
          "verify-email",
          { email: address, code },
          "https://evil.example",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await db.query<{ attempts: number }>(
          "select attempts from account_email_codes",
        )
      ).rows[0].attempts,
    ).toBe(0);
  });
  it("denies anonymous and authenticated access to code records and privileged RPCs", async () => {
    const address = email();
    await register(address);
    for (const role of ["anon", "authenticated"]) {
      await expect(
        db.transaction(async (tx) => {
          await tx.exec(`SET LOCAL ROLE ${role}`);
          return tx.query("select * from account_email_codes");
        }),
      ).rejects.toThrow(/permission denied/);
      await expect(
        db.transaction(async (tx) => {
          await tx.exec(`SET LOCAL ROLE ${role}`);
          return tx.query(
            "select reserve_account_email_code(gen_random_uuid(),gen_random_uuid(),$1)",
            ["a".repeat(64)],
          );
        }),
      ).rejects.toThrow(/permission denied/);
    }
  });
});

describe("cloud email code provider boundary", () => {
  it.each([
    { status: 429 },
    { code: "over_email_send_rate_limit" },
    { code: "over_request_rate_limit" },
  ])("reports provider resend rate limits as cooldowns: %j", async (error) => {
    const address = email();
    vi.stubEnv("CHECKIN_STORAGE", "supabase");
    await db.query(
      "insert into app_accounts(email,nickname,auth_provider) values($1,'Pending','supabase')",
      [address],
    );
    state.factory = () => {
      const dbClient = transport();
      return {
        from: dbClient.from.bind(dbClient),
        auth: { resend: async () => ({ error }) },
      };
    };
    const response = await post("resend", { email: address });
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      error: { code: "RATE_LIMITED" },
      retryAfter: 60,
    });
    expect(response.headers.get("retry-after")).toBe("60");
  });
  it("does not ask the provider to send a code for an unregistered email", async () => {
    vi.stubEnv("CHECKIN_STORAGE", "supabase");
    const resend = vi.fn();
    state.factory = () => {
      const dbClient = transport();
      return { from: dbClient.from.bind(dbClient), auth: { resend } };
    };
    const response = await post("resend", { email: email() });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "REGISTRATION_REQUIRED" },
    });
    expect(resend).not.toHaveBeenCalled();
  });
  it("uses the email OTP API and a fresh privileged client to establish the custom session", async () => {
    const address = email();
    const id = "30000000-0000-4000-8000-000000000001";
    await db.query(
      "insert into app_accounts(id,email,nickname,auth_provider) values($1,$2,'Original','supabase')",
      [id, address],
    );
    vi.stubEnv("CHECKIN_STORAGE", "supabase");
    const verifyOtp = vi.fn(async (input: unknown) => {
      expect(input).toMatchObject({ email: address });
      return {
        data: {
          user: {
            id,
            email: address,
            email_confirmed_at: "2026-10-13T00:00:00Z",
          },
        },
        error: null,
      };
    });
    state.factory = () => {
      const dbClient = transport();
      let authorized = false;
      return {
        from: (table: string) => {
          if (authorized)
            throw new Error("User JWT used for privileged database access");
          return dbClient.from(table);
        },
        auth: {
          verifyOtp: async (input: unknown) => {
            authorized = true;
            return verifyOtp(input);
          },
        },
      };
    };
    const response = await post("verify-email", {
      email: address,
      code: "012345",
    });
    expect(response.status).toBe(200);
    expect(verifyOtp).toHaveBeenCalledWith({
      email: address,
      token: "012345",
      type: "email",
    });
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect((await response.json()).user.nickname).toBe("Original");
  });
  it.each(["wrong-email", "unverified", "provider-error"])(
    "does not establish a session for %s OTP results",
    async (scenario) => {
      const address = email();
      vi.stubEnv("CHECKIN_STORAGE", "supabase");
      state.factory = () => ({
        auth: {
          verifyOtp: async () => ({
            data: {
              user: {
                id: "30000000-0000-4000-8000-000000000002",
                email:
                  scenario === "wrong-email"
                    ? "different@example.com"
                    : address,
                email_confirmed_at:
                  scenario === "unverified" ? null : "2026-10-13T00:00:00Z",
              },
            },
            error:
              scenario === "provider-error"
                ? { message: "private provider details" }
                : null,
          }),
        },
      });
      const response = await post("verify-email", {
        email: address,
        code: "123456",
      });
      expect(response.status).toBe(400);
      expect(response.headers.has("set-cookie")).toBe(false);
      expect(JSON.stringify(await response.json())).not.toContain(
        "private provider details",
      );
      expect(
        (await db.query("select id from account_sessions")).rows,
      ).toHaveLength(0);
    },
  );
});
