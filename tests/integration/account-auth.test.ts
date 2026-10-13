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
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { applyMigrations } from "@/lib/local/database";
import { makeLocalFetch } from "@/lib/local/fetch";
import type { Database } from "@/lib/supabase/types";

const state = vi.hoisted(() => ({
  client: null as unknown,
  accountToken: undefined as string | undefined,
  legacyToken: undefined as string | undefined,
  recoveryToken: undefined as string | undefined,
  factory: undefined as (() => unknown) | undefined,
  cookieSet: vi.fn(),
  sendMail: vi.fn(),
}));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({ sendMail: state.sendMail }),
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "daily_account_session" && state.accountToken !== undefined
        ? { value: state.accountToken }
        : name === "daily_member_session" && state.legacyToken
          ? { value: state.legacyToken }
          : name === "daily_account_recovery" && state.recoveryToken
            ? { value: state.recoveryToken }
            : undefined,
    set: state.cookieSet,
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () =>
    state.factory ? state.factory() : state.client,
}));

let db: PGlite;
let directory: string;
function client(): SupabaseClient<Database> {
  return createClient<Database>("http://account-auth.test", "local-test", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: makeLocalFetch(async () => db) },
  });
}

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "checkin-account-auth-"));
  process.env.CHECKIN_DATA_DIR = path.join(directory, "postgres");
  db = new PGlite();
  await db.waitReady;
  await applyMigrations(db);
}, 60000);
beforeEach(async () => {
  vi.stubEnv("CHECKIN_MAIL_TRANSPORT", "preview");
  vi.stubEnv("CHECKIN_STORAGE", "local");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost");
  state.sendMail.mockReset();
  state.sendMail.mockImplementation(async ({ to }: { to: string }) => ({
    accepted: [to],
    rejected: [],
  }));
  await db.exec(
    "TRUNCATE public.account_tokens, public.account_sessions, public.app_accounts, public.member_sessions, public.members, public.spaces CASCADE;",
  );
  state.client = client();
  state.accountToken = undefined;
  state.legacyToken = undefined;
  state.recoveryToken = undefined;
  state.factory = undefined;
  state.cookieSet.mockClear();
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  await db?.close();
  if (
    directory &&
    path.dirname(path.resolve(directory)) === path.resolve(tmpdir()) &&
    path.basename(directory).startsWith("checkin-account-auth-")
  )
    await rm(directory, { recursive: true, force: true });
});

function request(url: string, body: unknown, ip: string) {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      origin: "http://localhost",
      host: "localhost",
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}
async function post(path: string, body: unknown, ip: string) {
  const route =
    path === "register"
      ? await import("@/app/api/auth/register/route")
      : path === "login"
        ? await import("@/app/api/auth/login/route")
        : path === "verify-email"
          ? await import("@/app/api/auth/verify-email/route")
          : path === "reset-password"
            ? await import("@/app/api/auth/reset-password/route")
            : path === "forgot-password"
              ? await import("@/app/api/auth/forgot-password/route")
              : await import("@/app/api/auth/resend/route");
  return route.POST(request(`http://localhost/api/auth/${path}`, body, ip));
}

describe("account auth schema", () => {
  it("stores verified identities, sessions, and single-use tokens separately from member sessions", async () => {
    const tables = await db.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema='public'",
    );
    expect(tables.rows.map((row) => row.table_name)).toEqual(
      expect.arrayContaining([
        "app_accounts",
        "account_sessions",
        "account_tokens",
      ]),
    );
    const memberColumns = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema='public' and table_name='members'",
    );
    expect(memberColumns.rows.map((row) => row.column_name)).toContain(
      "account_id",
    );
  });
});

