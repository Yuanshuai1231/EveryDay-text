import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PublicHomePage from "@/app/(public)/page";
import SpacesPage from "@/app/(public)/spaces/page";
import ResetPasswordPage from "@/app/(public)/reset-password/page";
import ForgotPasswordPage from "@/app/(public)/forgot-password/page";
import { SpaceShell } from "@/components/layout/SpaceShell";
import * as SpaceModule from "@/components/space/SpaceProvider";

vi.mock("@/components/space/SpaceProvider", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/space/SpaceProvider")>();
  return {
    ...actual,
    SpaceProvider: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    useSpace: vi.fn(),
  };
});

const push = vi.fn();
const searchIntent = vi.hoisted(() => ({ value: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(searchIntent.value),
  usePathname: () => "/s1",
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  push.mockReset();
  searchIntent.value = "";
});

async function registerAccount() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: "注册" }));
  await user.type(screen.getByLabelText("昵称"), "小芽");
  await user.type(screen.getByLabelText("邮箱"), "hello@example.com");
  await user.type(screen.getByLabelText("密码"), "password123");
  await user.type(screen.getByLabelText("确认密码"), "password123");
  await user.click(screen.getByRole("button", { name: "创建账号" }));
  return user;
}

async function loginAccount() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("邮箱"), "hello@example.com");
  await user.type(screen.getByLabelText("密码"), "password123");
  await user.click(screen.getByRole("button", { name: "登录并进入空间" }));
  return user;
}

function mailResult(mailDelivery = "smtp", devMailUrl?: string) {
  return {
    requiresVerification: true,
    verificationMethod: "code",
    expiresIn: 600,
    resendAfter: 60,
    mailDelivery,
    ...(devMailUrl ? { devMailUrl } : {}),
  };
}

function authResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function mockAccountRequests(
  responses: Record<string, ReturnType<typeof authResponse>>,
) {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url === "/api/session") return authResponse({ user: null });
    if (!responses[url]) throw new Error(`Missing response for ${url}`);
    return responses[url];
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function useCountdownClock() {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
}

