import { createRequire } from "node:module";

// Use the same environment loader and dependency version as Next itself.
const requireFromNext = createRequire(import.meta.resolve("next/package.json"));
const { loadEnvConfig } = requireFromNext("@next/env");
loadEnvConfig(process.cwd(), false);

const vercel = process.env.VERCEL === "1";
const cloud =
  vercel ||
  process.env.CHECKIN_STORAGE === "supabase" ||
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log(cloud ? "存储模式：Supabase" : "存储模式：本地 PostgreSQL");
let invalid = false;
for (const name of cloud
  ? ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
  : []) {
  const present = Boolean(process.env[name]?.trim());
  console.log(name + ": " + (present ? "已配置" : "缺失"));
  invalid ||= !present;
}
if (vercel && invalid)
  console.error(
    "Vercel 必须连接 Supabase，不能使用本地 .data/postgres 数据库。请配置 Production 环境变量后重新部署。",
  );
if (cloud && process.env.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new Error("invalid endpoint");
  } catch {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL 必须是项目 API 地址，例如 https://项目编号.supabase.co，不能填写控制台页面网址。",
    );
    invalid = true;
  }
}
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (cloud && key) {
  let publicKey = key.startsWith("sb_publishable_");
  if (key.split(".").length === 3) {
    try {
      const payload = JSON.parse(
        Buffer.from(key.split(".")[1], "base64url").toString(),
      );
      publicKey ||= payload.role === "anon" || payload.role === "authenticated";
    } catch {
      /* The database API validates the credential itself. */
    }
  }
  if (publicKey) {
    console.error(
      "SUPABASE_SERVICE_ROLE_KEY 需要服务端 service_role 或 secret key，不能使用 anon/publishable key。",
    );
    invalid = true;
  }
}
process.exitCode = invalid ? 1 : 0;
