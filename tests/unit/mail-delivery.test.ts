// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMailDeliveryMode,
  readSmtpConfig,
  sendAccountMail,
  verifyMailConfiguration,
  mailResponseInfo,
  MailDeliveryError,
} from "@/lib/auth/mail-delivery";

const state = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn(),
  verify: vi.fn(),
  writeLocalMail: vi.fn(),
}));
vi.mock("nodemailer", () => ({
  default: { createTransport: state.createTransport },
}));
vi.mock("@/lib/auth/local-mail", () => ({
  writeLocalMail: state.writeLocalMail,
}));

const mail = {
  to: "recipient@example.com",
  subject: "验证叮咚小组账号邮箱",
  text: "请打开链接验证邮箱：http://localhost/auth/confirm?token=test",
  url: "http://localhost/auth/confirm?token=test",
};
beforeEach(() => {
  vi.stubEnv("CHECKIN_MAIL_TRANSPORT", "smtp");
  vi.stubEnv("CHECKIN_STORAGE", "local");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("MAIL_SMTP_HOST", "smtp.qq.com");
  vi.stubEnv("MAIL_SMTP_PORT", "465");
  vi.stubEnv("MAIL_SMTP_SECURE", "true");
  vi.stubEnv("MAIL_SMTP_USER", "sender@qq.com");
  vi.stubEnv("MAIL_SMTP_PASSWORD", "authorization-code");
  vi.stubEnv("MAIL_FROM", "sender@qq.com");
  vi.clearAllMocks();
  state.createTransport.mockReturnValue({
    sendMail: state.sendMail,
    verify: state.verify,
  });
  state.sendMail.mockResolvedValue({ accepted: [mail.to], rejected: [] });
  state.verify.mockResolvedValue(true);
  state.writeLocalMail.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("account mail delivery", () => {
  it("uses a real QQ SMTP transport with TLS, bounded timeouts and one recipient", async () => {
    expect(getMailDeliveryMode()).toBe("smtp");
    expect(await sendAccountMail(mail)).toEqual({ delivery: "smtp" });
    expect(state.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.qq.com",
        port: 465,
        secure: true,
        auth: { user: "sender@qq.com", pass: "authorization-code" },
        connectionTimeout: expect.any(Number),
        greetingTimeout: expect.any(Number),
        socketTimeout: expect.any(Number),
        disableFileAccess: true,
        disableUrlAccess: true,
      }),
    );
    const options = state.createTransport.mock.calls[0][0];
    for (const timeout of [
      options.connectionTimeout,
      options.greetingTimeout,
      options.socketTimeout,
    ]) {
      expect(timeout).toBeGreaterThan(0);
      expect(timeout).toBeLessThanOrEqual(20000);
    }
    expect(options.tls?.rejectUnauthorized).not.toBe(false);
    expect(options.logger).not.toBe(true);
    expect(options.debug).not.toBe(true);
    expect(state.sendMail).toHaveBeenCalledWith({
      from: { name: "叮咚小组", address: "sender@qq.com" },
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
    });
    expect(state.writeLocalMail).not.toHaveBeenCalled();
    expect(mailResponseInfo()).toEqual({ mailDelivery: "smtp" });
  });

  it("requires STARTTLS when immediate TLS is disabled", async () => {
    vi.stubEnv("MAIL_SMTP_PORT", "587");
    vi.stubEnv("MAIL_SMTP_SECURE", "false");
    await sendAccountMail(mail);
    expect(state.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ secure: false, requireTLS: true }),
    );
  });

  it("waits for SMTP acceptance before reporting success", async () => {
    let accept!: (value: unknown) => void;
    state.sendMail.mockReturnValue(
      new Promise((resolve) => {
        accept = resolve;
      }),
    );
    let complete = false;
    const sending = sendAccountMail(mail).then(() => {
      complete = true;
    });
    await vi.waitFor(() => expect(state.sendMail).toHaveBeenCalled());
    expect(complete).toBe(false);
    accept({ accepted: [mail.to], rejected: [] });
    await sending;
    expect(complete).toBe(true);
  });

  it.each([
    { accepted: [], rejected: [mail.to] },
    { accepted: ["someone-else@example.com"], rejected: [] },
    { accepted: [mail.to], rejected: [mail.to] },
  ])(
    "does not claim delivery when the intended recipient was not accepted: %j",
    async (result) => {
      state.sendMail.mockResolvedValue(result);
      await expect(sendAccountMail(mail)).rejects.toMatchObject({
        code: "MAIL_DELIVERY_ERROR",
        status: 503,
      });
      expect(state.writeLocalMail).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["EAUTH", "MAIL_AUTH_ERROR"],
    ["ECONNECTION", "MAIL_CONNECTION_ERROR"],
    ["ETIMEDOUT", "MAIL_CONNECTION_ERROR"],
    ["ESOCKET", "MAIL_CONNECTION_ERROR"],
    ["EPROTOCOL", "MAIL_DELIVERY_ERROR"],
  ])(
    "maps %s to a safe error without exposing SMTP details",
    async (code, expectedCode) => {
      state.sendMail.mockRejectedValue(
        Object.assign(
          new Error("sender@qq.com authorization-code private-server-response"),
          { code },
        ),
      );
      const failure = await sendAccountMail(mail).catch((error) => error);
      expect(failure).toBeInstanceOf(MailDeliveryError);
      expect(failure).toMatchObject({ code: expectedCode, status: 503 });
      expect(failure.message).not.toMatch(
        /sender@qq.com|authorization-code|private-server-response/,
      );
      expect(failure.cause).toBeUndefined();
      expect(state.writeLocalMail).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["MAIL_SMTP_HOST", ""],
    ["MAIL_SMTP_HOST", "smtp.qq.com\r\nInjected"],
    ["MAIL_SMTP_PORT", "0"],
    ["MAIL_SMTP_PORT", "65536"],
    ["MAIL_SMTP_PORT", "465abc"],
    ["MAIL_SMTP_SECURE", "yes"],
    ["MAIL_SMTP_SECURE", "false"],
    ["MAIL_SMTP_USER", "sender@qq.com,other@qq.com"],
    ["MAIL_SMTP_PASSWORD", ""],
    ["MAIL_SMTP_PASSWORD", "secret\r\nInjected"],
    ["MAIL_FROM", "Display Name <sender@qq.com>"],
    ["MAIL_FROM", "different@qq.com"],
  ])(
    "rejects invalid %s configuration before contacting SMTP",
    async (key, value) => {
      vi.stubEnv(key, value);
      expect(() => readSmtpConfig()).toThrow(MailDeliveryError);
      await expect(sendAccountMail(mail)).rejects.toMatchObject({
        code: "MAIL_CONFIGURATION_ERROR",
        status: 503,
      });
      expect(state.createTransport).not.toHaveBeenCalled();
      expect(state.writeLocalMail).not.toHaveBeenCalled();
    },
  );

  it.each([
    "a@example.com,b@example.com",
    "A <a@example.com>",
    "a@example.com\r\nBcc:b@example.com",
    "invalid",
  ])(
    "rejects a recipient that is not one plain email address: %s",
    async (to) => {
      await expect(sendAccountMail({ ...mail, to })).rejects.toBeInstanceOf(
        MailDeliveryError,
      );
      expect(state.createTransport).not.toHaveBeenCalled();
    },
  );

  it("writes an explicitly selected preview and tells the caller where it is", async () => {
    vi.stubEnv("CHECKIN_MAIL_TRANSPORT", "preview");
    expect(await sendAccountMail(mail)).toEqual({ delivery: "preview" });
    expect(state.writeLocalMail).toHaveBeenCalledWith(mail);
    expect(state.createTransport).not.toHaveBeenCalled();
    expect(mailResponseInfo()).toEqual({
      mailDelivery: "preview",
      devMailUrl: "/dev/mail",
    });
  });

  it("defaults to preview only in local nonproduction development", () => {
    vi.stubEnv("CHECKIN_MAIL_TRANSPORT", undefined);
    expect(getMailDeliveryMode()).toBe("preview");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getMailDeliveryMode()).toThrow(MailDeliveryError);
  });

  it("rejects preview in production and cloud authentication", async () => {
    vi.stubEnv("CHECKIN_MAIL_TRANSPORT", "preview");
    vi.stubEnv("NODE_ENV", "production");
    await expect(sendAccountMail(mail)).rejects.toMatchObject({
      code: "MAIL_CONFIGURATION_ERROR",
    });
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("CHECKIN_STORAGE", "supabase");
    await expect(sendAccountMail(mail)).rejects.toMatchObject({
      code: "MAIL_CONFIGURATION_ERROR",
    });
    expect(state.writeLocalMail).not.toHaveBeenCalled();
  });

  it("rejects an unknown delivery mode instead of falling back", async () => {
    vi.stubEnv("CHECKIN_MAIL_TRANSPORT", "invalid");
    await expect(sendAccountMail(mail)).rejects.toMatchObject({
      code: "MAIL_CONFIGURATION_ERROR",
    });
    expect(state.writeLocalMail).not.toHaveBeenCalled();
  });

  it("verifies SMTP authentication without sending any mail", async () => {
    expect(await verifyMailConfiguration()).toEqual({ delivery: "smtp" });
    expect(state.verify).toHaveBeenCalledTimes(1);
    expect(state.sendMail).not.toHaveBeenCalled();
    expect(state.writeLocalMail).not.toHaveBeenCalled();
  });

  it("does not treat preview mode as a verified SMTP configuration", async () => {
    vi.stubEnv("CHECKIN_MAIL_TRANSPORT", "preview");
    await expect(verifyMailConfiguration()).rejects.toMatchObject({
      code: "MAIL_CONFIGURATION_ERROR",
    });
    expect(state.verify).not.toHaveBeenCalled();
  });

  it("returns the cloud delivery contract without exposing a local preview", () => {
    expect(mailResponseInfo("supabase")).toEqual({ mailDelivery: "supabase" });
  });
});