describe("account entry", () => {
  it("submits email and password then enters my spaces", async () => {
    const fetchMock = mockAccountRequests({
      "/api/auth/login": authResponse({ user: { id: "u1" } }),
    });
    render(<PublicHomePage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("邮箱"), "hello@example.com");
    await user.type(screen.getByLabelText("密码"), "password123");
    await user.click(screen.getByRole("button", { name: "显示密码" }));
    expect(screen.getByLabelText("密码")).toHaveProperty("type", "text");
    await user.click(screen.getByRole("button", { name: "登录并进入空间" }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "hello@example.com",
          password: "password123",
        }),
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/spaces"));
  });

  it("offers code entry and immediate resend for an unverified login without claiming a send", async () => {
    mockAccountRequests({
      "/api/auth/login": authResponse(
        {
          requiresVerification: true,
          error: { code: "UNVERIFIED", message: "先验证邮箱" },
        },
        401,
      ),
    });
    render(<PublicHomePage />);
    await loginAccount();
    expect(screen.getByRole("heading", { name: "先验证邮箱" })).toBeTruthy();
    expect(screen.getByLabelText("验证码")).toBeTruthy();
    expect(screen.getByRole("status").textContent).not.toContain("已提交发送");
    expect(screen.getByRole("status").textContent).not.toContain("已生成");
    expect(screen.getByRole("button", { name: "发送验证码" })).toHaveProperty(
      "disabled",
      false,
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("validates registration password confirmation", async () => {
    mockAccountRequests({});
    render(<PublicHomePage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "注册" }));
    await user.type(screen.getByLabelText("昵称"), "小芽");
    await user.type(screen.getByLabelText("邮箱"), "hello@example.com");
    await user.type(screen.getByLabelText("密码"), "password123");
    await user.type(screen.getByLabelText("确认密码"), "different123");
    await user.click(screen.getByRole("button", { name: "创建账号" }));
    expect(screen.getByRole("alert").textContent).toContain(
      "两次输入的密码不一致",
    );
  });

  it("identifies local code previews without claiming inbox delivery", async () => {
    mockAccountRequests({
      "/api/auth/register": authResponse(mailResult("preview", "/dev/mail/1")),
    });
    render(<PublicHomePage />);
    await registerAccount();
    expect(screen.getByRole("heading", { name: "验证码已生成" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "当前使用本地邮件预览，验证码没有发送到真实邮箱。",
    );
    expect(screen.getByRole("status").textContent).not.toContain("已提交发送");
    expect(
      screen
        .getByRole("link", { name: "查看本地邮件预览" })
        .getAttribute("href"),
    ).toBe("/dev/mail/1");
  });

  it.each(["smtp", "supabase"])(
    "shows real code mail submission accurately (%s)",
    async (mailDelivery) => {
      mockAccountRequests({
        "/api/auth/register": authResponse(
          mailResult(mailDelivery, "/dev/mail/stale"),
        ),
      });
      render(<PublicHomePage />);
      await registerAccount();
      expect(
        screen.getByRole("heading", { name: "输入邮箱验证码" }),
      ).toBeTruthy();
      expect(screen.getByRole("status").textContent).toContain(
        "验证码邮件已提交发送，请检查收件箱和垃圾邮件。",
      );
      expect(
        screen.queryByRole("link", { name: "查看本地邮件预览" }),
      ).toBeNull();
      expect(push).not.toHaveBeenCalled();
    },
  );

  it("keeps registration retryable when code email submission fails", async () => {
    mockAccountRequests({
      "/api/auth/register": authResponse(
        {
          requiresVerification: true,
          error: {
            code: "MAIL_DELIVERY_FAILED",
            message: "验证邮件发送失败，请稍后重试。",
          },
        },
        503,
      ),
    });
    render(<PublicHomePage />);
    await registerAccount();
    expect(screen.getByRole("alert").textContent).toContain(
      "验证邮件发送失败，请稍后重试。",
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "创建账号" })).toHaveProperty(
      "disabled",
      false,
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("requires six numeric characters before verifying and preserves a leading zero", async () => {
    const fetchMock = mockAccountRequests({
      "/api/auth/register": authResponse(mailResult()),
      "/api/auth/verify-email": authResponse({
        user: { id: "u1" },
        spaceId: null,
      }),
    });
    render(<PublicHomePage />);
    const user = await registerAccount();
    const codeInput = screen.getByLabelText("验证码");
    const verifyButton = screen.getByRole("button", { name: "验证并进入空间" });
    expect(codeInput.getAttribute("inputmode")).toBe("numeric");
    expect(codeInput.getAttribute("autocomplete")).toBe("one-time-code");
    expect(codeInput).toHaveProperty("maxLength", 6);
    expect(codeInput.getAttribute("pattern")).toBe("[0-9]{6}");
    expect(screen.getByRole("status").textContent).toContain("10 分钟内有效");
    expect(screen.getByRole("status").textContent).toContain(
      "hello@example.com",
    );
    expect(verifyButton).toHaveProperty("disabled", true);
    await user.type(codeInput, "01234");
    await user.click(verifyButton);
    fireEvent.submit(codeInput.closest("form")!);
    expect(
      fetchMock.mock.calls.some(([url]) => url === "/api/auth/verify-email"),
    ).toBe(false);
    await user.clear(codeInput);
    await user.type(codeInput, "01A456");
    expect(verifyButton).toHaveProperty("disabled", true);
    await user.clear(codeInput);
    await user.type(codeInput, "012345");
    expect(codeInput).toHaveProperty("value", "012345");
    expect(verifyButton).toHaveProperty("disabled", false);
    await user.click(verifyButton);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/verify-email",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "hello@example.com", code: "012345" }),
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/spaces"));
  });

  it("keeps wrong codes on the verification panel and permits another attempt", async () => {
    mockAccountRequests({
      "/api/auth/register": authResponse(mailResult()),
      "/api/auth/verify-email": authResponse(
        {
          error: {
            code: "INVALID_CODE",
            message: "验证码无效或已过期，请重新申请。",
          },
        },
        400,
      ),
    });
    render(<PublicHomePage />);
    const user = await registerAccount();
    await user.type(screen.getByLabelText("验证码"), "111111");
    await user.click(screen.getByRole("button", { name: "验证并进入空间" }));
    expect(screen.getByRole("alert").textContent).toContain(
      "验证码无效或已过期",
    );
    expect(screen.getByLabelText("验证码")).toHaveProperty("value", "111111");
    expect(
      screen.getByRole("button", { name: "验证并进入空间" }),
    ).toHaveProperty("disabled", false);
    expect(push).not.toHaveBeenCalled();
  });

  it.each(["", "join=1"])(
    "enters spaces only after code verification and preserves the entry intent (%s)",
    async (query) => {
      searchIntent.value = query;
      mockAccountRequests({
        "/api/auth/register": authResponse(mailResult()),
        "/api/auth/verify-email": authResponse({
          user: { id: "u1", email: "hello@example.com", nickname: "小芽" },
          spaceId: null,
        }),
      });
      render(<PublicHomePage />);
      const user = await registerAccount();
      expect(push).not.toHaveBeenCalled();
      await user.type(screen.getByLabelText("验证码"), "123456");
      await user.click(screen.getByRole("button", { name: "验证并进入空间" }));
      await waitFor(() =>
        expect(push).toHaveBeenCalledWith(query ? "/spaces?join=1" : "/spaces"),
      );
    },
  );

  it("does not enter spaces if registration returns no verification requirement", async () => {
    mockAccountRequests({
      "/api/auth/register": authResponse({ user: { id: "u1" } }),
    });
    render(<PublicHomePage />);
    await registerAccount();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("邮箱验证");
  });

  it("starts a 60 second countdown only after registration or resend succeeds", async () => {
    useCountdownClock();
    const fetchMock = mockAccountRequests({
      "/api/auth/register": authResponse(mailResult()),
      "/api/auth/resend": authResponse(mailResult()),
    });
    render(<PublicHomePage />);
    const user = await registerAccount();
    const initialResend = screen.getByRole("button", {
      name: "60 秒后可重新发送验证码",
    });
    expect(initialResend).toHaveProperty("disabled", true);
    await user.click(initialResend);
    expect(
      fetchMock.mock.calls.some(([url]) => url === "/api/auth/resend"),
    ).toBe(false);
    act(() => vi.advanceTimersByTime(59000));
    expect(
      screen.getByRole("button", { name: "1 秒后可重新发送验证码" }),
    ).toHaveProperty("disabled", true);
    act(() => vi.advanceTimersByTime(1000));
    await user.type(screen.getByLabelText("验证码"), "000123");
    await user.click(screen.getByRole("button", { name: "重新发送验证码" }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/resend",
      expect.objectContaining({
        body: JSON.stringify({ email: "hello@example.com" }),
      }),
    );
    expect(
      screen.getByRole("button", { name: "60 秒后可重新发送验证码" }),
    ).toHaveProperty("disabled", true);
    expect(screen.getByLabelText("验证码")).toHaveProperty("value", "");
    expect(screen.getByRole("status").textContent).toContain(
      "验证码邮件已再次提交发送",
    );
  });

  it("updates resend delivery mode and removes the previous local preview", async () => {
    useCountdownClock();
    mockAccountRequests({
      "/api/auth/register": authResponse(mailResult("preview", "/dev/mail/1")),
      "/api/auth/resend": authResponse(mailResult("smtp")),
    });
    render(<PublicHomePage />);
    const user = await registerAccount();
    act(() => vi.advanceTimersByTime(60000));
    await user.click(screen.getByRole("button", { name: "重新生成验证码" }));
    expect(
      screen.getByRole("heading", { name: "输入邮箱验证码" }),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: "查看本地邮件预览" })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain(
      "验证码邮件已再次提交发送",
    );
  });

  it("generates a preview and starts cooldown when sending after an unverified login", async () => {
    mockAccountRequests({
      "/api/auth/login": authResponse(
        { requiresVerification: true, error: { code: "UNVERIFIED" } },
        401,
      ),
      "/api/auth/resend": authResponse(mailResult("preview", "/dev/mail/2")),
    });
    render(<PublicHomePage />);
    const user = await loginAccount();
    await user.click(screen.getByRole("button", { name: "发送验证码" }));
    expect(screen.getByRole("heading", { name: "验证码已生成" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).not.toContain("已提交发送");
    expect(
      screen
        .getByRole("link", { name: "查看本地邮件预览" })
        .getAttribute("href"),
    ).toBe("/dev/mail/2");
    expect(
      screen.getByRole("button", { name: "60 秒后可重新发送验证码" }),
    ).toHaveProperty("disabled", true);
  });

  it("keeps an unverified login retryable after resend fails without claiming a send", async () => {
    mockAccountRequests({
      "/api/auth/login": authResponse(
        { requiresVerification: true, error: { code: "UNVERIFIED" } },
        401,
      ),
      "/api/auth/resend": authResponse(
        {
          error: {
            code: "MAIL_DELIVERY_FAILED",
            message: "验证邮件发送失败，请稍后重试。",
          },
        },
        503,
      ),
    });
    render(<PublicHomePage />);
    const user = await loginAccount();
    await user.click(screen.getByRole("button", { name: "发送验证码" }));
    expect(screen.getByRole("alert").textContent).toContain("验证邮件发送失败");
    expect(screen.getByRole("heading", { name: "先验证邮箱" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).not.toContain("已再次");
    expect(screen.getByRole("status").textContent).not.toContain("已提交发送");
    expect(screen.getByRole("button", { name: "发送验证码" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("preserves the current preview and input if a later resend fails", async () => {
    useCountdownClock();
    let resendAttempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (url === "/api/session") return authResponse({ user: null });
        if (url === "/api/auth/resend" && ++resendAttempts > 1)
          return authResponse(
            {
              error: {
                code: "MAIL_DELIVERY_FAILED",
                message: "验证邮件发送失败，请稍后重试。",
              },
            },
            503,
          );
        return authResponse(
          mailResult("preview", resendAttempts ? "/dev/mail/2" : "/dev/mail/1"),
        );
      }),
    );
    render(<PublicHomePage />);
    const user = await registerAccount();
    act(() => vi.advanceTimersByTime(60000));
    await user.click(screen.getByRole("button", { name: "重新生成验证码" }));
    expect(screen.getByRole("status").textContent).toContain(
      "验证码已重新生成",
    );
    act(() => vi.advanceTimersByTime(60000));
    await user.type(screen.getByLabelText("验证码"), "000123");
    await user.click(screen.getByRole("button", { name: "重新生成验证码" }));
    expect(screen.getByRole("alert").textContent).toContain("验证邮件发送失败");
    expect(screen.getByRole("status").textContent).not.toContain("已重新生成");
    expect(screen.getByLabelText("验证码")).toHaveProperty("value", "000123");
    expect(
      screen
        .getByRole("link", { name: "查看本地邮件预览" })
        .getAttribute("href"),
    ).toBe("/dev/mail/2");
    expect(
      screen.getByRole("button", { name: "重新生成验证码" }),
    ).toHaveProperty("disabled", false);
  });

  it("honors the server retryAfter countdown without claiming a resend succeeded", async () => {
    useCountdownClock();
    mockAccountRequests({
      "/api/auth/login": authResponse(
        { requiresVerification: true, error: { code: "UNVERIFIED" } },
        401,
      ),
      "/api/auth/resend": authResponse(
        {
          retryAfter: 37,
          error: { code: "RATE_LIMITED", message: "请稍后再申请验证码。" },
        },
        429,
      ),
    });
    render(<PublicHomePage />);
    const user = await loginAccount();
    await user.click(screen.getByRole("button", { name: "发送验证码" }));
    expect(
      screen.getByRole("button", { name: "37 秒后可重新发送验证码" }),
    ).toHaveProperty("disabled", true);
    expect(screen.getByRole("status").textContent).not.toContain("已提交发送");
    expect(screen.getByRole("status").textContent).not.toContain("已生成");
    expect(screen.getByRole("alert").textContent).toContain(
      "请稍后再申请验证码",
    );
    act(() => vi.advanceTimersByTime(37000));
    expect(screen.getByRole("button", { name: "发送验证码" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it.each(["register", "resend"])(
    "switches an already verified account to login without a false send state (%s)",
    async (operation) => {
      mockAccountRequests({
        "/api/auth/register": authResponse(
          {
            error: {
              code: "ACCOUNT_EXISTS",
              message: "此邮箱已注册并验证，请直接登录",
            },
          },
          409,
        ),
        "/api/auth/login": authResponse(
          { requiresVerification: true, error: { code: "UNVERIFIED" } },
          401,
        ),
        "/api/auth/resend": authResponse(
          {
            error: {
              code: "ACCOUNT_EXISTS",
              message: "此邮箱已注册并验证，请直接登录",
            },
          },
          409,
        ),
      });
      render(<PublicHomePage />);
      if (operation === "register") await registerAccount();
      else {
        const user = await loginAccount();
        await user.click(screen.getByRole("button", { name: "发送验证码" }));
      }
      expect(screen.getByRole("alert").textContent).toContain(
        "此邮箱已注册并验证，请直接登录",
      );
      expect(
        screen.getByRole("tab", { name: "登录" }).getAttribute("aria-selected"),
      ).toBe("true");
      expect(screen.getByLabelText("邮箱")).toHaveProperty(
        "value",
        "hello@example.com",
      );
      expect(screen.queryByLabelText("验证码")).toBeNull();
      expect(screen.queryByRole("status")).toBeNull();
      expect(
        screen.getByRole("button", { name: "登录并进入空间" }),
      ).toHaveProperty("disabled", false);
      expect(push).not.toHaveBeenCalled();
    },
  );
});
describe("password recovery", () => {
  it.each(["smtp", "supabase", undefined])(
    "shows a recovery confirmation without revealing email membership (%s)",
    async (mailDelivery) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            message: "sent",
            mailDelivery,
            ...(mailDelivery ? { devMailUrl: "/dev/mail/stale" } : {}),
          }),
        }),
      );
      render(<ForgotPasswordPage />);
      const user = userEvent.setup();
      await user.type(screen.getByLabelText("邮箱"), "hello@example.com");
      await user.click(screen.getByRole("button", { name: "发送找回邮件" }));
      expect((await screen.findByRole("status")).textContent).toContain(
        "如果这个邮箱对应一个账号",
      );
      expect(screen.getByRole("status").textContent).toContain(
        "找回邮件已提交发送",
      );
      expect(screen.getByRole("status").textContent).toContain("垃圾邮件");
      expect(screen.getByRole("status").textContent).not.toContain("你会收到");
      expect(
        screen.queryByRole("link", { name: "查看本地邮件预览" }),
      ).toBeNull();
    },
  );

  it.each(["preview", undefined])(
    "identifies local password recovery previews without promising inbox delivery (%s)",
    async (mailDelivery) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ mailDelivery, devMailUrl: "/dev/mail/3" }),
        }),
      );
      render(<ForgotPasswordPage />);
      const user = userEvent.setup();
      await user.type(screen.getByLabelText("邮箱"), "hello@example.com");
      await user.click(screen.getByRole("button", { name: "发送找回邮件" }));
      expect((await screen.findByRole("status")).textContent).toContain(
        "当前使用本地邮件预览",
      );
      expect(screen.getByRole("status").textContent).toContain(
        "如果这个邮箱对应一个账号，找回邮件已在本地生成",
      );
      expect(screen.getByRole("status").textContent).toContain(
        "重置链接没有发送到真实邮箱",
      );
      expect(screen.getByRole("status").textContent).not.toContain("已发送");
      expect(screen.getByRole("status").textContent).not.toContain("你会收到");
      expect(
        screen
          .getByRole("link", { name: "查看本地邮件预览" })
          .getAttribute("href"),
      ).toBe("/dev/mail/3");
    },
  );

  it("keeps password recovery retryable after email submission fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({
          error: {
            code: "MAIL_DELIVERY_FAILED",
            message: "找回邮件发送失败，请稍后重试。",
          },
        }),
      }),
    );
    render(<ForgotPasswordPage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("邮箱"), "hello@example.com");
    await user.click(screen.getByRole("button", { name: "发送找回邮件" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "找回邮件发送失败，请稍后重试。",
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "发送找回邮件" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("shows password reset completion and waits for the user to return to login", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );
    render(<ResetPasswordPage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("新密码"), "newpassword123");
    await user.type(screen.getByLabelText("确认新密码"), "newpassword123");
    await user.click(screen.getByRole("button", { name: "保存新密码" }));
    expect((await screen.findByRole("status")).textContent).toContain(
      "密码已更新",
    );
    expect(screen.getByRole("link", { name: "返回登录" })).toBeTruthy();
  });
});

