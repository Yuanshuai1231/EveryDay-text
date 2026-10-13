import { createRequire } from "node:module";
import path from "node:path";

const requireFromProject = createRequire(path.resolve("package.json"));
const requireFromNext = createRequire(
  requireFromProject.resolve("next/package.json"),
);
const { loadEnvConfig } = requireFromNext("@next/env");
loadEnvConfig(process.cwd(), false);

async function checkMail() {
  try {
    const { verifyMailConfiguration } =
      await import("../lib/auth/mail-delivery");
    await verifyMailConfiguration();
    console.log("SMTP 连接、TLS 和身份验证通过。此检查没有发送邮件。");
  } catch (error) {
    const failure = error as { code?: string; message?: string };
    console.error(
      failure.code
        ? `${failure.code}: ${failure.message}`
        : "邮件服务检查失败，请检查本机配置。",
    );
    process.exitCode = 1;
  }
}
void checkMail();
