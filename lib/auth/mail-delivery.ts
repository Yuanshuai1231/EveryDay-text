import "server-only";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { writeLocalMail, type LocalMail } from "./local-mail";

export type MailDeliveryMode = "preview" | "smtp";
export type MailDelivery = MailDeliveryMode | "supabase";
type MailErrorCode =
  | "MAIL_CONFIGURATION_ERROR"
  | "MAIL_AUTH_ERROR"
  | "MAIL_CONNECTION_ERROR"
  | "MAIL_DELIVERY_ERROR";

const messages: Record<MailErrorCode, string> = {
  MAIL_CONFIGURATION_ERROR:
    "邮件服务配置不完整，请配置 SMTP 服务器、发件邮箱和授权码后重试。",
  MAIL_AUTH_ERROR:
    "邮件服务认证失败，请检查发件邮箱和 SMTP 授权码。QQ 邮箱需要开启 SMTP 服务并使用授权码。",
  MAIL_CONNECTION_ERROR:
    "暂时无法连接邮件服务，请检查 SMTP 服务器、端口和网络后重试。",
  MAIL_DELIVERY_ERROR: "邮件发送失败，请稍后重试，或检查邮件服务配置。",
};

export class MailDeliveryError extends Error {
  readonly status = 503;
  constructor(readonly code: MailErrorCode = "MAIL_DELIVERY_ERROR") {
    super(messages[code]);
    this.name = "MailDeliveryError";
  }
}

function configurationError(): never {
  throw new MailDeliveryError("MAIL_CONFIGURATION_ERROR");
}

export function validMailAddress(value: string): boolean {
  return (
    value.length <= 254 &&
    /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(
      value,
    )
  );
}

function setting(name: string): string {
  const value = process.env[name];
  if (!value || /[\r\n\0]/.test(value)) return configurationError();
  return value;
}

export function getMailDeliveryMode(): MailDeliveryMode {
  const mode = process.env.CHECKIN_MAIL_TRANSPORT;
  const localDevelopment =
    process.env.NODE_ENV !== "production" &&
    process.env.CHECKIN_STORAGE !== "supabase" &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL;
  if ((!mode || mode === "preview") && localDevelopment) return "preview";
  if (mode === "smtp") return "smtp";
  return configurationError();
}

export function readSmtpConfig(): SMTPTransport.Options & { from: string } {
  const host = setting("MAIL_SMTP_HOST").trim();
  const portString = setting("MAIL_SMTP_PORT").trim();
  const secureString = setting("MAIL_SMTP_SECURE").trim();
  const user = setting("MAIL_SMTP_USER").trim();
  const pass = setting("MAIL_SMTP_PASSWORD");
  const from = setting("MAIL_FROM").trim();
  const port = Number(portString);
  if (
    !/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(host) ||
    !/^\d+$/.test(portString) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !["true", "false"].includes(secureString) ||
    (port === 465 && secureString !== "true") ||
    !validMailAddress(user) ||
    !validMailAddress(from) ||
    user.toLowerCase() !== from.toLowerCase() ||
    !pass.trim()
  )
    return configurationError();
  return {
    host,
    port,
    secure: secureString === "true",
    requireTLS: secureString === "false",
    auth: { user, pass },
    from,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    dnsTimeout: 15000,
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}

export function mailResponseInfo(mode: MailDelivery = getMailDeliveryMode()) {
  return {
    mailDelivery: mode,
    ...(mode === "preview" ? { devMailUrl: "/dev/mail" } : {}),
  };
}

function deliveryFailure(error: unknown): MailDeliveryError {
  if (error instanceof MailDeliveryError) return error;
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  if (code === "EAUTH") return new MailDeliveryError("MAIL_AUTH_ERROR");
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS"].includes(String(code))) {
    return new MailDeliveryError("MAIL_CONNECTION_ERROR");
  }
  return new MailDeliveryError();
}

export async function sendAccountMail(
  mail: Omit<LocalMail, "id" | "createdAt">,
) {
  if (!validMailAddress(mail.to) || /[\r\n\0]/.test(mail.subject))
    throw new MailDeliveryError();
  const delivery = getMailDeliveryMode();
  if (delivery === "preview") {
    try {
      await writeLocalMail(mail);
    } catch {
      throw new MailDeliveryError();
    }
    return { delivery };
  }
  const { from, ...options } = readSmtpConfig();
  try {
    const transport = nodemailer.createTransport(options);
    const result = await transport.sendMail({
      from: { name: "叮咚小组", address: from },
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
    });
    const accepted = result.accepted?.some(
      (recipient) =>
        typeof recipient === "string" &&
        recipient.toLowerCase() === mail.to.toLowerCase(),
    );
    if (!accepted || result.rejected?.length) throw new MailDeliveryError();
    return { delivery };
  } catch (error) {
    throw deliveryFailure(error);
  }
}

export async function verifyMailConfiguration() {
  if (getMailDeliveryMode() !== "smtp") return configurationError();
  const config = readSmtpConfig();
  const { from, ...options } = config;
  // The sender is validated here; verify() checks connection and authentication only.
  if (!validMailAddress(from)) return configurationError();
  try {
    await nodemailer.createTransport(options).verify();
    return { delivery: "smtp" as const };
  } catch (error) {
    throw deliveryFailure(error);
  }
}