describe("spaces dashboard", () => {
  it("creates a space and shows its one-time invite code", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          spaces: [],
          user: { id: "u1", email: "a@b.com", nickname: "小芽" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ legacySpace: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          spaceId: "s1",
          memberId: "m1",
          inviteCode: "ABCD1234",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    render(<SpacesPage />);
    await waitFor(() => expect(screen.getByText("还没有空间")).toBeTruthy());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "创建空间" }));
    await user.type(screen.getByLabelText("空间名称"), "晨光组");
    await user.click(
      screen.getAllByRole("button", { name: "创建空间" }).at(-1)!,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/spaces",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("晨光组"),
      }),
    );
    expect(await screen.findByText("邀请码：ABCD1234")).toBeTruthy();
    const dialog = screen.getByRole("dialog");
    const enterButton = within(dialog).getByRole("button", {
      name: "走，进入空间",
    });
    expect(document.activeElement).toBe(enterButton);
    const copyButton = within(dialog).getByRole("button", {
      name: "复制邀请码",
    });
    copyButton.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(
      within(dialog).getByRole("button", { name: "关闭" }),
    );
  });

  it("joins using the invite code and selects that space", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          spaces: [],
          user: { id: "u1", email: "a@b.com", nickname: "小芽" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ legacySpace: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spaceId: "s2", memberId: "m2" }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SpacesPage />);
    await waitFor(() => expect(screen.getByText("还没有空间")).toBeTruthy());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "加入空间" }));
    await user.type(screen.getByLabelText("邀请码"), "ZXCV1234");
    await user.click(screen.getByRole("button", { name: "加入并进入" }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/spaces/join",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("ZXCV1234"),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/spaces/s2/select",
      expect.objectContaining({ method: "POST" }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/s2"));
  });

  it("refreshes the newly created space after closing the invite and opens a fresh create form", async () => {
    let created = false;
    const fetchMock = vi
      .fn()
      .mockImplementation(async (url: string, init?: RequestInit) => ({
        ok: true,
        json: async () => {
          if (url === "/api/session") return { legacySpace: null };
          if (init?.method === "POST") {
            created = true;
            return { spaceId: "s1", memberId: "m1", inviteCode: "ABCD1234" };
          }
          return {
            user: { id: "u1", email: "a@b.com", nickname: "小芽" },
            spaces: created
              ? [
                  {
                    id: "s1",
                    name: "晨光组",
                    avatar_id: "cat",
                    timezone: "Asia/Shanghai",
                    memberId: "m1",
                    role: "creator",
                    memberCount: 1,
                  },
                ]
              : [],
          };
        },
      }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SpacesPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "创建空间" }));
    await user.type(screen.getByLabelText("空间名称"), "晨光组");
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "创建空间",
      }),
    );
    expect(await screen.findByText("邀请码：ABCD1234")).toBeTruthy();
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "关闭" }),
    );
    expect(await screen.findByRole("heading", { name: "晨光组" })).toBeTruthy();
    expect(
      fetchMock.mock.calls.filter(
        ([url, init]) => url === "/api/spaces" && !init?.method,
      ),
    ).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "创建空间" }));
    expect(screen.getByLabelText("空间名称")).toHaveProperty("value", "");
    expect(screen.queryByText("邀请码：ABCD1234")).toBeNull();
  });

  it("claims only the legacy space returned for this old session", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          spaces: [],
          user: { id: "u1", email: "a@b.com", nickname: "小芽" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          legacySpace: { id: "old", name: "旧空间", nickname: "芽芽" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spaceId: "old" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          spaces: [],
          user: { id: "u1", email: "a@b.com", nickname: "小芽" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ legacySpace: null }),
      });
    vi.stubGlobal("fetch", fetchMock);
    render(<SpacesPage />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "绑定已有空间" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/claim-legacy",
      expect.objectContaining({ method: "POST" }),
    );
    expect(await screen.findByText("还没有空间")).toBeTruthy();
  });

  it("closes the join dialog with Escape and restores focus", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => ({
        ok: true,
        json: async () =>
          url === "/api/spaces"
            ? {
                spaces: [],
                user: { id: "u1", email: "a@b.com", nickname: "小芽" },
              }
            : { legacySpace: null },
      })),
    );
    render(<SpacesPage />);
    const user = userEvent.setup();
    const trigger = await screen.findByRole("button", { name: "加入空间" });
    await user.click(trigger);
    expect(document.activeElement).toBe(screen.getByLabelText("邀请码"));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("space deletion and leaving", () => {
  function dashboard(role: "creator" | "member", success = true) {
    const fetchMock = vi
      .fn()
      .mockImplementation(async (url: string, init?: RequestInit) => ({
        ok: !init?.method || success,
        status: success ? 200 : 403,
        json: async () =>
          init?.method
            ? success
              ? { ok: true }
              : { error: { message: "空间操作失败，请重试" } }
            : url === "/api/session"
              ? { legacySpace: null }
              : {
                  user: { id: "u1", email: "a@b.com", nickname: "小芽" },
                  spaces: [
                    {
                      id: "s1",
                      name: "晨光组",
                      timezone: "Asia/Shanghai",
                      memberId: "m1",
                      role,
                      memberCount: 2,
                    },
                  ],
                },
      }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SpacesPage />);
    return fetchMock;
  }
  it("requires confirmation to delete a creator's space and removes the card on success", async () => {
    const fetchMock = dashboard("creator");
    const confirm = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const user = userEvent.setup();
    const button = await screen.findByRole("button", {
      name: "删除空间 晨光组",
    });
    expect(
      screen.queryByRole("button", { name: "退出空间 晨光组" }),
    ).toBeNull();
    await user.click(button);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("晨光组"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await user.click(button);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/spaces/s1",
      expect.objectContaining({ method: "DELETE" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "晨光组" })).toBeNull(),
    );
    expect(screen.getByText("还没有空间")).toBeTruthy();
  });
  it("lets members leave their own membership after confirmation", async () => {
    const fetchMock = dashboard("member");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "退出空间 晨光组" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/spaces/s1/leave",
      expect.objectContaining({ method: "POST" }),
    );
    expect(
      screen.queryByRole("button", { name: "删除空间 晨光组" }),
    ).toBeNull();
    expect(await screen.findByText("还没有空间")).toBeTruthy();
  });
  it("keeps the card and enables retry after a failed deletion", async () => {
    dashboard("creator", false);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    const button = await screen.findByRole("button", {
      name: "删除空间 晨光组",
    });
    await user.click(button);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "空间操作失败，请重试",
    );
    expect(screen.getByRole("heading", { name: "晨光组" })).toBeTruthy();
    expect(button).toHaveProperty("disabled", false);
  });
});

