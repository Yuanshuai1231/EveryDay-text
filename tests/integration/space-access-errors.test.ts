import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createSpace } from "@/app/api/spaces/route";
import { POST as joinSpace } from "@/app/api/spaces/join/route";

const database = vi.hoisted(() => ({
  rpc: vi.fn(),
  create: vi.fn(),
  setCookie: vi.fn(),
  requireAccount: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: database.create,
}));
vi.mock("@/lib/auth/accounts", () => ({
  requireAccount: database.requireAccount,
}));
vi.mock("@/lib/auth/rate-limit", () => ({
  joinRateLimiter: { check: () => ({ allowed: true }) },
  spaceCreateRateLimiter: { check: () => ({ allowed: true }) },
}));

function request(path: string, body: unknown) {
  return new Request(`https://checkin.example${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://checkin.example",
    },
    body: JSON.stringify(body),
  }) as never;
}

const handlers = [
  {
    name: "create",
    handle: createSpace,
    path: "/api/spaces",
    input: { name: "小组", nickname: "小熊" },
  },
  {
    name: "join",
    handle: joinSpace,
    path: "/api/spaces/join",
    input: { inviteCode: "AB12CD34", nickname: "小兔" },
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  database.create.mockReturnValue({ rpc: database.rpc });
  database.requireAccount.mockResolvedValue({
    user: {
      id: "account-a",
      email: "creator@example.test",
      nickname: "小熊",
      avatar_id: null,
    },
    session: {
      id: "session-a",
      account_id: "account-a",
      selected_space_id: null,
    },
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("space access database failures", () => {
  for (const handler of handlers) {
    it(`${handler.name}: returns a service error when a migration function is missing`, async () => {
      database.rpc.mockResolvedValue({
        data: null,
        error: {
          code: "PGRST202",
          message: "function not found in the schema cache",
        },
      });
      const response = await handler.handle(
        request(handler.path, handler.input),
      );
      expect(response.status).toBe(503);
      expect((await response.json()).error.code).toBe("INTERNAL");
      expect(database.setCookie).not.toHaveBeenCalled();
    });

    it(`${handler.name}: catches missing server configuration without exposing it`, async () => {
      database.create.mockImplementation(() => {
        throw new Error("secret-server-configuration");
      });
      const response = await handler.handle(
        request(handler.path, handler.input),
      );
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain(
        "secret-server-configuration",
      );
      expect(database.setCookie).not.toHaveBeenCalled();
    });

    it(`${handler.name}: catches connection failures`, async () => {
      database.rpc.mockRejectedValue(new Error("connection failed"));
      const response = await handler.handle(
        request(handler.path, handler.input),
      );
      expect(response.status).toBe(503);
      expect(database.setCookie).not.toHaveBeenCalled();
    });

    it(`${handler.name}: keeps the current account session after a successful database transaction`, async () => {
      database.rpc.mockResolvedValue({
        data: [{ space_id: "space-a", member_id: "member-a" }],
        error: null,
      });
      const response = await handler.handle(
        request(handler.path, handler.input),
      );
      expect(response.status).toBe(201);
      expect(database.setCookie).not.toHaveBeenCalled();
    });
  }

  it("keeps the invalid invitation response for a database-confirmed invalid code", async () => {
    database.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "invalid invite" },
    });
    const response = await joinSpace(
      request("/api/spaces/join", handlers[1].input),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_INVITE");
  });

  it("keeps nickname conflicts distinct from database failures", async () => {
    database.rpc.mockResolvedValue({
      data: null,
      error: {
        code: "23505",
        message:
          'duplicate key violates unique constraint "members_active_nickname_unique"',
      },
    });
    const response = await joinSpace(
      request("/api/spaces/join", handlers[1].input),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("CONFLICT");
  });
});
