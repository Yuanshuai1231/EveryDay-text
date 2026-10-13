import { expect, test, type BrowserContext } from "@playwright/test";
import { registerVerifiedAccount } from "./account-helper";

async function json(
  context: BrowserContext,
  path: string,
  method = "GET",
  data?: unknown,
) {
  const response = await context.request.fetch(path, { method, data, headers: { origin: "http://127.0.0.1:3000" } });
  return { status: response.status(), body: await response.json() };
}

test("成员动物头像与共享清单，跨日独立完成和逾期任务", async ({ browser }) => {
  const owner = await browser.newContext({ baseURL: "http://127.0.0.1:3000", viewport: { width: 1440, height: 1100 } });
  const friend = await browser.newContext({ baseURL: "http://127.0.0.1:3000", viewport: { width: 1440, height: 1100 } });
  try {
    await registerVerifiedAccount(owner, "小熊同学");
    await registerVerifiedAccount(friend, "小兔同学");
    const created = await json(owner, "/api/spaces", "POST", { name: "清单一起成长", avatarId: "book" });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const { spaceId, memberId, inviteCode } = created.body;
    expect((await json(friend, "/api/spaces/join", "POST", { inviteCode })).status).toBe(201);
    const root = `/api/spaces/${spaceId}`;
    expect((await json(owner, `${root}/members/${memberId}`, "PATCH", { avatarId: "bear" })).status).toBe(200);
    expect((await json(friend, `${root}/members/${memberId}`, "PATCH", { avatarId: "fox" })).status).toBe(403);
    const summary = (await json(owner, `${root}/summary`)).body;
    const date = summary.date;
    const next = new Date(`${date}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
    const tomorrow = next.toISOString().slice(0, 10);
    const daily = await json(owner, `${root}/tasks`, "POST", { title: "每天阅读二十页", notes: "一起积攒小进步", targetDate: date, recurrence: "daily" });
    const once = await json(friend, `${root}/tasks`, "POST", { title: "整理书桌", notes: "完成后勾选", targetDate: date, recurrence: "once" });
    expect(daily.status).toBe(201); expect(once.status).toBe(201);
    const done = await json(owner, `${root}/tasks/${daily.body.task.id}`, "PATCH", { date, completed: true, updatedAt: daily.body.task.updated_at });
    expect(done.status).toBe(200);
    const today = (await json(friend, `${root}/tasks?date=${date}`)).body.tasks;
    expect(today.find((task: {id: string}) => task.id === daily.body.task.id).completed).toBe(true);
    const future = (await json(friend, `${root}/tasks?date=${tomorrow}`)).body.tasks;
    expect(future.find((task: {id: string}) => task.id === daily.body.task.id).completed).toBe(false);
    expect(future.find((task: {id: string}) => task.id === once.body.task.id).overdue).toBe(true);
    const page = await friend.newPage();
    await page.goto(`/${spaceId}/checkin?date=${tomorrow}`);
    const group = page.getByRole("region", { name: "小组记录" });
    await expect(group.getByText("每天阅读二十页", { exact: true })).toBeVisible();
    await expect(group.getByText("整理书桌", { exact: true })).toBeVisible();
    await expect(group.getByText(/逾期未完成/)).toBeVisible();
    await expect(page.getByLabel("上午记录", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("下午记录", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: "test-results/reminder-checklist-desktop.png", fullPage: true });
  } finally { await owner.close(); await friend.close(); }
});

test("成员头像选择器可保存、刷新保留，并在手机正常展示", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3000",
    viewport: { width: 390, height: 844 },
  });
  try {
    await registerVerifiedAccount(context, "可爱的小伙伴");
    const created = await json(context, "/api/spaces", "POST", {
      name: "头像小组",
      nickname: "可爱的小伙伴",
    });
    expect(created.status).toBe(201);
    const page = await context.newPage();
    await page.goto(`/${created.body.spaceId}/members`);
    await page
      .getByRole("button", { name: /更换.*头像/ })
      .last()
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.screenshot({
      path: "test-results/avatar-picker-mobile.png",
      fullPage: true,
    });
    // Catalog labels are shown as visible text and remain usable with keyboard/screen readers.
    const rabbitSelected =
      (await dialog
        .getByRole("radio", { name: "小兔", exact: true })
        .getAttribute("aria-checked")) === "true";
    await dialog
      .getByRole("radio", {
        name: rabbitSelected ? "小猫" : "小兔",
        exact: true,
      })
      .click();
    await dialog.getByRole("button", { name: /保存.*头像/ }).click();
    await expect(dialog).not.toBeVisible();
    await page.reload();
    expect(
      (await json(context, `/api/spaces/${created.body.spaceId}/summary`)).body
        .member.avatar_id,
    ).toBe(rabbitSelected ? "cat" : "rabbit");
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: "test-results/animal-members-mobile.png",
      fullPage: true,
    });
    await page.goto(`/${created.body.spaceId}/checkin`);
    await expect(page.getByRole("region", { name: "小组记录" })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: "test-results/shared-records-mobile.png",
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});