describe("mobile account menu", () => {
  function renderShell() {
    vi.mocked(SpaceModule.useSpace).mockReturnValue({
      spaceId: "s1",
      data: null,
      loading: false,
      error: "",
      connection: "connected",
      date: "2026-10-13",
      setDate: vi.fn(),
      reload: vi.fn(),
    });
    return render(
      <SpaceShell spaceId="s1">
        <span>空间内容</span>
      </SpaceShell>,
    );
  }

  it("offers legacy login from the topbar menu when the sidebar is hidden on mobile", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          user: null,
          legacySpace: { id: "old", name: "旧空间", nickname: "芽芽" },
        }),
      }),
    );
    renderShell();
    await waitFor(() =>
      expect(screen.getByText("登录账号，绑定已有空间")).toBeTruthy(),
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "账号菜单" }));
    const action = within(screen.getByRole("menu")).getByRole("menuitem", {
      name: "登录账号，绑定已有空间",
    });
    expect(action.getAttribute("href")).toBe("/");
    expect(action.closest("header")).toBeTruthy();
    expect(action.closest("aside")).toBeNull();
  });

  it("shows a legacy claim failure without losing the mobile menu action", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
      ok: url === "/api/session",
      status: 503,
      json: async () =>
        url === "/api/session"
          ? {
              user: { id: "u1" },
              legacySpace: { id: "old", name: "旧空间", nickname: "芽芽" },
            }
          : { error: { message: "暂时无法绑定，请重试。" } },
    }));
    vi.stubGlobal("fetch", fetchMock);
    renderShell();
    await waitFor(() =>
      expect(screen.getByText("绑定旧空间：旧空间")).toBeTruthy(),
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "账号菜单" }));
    await user.click(
      within(screen.getByRole("menu")).getByRole("menuitem", {
        name: "绑定旧空间：旧空间",
      }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "暂时无法绑定，请重试。",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/claim-legacy",
      expect.objectContaining({ method: "POST" }),
    );
    expect(push).not.toHaveBeenCalled();
  });
});
