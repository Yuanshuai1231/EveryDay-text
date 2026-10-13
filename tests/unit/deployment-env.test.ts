// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

function check(variables: Record<string, string> = {}) {
  const env = { ...process.env };
  for (const name of [
    "VERCEL",
    "CHECKIN_STORAGE",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_SITE_URL",
  ])
    delete env[name];
  return spawnSync(process.execPath, ["scripts/check-env.mjs"], {
    cwd: process.cwd(),
    env: { ...env, ...variables },
    encoding: "utf8",
  });
}

function checkEnvFile(content: string) {
  const directory = mkdtempSync(path.join(tmpdir(), "checkin-env-test-"));
  try {
    writeFileSync(path.join(directory, ".env.local"), content);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: "production",
      VERCEL: "1",
    };
    for (const name of [
      "CHECKIN_STORAGE",
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "NEXT_PUBLIC_SITE_URL",
    ])
      delete env[name];
    return spawnSync(
      process.execPath,
      [path.resolve("scripts/check-env.mjs")],
      { cwd: directory, env, encoding: "utf8" },
    );
  } finally {
    rmSync(directory, { recursive: true });
  }
}

describe("deployment database configuration", () => {
  it("loads production env files before checking a local Vercel build", () => {
    const result = checkEnvFile(
      "NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=sb_secret_env_fixture\nNEXT_PUBLIC_SITE_URL=https://checkin.example\n",
    );
    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).not.toContain(
      "sb_secret_env_fixture",
    );
  });
  it("keeps local storage available for a persistent Node server", () => {
    expect(check().status).toBe(0);
  });

  it("rejects a Vercel deployment without a cloud database", () => {
    const result = check({ VERCEL: "1" });
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain("Supabase");
  });

  it("rejects missing service credentials", () => {
    expect(
      check({
        VERCEL: "1",
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      }).status,
    ).toBe(1);
  });

  it("rejects a dashboard URL in place of the API endpoint", () => {
    const result = check({
      VERCEL: "1",
      NEXT_PUBLIC_SUPABASE_URL:
        "https://supabase.com/dashboard/project/example",
      SUPABASE_SERVICE_ROLE_KEY: "server-secret",
    });
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).not.toContain("server-secret");
  });

  it("rejects public keys used as server credentials", () => {
    expect(
      check({
        VERCEL: "1",
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "sb_publishable_test",
      }).status,
    ).toBe(1);
  });

  it("accepts a cloud endpoint with server-only credentials without printing their value", () => {
    const result = check({
      VERCEL: "1",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
      NEXT_PUBLIC_SITE_URL: "https://checkin.example",
    });
    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).not.toContain("sb_secret_test");
  });
  it("requires a site URL for cloud verification and recovery links", () => {
    const result = check({
      VERCEL: "1",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
    });
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain("NEXT_PUBLIC_SITE_URL");
  });
  it("uses Vercel's production URL when the explicit site URL is omitted", () => {
    const result = check({
      VERCEL: "1",
      VERCEL_PROJECT_PRODUCTION_URL: "every-day-text.vercel.app",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
    });
    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).toContain(
      "使用 Vercel 系统域名",
    );
  });
  it("rejects localhost email redirects on Vercel", () => {
    expect(
      check({
        VERCEL: "1",
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
        NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      }).status,
    ).toBe(1);
  });
});
