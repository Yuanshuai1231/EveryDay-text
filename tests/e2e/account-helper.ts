import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, type BrowserContext } from "@playwright/test";

/** Registers through the local API and enters the code from the preview inbox. */
export async function registerVerifiedAccount(
  context: BrowserContext,
  nickname: string,
) {
  const email = `test-${randomUUID()}@example.test`;
  const password = "local-test-password-2026";
  const response = await context.request.post("/api/auth/register", {
    headers: { origin: "http://127.0.0.1:3000" },
    data: { email, password, nickname },
  });
  expect(response.status(), await response.text()).toBe(202);
  const delivery = await response.json();
  expect(
    delivery.mailDelivery,
    "浏览器测试需要 preview 邮件模式；请停止正在运行的 smtp 开发服务后重新启动测试服务。",
  ).toBe("preview");
  expect(delivery.verificationMethod).toBe("code");
  const dataDir = process.env.CHECKIN_DATA_DIR;
  const folder = dataDir
    ? path.join(path.dirname(dataDir), "mail-outbox")
    : path.join(process.cwd(), ".data", "mail-outbox");
  let code = "";
  await expect
    .poll(async () => {
      for (const file of await readdir(folder)) {
        if (!file.endsWith(".json")) continue;
        const mail = JSON.parse(
          await readFile(path.join(folder, file), "utf8"),
        );
        const match = String(mail.text).match(/验证码[:：]\s*(\d{6})(?!\d)/);
        if (mail.to === email && match) {
          code = match[1];
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  const verification = await context.request.post("/api/auth/verify-email", {
    headers: { origin: "http://127.0.0.1:3000" },
    data: { email, code },
  });
  expect(verification.status(), await verification.text()).toBe(200);
  return { email, password };
}