describe("local email account routes", () => {
  function smtp() {
    vi.stubEnv("CHECKIN_MAIL_TRANSPORT", "smtp");
    vi.stubEnv("MAIL_SMTP_HOST", "smtp.qq.com");
    vi.stubEnv("MAIL_SMTP_PORT", "465");
    vi.stubEnv("MAIL_SMTP_SECURE", "true");
    vi.stubEnv("MAIL_SMTP_USER", "sender@qq.com");
    vi.stubEnv("MAIL_SMTP_PASSWORD", "test-authorization-code");
    vi.stubEnv("MAIL_FROM", "sender@qq.com");
  }

  it("describes local preview generation truthfully and rejects unknown or premature resends", async () => {
    const registration = await post(
      "register",
      {
        email: "preview-response@example.com",
        nickname: "Preview",
        password: "long-enough-password",
      },
      "192.0.2.93",
    );
    const body = await registration.json();
    expect(body).toMatchObject({
      mailDelivery: "preview",
      devMailUrl: "/dev/mail",
    });
    expect(body.message).toContain("验证码已生成");
    expect(body.message).not.toContain("已发送");
    const known = await post(
      "resend",
      { email: "preview-response@example.com" },
      "192.0.2.94",
    );
    const unknown = await post(
      "resend",
      { email: "preview-unknown@example.com" },
      "192.0.2.95",
    );
    expect(known.status).toBe(429);
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toMatchObject({
      error: { code: "REGISTRATION_REQUIRED" },
    });
    const reset = await post(
      "forgot-password",
      { email: "preview-unknown2@example.com" },
      "192.0.2.96",
    );
    expect((await reset.json()).message).toContain("本地邮件已生成");
  });

  it.each(["a,b@example.com", `${"a".repeat(250)}@example.com`])(
    "rejects a non-single SMTP recipient before creating an account: %s",
    async (email) => {
      smtp();
      const response = await post(
        "register",
        {
          email,
          nickname: "Invalid",
          password: "long-enough-password",
        },
        email.startsWith("a,b") ? "192.0.2.91" : "192.0.2.92",
      );
      expect(response.status).toBe(400);
      expect((await db.query("select id from app_accounts")).rows).toHaveLength(
        0,
      );
      expect(
        (await db.query("select id from account_tokens")).rows,
      ).toHaveLength(0);
      expect(state.sendMail).not.toHaveBeenCalled();
    },
  );

  it("rejects missing SMTP configuration before creating an account", async () => {
    smtp();
    vi.stubEnv("MAIL_SMTP_PASSWORD", "");
    const response = await post(
      "register",
      {
        email: "missing-smtp@example.com",
        nickname: "Pending",
        password: "long-enough-password",
      },
      "192.0.2.81",
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "MAIL_CONFIGURATION_ERROR" },
    });
    expect((await db.query("select id from app_accounts")).rows).toHaveLength(
      0,
    );
    expect((await db.query("select id from account_tokens")).rows).toHaveLength(
      0,
    );
  });

  it("reports an SMTP failure and lets the same pending account retry without replacing its password", async () => {
    smtp();
    state.sendMail.mockRejectedValueOnce(
      Object.assign(
        new Error("535 secret authorization code and sender@qq.com"),
        { code: "EAUTH" },
      ),
    );
    const first = await post(
      "register",
      {
        email: "retry-smtp@example.com",
        nickname: "First",
        password: "original-password-value",
      },
      "192.0.2.82",
    );
    expect(first.status).toBe(503);
    const failure = await first.json();
    expect(failure.error.code).toBe("MAIL_AUTH_ERROR");
    expect(JSON.stringify(failure)).not.toContain("sender@qq.com");
    expect(JSON.stringify(failure)).not.toContain("535");
    const second = await post(
      "register",
      {
        email: "retry-smtp@example.com",
        nickname: "Changed",
        password: "replacement-password-value",
      },
      "192.0.2.83",
    );
    expect(second.status).toBe(202);
    expect(await second.json()).toMatchObject({ mailDelivery: "smtp" });
    expect(state.sendMail).toHaveBeenCalledTimes(2);
    const accounts = await db.query<{
      nickname: string;
      password_hash: string;
    }>("select nickname,password_hash from app_accounts");
    expect(accounts.rows).toHaveLength(1);
    expect(accounts.rows[0].nickname).toBe("First");
    const { verifyPassword } = await import("@/lib/auth/password");
    expect(
      await verifyPassword(
        "original-password-value",
        accounts.rows[0].password_hash,
      ),
    ).toBe(true);
    const outbox = await import("@/lib/auth/local-mail").then((m) =>
      m.listLocalMail(),
    );
    expect(
      outbox.filter((item) => item.to === "retry-smtp@example.com"),
    ).toHaveLength(0);
  });

  it("reports resend and reset transport failures instead of returning a sent message", async () => {
    smtp();
    await db.query(
      "insert into app_accounts(email,nickname) values('resend-smtp@example.com','Resend')",
    );
    await db.query(
      "insert into app_accounts(email,nickname,verified_at) values('reset-smtp@example.com','Reset',now())",
    );
    state.sendMail.mockRejectedValue(
      Object.assign(new Error("SMTP host private details"), {
        code: "ECONNECTION",
      }),
    );
    for (const [route, email, ip] of [
      ["resend", "resend-smtp@example.com", "192.0.2.84"],
      ["forgot-password", "reset-smtp@example.com", "192.0.2.85"],
    ]) {
      const response = await post(route, { email }, ip);
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        error: { code: "MAIL_CONNECTION_ERROR" },
      });
    }
  });

  it("checks SMTP configuration before lookup for both known and unknown resend addresses", async () => {
    smtp();
    vi.stubEnv("MAIL_SMTP_PASSWORD", "");
    await db.query(
      "insert into app_accounts(email,nickname) values('known-smtp@example.com','Known')",
    );
    const known = await post(
      "resend",
      { email: "known-smtp@example.com" },
      "192.0.2.86",
    );
    const unknown = await post(
      "resend",
      { email: "unknown-smtp@example.com" },
      "192.0.2.87",
    );
    expect(known.status).toBe(503);
    expect(unknown.status).toBe(503);
    expect(await unknown.json()).toEqual(await known.json());
    expect(state.sendMail).not.toHaveBeenCalled();
  });

  it("gives verified accounts a login message and asks unknown SMTP addresses to register", async () => {
    smtp();
    await db.query(
      "insert into app_accounts(email,nickname,verified_at) values('verified-smtp@example.com','Known',now())",
    );
    const verified = await post(
      "resend",
      { email: "verified-smtp@example.com" },
      "192.0.2.88",
    );
    const unknown = await post(
      "resend",
      { email: "unknown2-smtp@example.com" },
      "192.0.2.89",
    );
    expect(verified.status).toBe(409);
    expect(await verified.json()).toMatchObject({
      error: { code: "ACCOUNT_EXISTS" },
    });
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toMatchObject({
      error: { code: "REGISTRATION_REQUIRED" },
    });
    expect(state.sendMail).not.toHaveBeenCalled();
    const registration = await post(
      "register",
      {
        email: "verified-smtp@example.com",
        nickname: "Other",
        password: "long-enough-password",
      },
      "192.0.2.90",
    );
    const body = await registration.json();
    expect(registration.status).toBe(409);
    expect(body.error.code).toBe("ACCOUNT_EXISTS");
    expect(body).not.toHaveProperty("devMailUrl");
    expect(state.sendMail).not.toHaveBeenCalled();
  });

  it("registers a normalized account without a session and sends a generic verification response", async () => {
    const response = await post(
      "register",
      {
        email: " New.User@Example.com ",
        nickname: "New User",
        password: "long-enough-password",
      },
      "198.51.100.1",
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ requiresVerification: true });
    expect(response.headers.has("set-cookie")).toBe(false);
    const account = await db.query<{
      email: string;
      verified_at: string | null;
      password_hash: string;
    }>("select email,verified_at,password_hash from app_accounts");
    expect(account.rows[0].email).toBe("new.user@example.com");
    expect(account.rows[0].verified_at).toBeNull();
    expect(account.rows[0].password_hash).not.toContain("long-enough-password");
  });

  it("prevents login before verification and still accepts a previously issued verification link only once", async () => {
    await post(
      "register",
      {
        email: "verify@example.com",
        nickname: "Verify",
        password: "long-enough-password",
      },
      "198.51.100.2",
    );
    const blocked = await post(
      "login",
      { email: "verify@example.com", password: "long-enough-password" },
      "198.51.100.3",
    );
    expect(blocked.status).toBe(401);
    const accountId = (
      await db.query<{ id: string }>(
        "select id from app_accounts where email='verify@example.com'",
      )
    ).rows[0].id;
    const ticket = await import("@/lib/auth/accounts").then((m) =>
      m.issueAccountToken(accountId, "verify"),
    );
    const tokens = await db.query<{ token_digest: string; purpose: string }>(
      "select token_digest,purpose from account_tokens",
    );
    expect(tokens.rows[0].purpose).toBe("verify");
    const { GET } = await import("@/app/auth/confirm/route");
    const token = await import("@/lib/auth/token").then((m) => m.digestToken);
    const link = new URL(
      await import("@/lib/auth/local-mail").then((m) =>
        m.localMailUrl(ticket.token, "signup"),
      ),
    );
    const first = await GET(new NextRequest(link));
    expect(first.status).toBe(303);
    const raw = link.searchParams.get("token");
    expect(raw).toBeTruthy();
    expect(tokens.rows[0].token_digest).toBe(token(raw!));
    const replay = await GET(new NextRequest(link));
    expect(replay.status).toBe(303);
    expect(replay.headers.get("location")).toContain("authError=expired");
    expect(replay.headers.has("set-cookie")).toBe(false);
    const loggedIn = await post(
      "login",
      { email: "VERIFY@example.com", password: "long-enough-password" },
      "198.51.100.4",
    );
    expect(loggedIn.status).toBe(200);
    expect(loggedIn.headers.get("set-cookie")).toContain(
      "daily_account_session=",
    );
    expect(loggedIn.headers.get("set-cookie")).toContain("HttpOnly");
  }, 30000);

  it("ignores credential attempts from a hostile origin before creating state", async () => {
    const route = await import("@/app/api/auth/register/route");
    const response = await route.POST(
      new NextRequest("http://localhost/api/auth/register", {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          host: "localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "bad@example.com",
          nickname: "Bad",
          password: "long-enough-password",
        }),
      }),
    );
    expect(response.status).toBe(403);
    expect((await db.query("select id from app_accounts")).rows).toHaveLength(
      0,
    );
  });

  it("returns 404 for the development mail preview unless it is local and loopback", async () => {
    const { localMailPreviewAllowed } = await import("@/lib/auth/local-mail");
    expect(localMailPreviewAllowed("localhost:3000", false, false)).toBe(true);
    expect(localMailPreviewAllowed("127.0.0.1:3000", false, false)).toBe(true);
    expect(localMailPreviewAllowed("[::1]:3000", false, false)).toBe(true);
    expect(localMailPreviewAllowed("example.com", false, false)).toBe(false);
    expect(localMailPreviewAllowed("localhost:3000", true, false)).toBe(false);
    expect(localMailPreviewAllowed("localhost:3000", false, true)).toBe(false);
  });

  it("does not let anonymous users query authentication records through database privileges", async () => {
    await db.query(
      "insert into app_accounts(email,nickname,verified_at) values('private@example.com','Private',now())",
    );
    const rows = await db.transaction(async (tx) => {
      await tx.exec(
        "GRANT SELECT ON app_accounts TO anon; SET LOCAL ROLE anon",
      );
      return tx.query("select * from app_accounts");
    });
    expect(rows.rows).toHaveLength(0);
  });

  it("accepts an existing legacy token claim only when it belongs to the current account", async () => {
    // The transactional RPC is checked here independently from route wiring.
    const funcs = await db.query<{ proname: string }>(
      "select proname from pg_proc where pronamespace='public'::regnamespace",
    );
    expect(funcs.rows.map((row) => row.proname)).toContain(
      "claim_legacy_membership",
    );
  });

  it("does not overwrite the first password or nickname when an unverified email registers again", async () => {
    const first = await post(
      "register",
      {
        email: "same@example.com",
        nickname: "First",
        password: "first-password-value",
      },
      "198.51.100.12",
    );
    const second = await post(
      "register",
      {
        email: "same@example.com",
        nickname: "Intruder",
        password: "other-password-value",
      },
      "198.51.100.13",
    );
    expect(first.status).toBe(202);
    expect(second.status).toBe(429);
    expect(await second.json()).toMatchObject({
      error: { code: "RATE_LIMITED" },
    });
    const account = (
      await db.query<{ nickname: string; password_hash: string }>(
        "select nickname,password_hash from app_accounts",
      )
    ).rows[0];
    expect(account.nickname).toBe("First");
    const { verifyPassword } = await import("@/lib/auth/password");
    expect(
      await verifyPassword("first-password-value", account.password_hash),
    ).toBe(true);
    expect(
      await verifyPassword("other-password-value", account.password_hash),
    ).toBe(false);
  });

  it("does not verify an expired link", async () => {
    await post(
      "register",
      {
        email: "expired@example.com",
        nickname: "Expired",
        password: "long-enough-password",
      },
      "198.51.100.14",
    );
    const accountId = (
      await db.query<{ id: string }>(
        "select id from app_accounts where email='expired@example.com'",
      )
    ).rows[0].id;
    const ticket = await import("@/lib/auth/accounts").then((m) =>
      m.issueAccountToken(accountId, "verify"),
    );
    const url = await import("@/lib/auth/local-mail").then((m) =>
      m.localMailUrl(ticket.token, "signup"),
    );
    await db.exec("update account_tokens set expires_at='2000-01-01'");
    const { GET } = await import("@/app/auth/confirm/route");
    const response = await GET(new NextRequest(url));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("authError=expired");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(
      (
        await db.query<{ verified_at: string | null }>(
          "select verified_at from app_accounts",
        )
      ).rows[0].verified_at,
    ).toBeNull();
  });

  it("keeps the configured site origin in confirmation redirects when Next normalizes the request URL", async () => {
    const previous = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "http://127.0.0.1:3000";
    try {
      const { GET } = await import("@/app/auth/confirm/route");
      const invalid = await GET(
        new NextRequest(
          "http://localhost:3000/auth/confirm?token=unknown&type=signup",
          { headers: { host: "127.0.0.1:3000" } },
        ),
      );
      expect(invalid.headers.get("location")).toBe(
        "http://127.0.0.1:3000/?authError=expired",
      );
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = previous;
    }
  });

  it("suppresses legacy authentication when an invalid account cookie is present", async () => {
    const { digestToken } = await import("@/lib/auth/token");
    const token = "legacy-token-present";
    await db.query(
      "select * from create_space_with_member($1,$2,$3,$4,$5,$6)",
      [
        "Legacy",
        "Old",
        "Asia/Shanghai",
        "a".repeat(64),
        digestToken(token),
        "2099-01-01",
      ],
    );
    state.legacyToken = token;
    const { getCurrentSession } = await import("@/lib/auth/session");
    expect(
      await getCurrentSession(state.client as SupabaseClient),
    ).not.toBeNull();
    state.accountToken = "unknown-account-token";
    expect(await getCurrentSession(state.client as SupabaseClient)).toBeNull();
  });

  it("claims only the member proved by the old cookie and ignores a forged member id", async () => {
    const { digestToken } = await import("@/lib/auth/token");
    const accountId = (
      await db.query<{ id: string }>(
        "insert into app_accounts(email,nickname,verified_at) values('claim@example.com','Claim',now()) returning id",
      )
    ).rows[0].id;
    await db.query(
      "insert into account_sessions(account_id,token_digest,expires_at) values($1,$2,'2099-01-01')",
      [accountId, digestToken("account-claim-token")],
    );
    const actor = (
      await db.query<{ member_id: string }>(
        "select * from create_space_with_member($1,$2,$3,$4,$5,$6)",
        [
          "Legacy",
          "Claimable",
          "Asia/Shanghai",
          "a".repeat(64),
          digestToken("claimable-old-token"),
          "2099-01-01",
        ],
      )
    ).rows[0];
    await db.query(
      "insert into member_sessions(member_id,token_digest,expires_at) values($1,$2,'2099-01-01')",
      [actor.member_id, digestToken("second-old-token")],
    );
    const other = (
      await db.query<{ member_id: string }>(
        "select * from join_space_by_invite($1,$2,$3,$4)",
        [
          "a".repeat(64),
          "Other",
          digestToken("someone-elses-token"),
          "2099-01-01",
        ],
      )
    ).rows[0];
    state.accountToken = "account-claim-token";
    state.legacyToken = "claimable-old-token";
    const { POST } = await import("@/app/api/auth/claim-legacy/route");
    const claimed = await POST(
      request(
        "http://localhost/api/auth/claim-legacy",
        { memberId: other.member_id },
        "198.51.100.15",
      ),
    );
    expect(claimed.status).toBe(200);
    expect(
      (
        await db.query<{ account_id: string | null }>(
          "select account_id from members where id=$1",
          [other.member_id],
        )
      ).rows[0].account_id,
    ).toBeNull();
    expect(claimed.headers.get("set-cookie")).toContain(
      "daily_member_session=;",
    );
    const good = await POST(
      request(
        "http://localhost/api/auth/claim-legacy",
        { memberId: actor.member_id },
        "198.51.100.16",
      ),
    );
    expect(good.status).toBe(401);
    expect(
      (
        await db.query<{ account_id: string | null }>(
          "select account_id from members where id=$1",
          [actor.member_id],
        )
      ).rows[0].account_id,
    ).toBe(accountId);
    const { resolveSession } = await import("@/lib/auth/session");
    expect(
      await resolveSession("second-old-token", state.client as SupabaseClient),
    ).toBeNull();
    expect(
      (
        await db.query<{ revoked_at: string | null }>(
          "select revoked_at from member_sessions where member_id=$1",
          [actor.member_id],
        )
      ).rows.every((session) => session.revoked_at !== null),
    ).toBe(true);
    // Even a historical linked row left active cannot bypass account login.
    await db.query(
      "update member_sessions set revoked_at=null where token_digest=$1",
      [digestToken("second-old-token")],
    );
    expect(
      await resolveSession("second-old-token", state.client as SupabaseClient),
    ).toBeNull();
  });

  it("allows a reset link once, changes the password, and revokes all active account sessions", async () => {
    const register = await post(
      "register",
      {
        email: "reset@example.com",
        nickname: "Reset",
        password: "old-password-value",
      },
      "198.51.100.5",
    );
    expect(register.status).toBe(202);
    const outbox = await import("@/lib/auth/local-mail").then((m) =>
      m.listLocalMail(),
    );
    const code = outbox
      .find((mail) => mail.to === "reset@example.com")!
      .text.match(/验证码：([0-9]{6})/)![1];
    expect(
      (
        await post(
          "verify-email",
          { email: "reset@example.com", code },
          "198.51.100.19",
        )
      ).status,
    ).toBe(200);
    const login = await post(
      "login",
      { email: "reset@example.com", password: "old-password-value" },
      "198.51.100.6",
    );
    expect(login.status).toBe(200);
    const requestReset = await post(
      "forgot-password",
      { email: "reset@example.com" },
      "198.51.100.7",
    );
    expect(requestReset.status).toBe(200);
    expect(await requestReset.json()).toHaveProperty("devMailUrl", "/dev/mail");
    const latest = (
      await import("@/lib/auth/local-mail").then((m) => m.listLocalMail())
    ).find((mail) => mail.subject.startsWith("重置"))!;
    const token = new URL(latest.url!).searchParams.get("token")!;
    const first = await post(
      "reset-password",
      { token, password: "new-password-value" },
      "198.51.100.8",
    );
    expect(first.status).toBe(200);
    const sessions = await db.query<{ revoked_at: string | null }>(
      "select revoked_at from account_sessions",
    );
    expect(sessions.rows.length).toBeGreaterThanOrEqual(1);
    expect(sessions.rows.every((session) => session.revoked_at !== null)).toBe(
      true,
    );
    expect(
      (
        await post(
          "reset-password",
          { token, password: "third-password-value" },
          "198.51.100.9",
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await post(
          "login",
          { email: "reset@example.com", password: "old-password-value" },
          "198.51.100.10",
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await post(
          "login",
          { email: "reset@example.com", password: "new-password-value" },
          "198.51.100.11",
        )
      ).status,
    ).toBe(200);
  }, 30000);

  it("limits repeated attempts by email and clears every authentication cookie on logout", async () => {
    for (let i = 0; i < 6; i++) {
      const response = await post(
        "login",
        { email: "rate-limit@example.com", password: "unknown-password-value" },
        `203.0.113.${i + 1}`,
      );
      expect(response.status).toBe(401);
    }
    expect(
      (
        await post(
          "login",
          {
            email: "rate-limit@example.com",
            password: "unknown-password-value",
          },
          "203.0.113.8",
        )
      ).status,
    ).toBe(429);
    const { POST } = await import("@/app/api/auth/logout/route");
    const response = await POST(
      request("http://localhost/api/auth/logout", {}, "203.0.113.9"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(
      "daily_account_recovery=;",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "daily_account_session=;",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "daily_member_session=;",
    );
  });
});

describe("Supabase Auth provider boundary with isolated PostgreSQL", () => {
  it.each(["register", "resend", "forgot-password"])(
    "reports provider SMTP errors for %s without claiming success",
    async (route) => {
      vi.stubEnv("CHECKIN_STORAGE", "supabase");
      if (route === "resend")
        await db.query(
          "insert into app_accounts(email,nickname,auth_provider) values('provider-failure-resend@example.com','Provider','supabase')",
        );
      state.factory = () => {
        const transport = client();
        const failure = async () => ({
          data: { user: null },
          error: { message: "private SMTP secret", code: "unexpected_failure" },
        });
        return {
          from: transport.from.bind(transport),
          auth: {
            signUp: failure,
            resend: failure,
            resetPasswordForEmail: failure,
          },
        };
      };
      const response = await post(
        route,
        {
          email: `provider-failure-${route}@example.com`,
          nickname: "Provider",
          password: "long-enough-password",
        },
        route === "register"
          ? "192.0.2.101"
          : route === "resend"
            ? "192.0.2.102"
            : "192.0.2.103",
      );
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error.code).toBe("MAIL_DELIVERY_ERROR");
      expect(JSON.stringify(body)).not.toContain("private SMTP secret");
    },
  );

  it("does not mail an already verified cloud account during repeated registration", async () => {
    await db.query(
      "insert into app_accounts(email,nickname,verified_at,auth_provider) values('verified-provider@example.com','Verified',now(),'supabase')",
    );
    const resend = vi.fn(async () => ({ data: {}, error: null }));
    state.factory = () => {
      const transport = client();
      return { from: transport.from.bind(transport), auth: { resend } };
    };
    const { registerCloud } = await import("@/lib/auth/email-auth");
    await expect(
      registerCloud({
        email: "verified-provider@example.com",
        nickname: "Changed",
        password: "long-enough-password",
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_EXISTS", status: 409 });
    expect(resend).not.toHaveBeenCalled();
  });

  it("provides a resend affordance for the provider's unverified login response", async () => {
    state.factory = () => ({
      auth: {
        signInWithPassword: async () => ({
          data: { user: null },
          error: { code: "email_not_confirmed" },
        }),
      },
    });
    const { loginCloud } = await import("@/lib/auth/email-auth");
    expect(
      await loginCloud({
        email: "pending@example.com",
        password: "pending-password-value",
      }),
    ).toEqual({ unverified: true });
  });
  it("keeps the provider client separate from DB authorization and refuses repeated pending signup", async () => {
    const id = "20000000-0000-4000-8000-000000000001";
    const user = {
      id,
      email: "provider@example.com",
      email_confirmed_at: null as string | null,
      user_metadata: { nickname: "Provider" },
      identities: [{ id: "identity" }],
    };
    const signup = vi.fn(async () => ({
      data: { user, session: null },
      error: null,
    }));
    const resend = vi.fn(async () => ({ data: {}, error: null }));
    state.factory = () => {
      const transport = client();
      let userAuthorized = false;
      return {
        from: (table: string) => {
          if (userAuthorized)
            throw new Error("User JWT used for privileged DB query");
          return transport.from(table);
        },
        rpc: transport.rpc.bind(transport),
        auth: {
          signUp: signup,
          resend,
          signInWithPassword: async () => {
            userAuthorized = true;
            return {
              data: {
                user: { ...user, email_confirmed_at: "2026-10-13T00:00:00Z" },
              },
              error: null,
            };
          },
          admin: { getUserById: async () => ({ data: { user }, error: null }) },
        },
      };
    };
    const { registerCloud, loginCloud } = await import("@/lib/auth/email-auth");
    await registerCloud({
      email: user.email,
      nickname: "Provider",
      password: "original-password-value",
    });
    await registerCloud({
      email: user.email,
      nickname: "Intruder",
      password: "replacement-password-value",
    });
    expect(signup).toHaveBeenCalledTimes(1);
    expect(resend).toHaveBeenCalledTimes(1);
    const registered = (
      await db.query<{
        id: string;
        nickname: string;
        verified_at: string | null;
        password_hash: string | null;
      }>("select id,nickname,verified_at,password_hash from app_accounts")
    ).rows[0];
    expect(registered).toMatchObject({
      id,
      nickname: "Provider",
      verified_at: null,
      password_hash: null,
    });
    const result = await loginCloud({
      email: user.email,
      password: "original-password-value",
    });
    expect(result).toHaveProperty("token");
    expect(
      (
        await db.query<{ verified_at: string | null }>(
          "select verified_at from app_accounts",
        )
      ).rows[0].verified_at,
    ).not.toBeNull();
  });

  it("turns a recovery confirmation into only a single-use reset cookie and blocks replay", async () => {
    const id = "20000000-0000-4000-8000-000000000002";
    await db.query(
      "insert into app_accounts(id,email,nickname,auth_provider,verified_at) values($1,'recover@example.com','Recovery','supabase',now())",
      [id],
    );
    const updatePassword = vi.fn(async () => ({ data: {}, error: null }));
    state.factory = () => {
      const transport = client();
      let userAuthorized = false;
      return {
        from: (table: string) => {
          if (userAuthorized)
            throw new Error("User JWT used for privileged DB query");
          return transport.from(table);
        },
        rpc: transport.rpc.bind(transport),
        auth: {
          verifyOtp: async () => {
            userAuthorized = true;
            return {
              data: {
                user: {
                  id,
                  email: "recover@example.com",
                  email_confirmed_at: "2026-10-13T00:00:00Z",
                },
              },
              error: null,
            };
          },
          admin: { updateUserById: updatePassword },
        },
      };
    };
    process.env.CHECKIN_STORAGE = "supabase";
    try {
      const { GET } = await import("@/app/auth/confirm/route");
      const response = await GET(
        new NextRequest(
          "http://localhost/auth/confirm?token_hash=provider-hash&type=recovery",
        ),
      );
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        "http://localhost/reset-password",
      );
      const cookie = response.headers.get("set-cookie")!;
      expect(cookie).toContain("daily_account_recovery=");
      expect(cookie).not.toContain("daily_account_session");
      state.recoveryToken = cookie.split(";")[0].split("=")[1];
      const { POST } = await import("@/app/api/auth/reset-password/route");
      const reset = await POST(
        request(
          "http://localhost/api/auth/reset-password",
          { password: "new-provider-password" },
          "198.51.100.17",
        ),
      );
      expect(reset.status).toBe(200);
      expect(updatePassword).toHaveBeenCalledWith(id, {
        password: "new-provider-password",
      });
      expect(
        (
          await POST(
            request(
              "http://localhost/api/auth/reset-password",
              { password: "second-provider-password" },
              "198.51.100.18",
            ),
          )
        ).status,
      ).toBe(400);
      expect(updatePassword).toHaveBeenCalledTimes(1);
      expect(
        (await db.query("select id from account_sessions")).rows,
      ).toHaveLength(0);
    } finally {
      process.env.CHECKIN_STORAGE = "local";
    }
  });
});
