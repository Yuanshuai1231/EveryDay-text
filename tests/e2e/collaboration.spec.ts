import { expect, test, type BrowserContext } from "@playwright/test";
import { registerVerifiedAccount } from "./account-helper";
async function json(
  context: BrowserContext,
  path: string,
  method = "GET",
  data?: unknown,
) {
  const r = await context.request.fetch(path, { method, data });
  const body = await r.json();
  return { status: r.status(), body };
}
test("多人实际存储、权限、打卡、任务、群聊和私聊", async ({ browser }) => {
  const a = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const b = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const c = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  try {
    await registerVerifiedAccount(a, "小熊");
    await registerVerifiedAccount(b, "小兔");
    await registerVerifiedAccount(c, "小猫");
    const created = await json(a, "/api/spaces", "POST", {
      name: "一起成长 · 验收",
      nickname: "小熊",
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const { spaceId, memberId, inviteCode } = created.body;
    const joined = await json(b, "/api/spaces/join", "POST", {
      nickname: "小兔",
      inviteCode,
    });
    expect(joined.status, JSON.stringify(joined.body)).toBe(201);
    const third = await json(c, "/api/spaces/join", "POST", {
      nickname: "小猫",
      inviteCode,
    });
    expect(third.status).toBe(201);
    const root = "/api/spaces/" + spaceId;
    const summary = await json(a, root + "/summary");
    expect(summary.status).toBe(200);
    expect(summary.body.members).toHaveLength(3);
    const date = summary.body.date;
    const saved = await json(a, root + "/logs", "PUT", {
      date,
      slot: "morning",
      content: "上午完成了网站规划",
      editedAt: null,
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const logs = await json(b, root + "/logs?date=" + date);
    expect(
      logs.body.logs.some(
        (l: { content: string }) => l.content === "上午完成了网站规划",
      ),
    ).toBeTruthy();
    const conflict = await json(a, root + "/logs", "PUT", {
      date,
      slot: "morning",
      content: "旧页面",
      editedAt: null,
    });
    expect(conflict.status).toBe(409);
    expect((await json(a, root + "/checkins", "PUT", { date })).status).toBe(
      200,
    );
    expect((await json(a, root + "/checkins", "PUT", { date })).status).toBe(
      200,
    );
    const task = await json(a, root + "/tasks", "POST", {
      title: "完成今天的计划",
      notes: "一步一步来",
      targetDate: date,
    });
    expect(task.status, JSON.stringify(task.body)).toBe(201);
    expect(
      (
        await json(b, root + "/tasks/" + task.body.task.id, "PATCH", {
          completed: true,
          updatedAt: task.body.task.updated_at,
        })
      ).status,
    ).toBe(403);
    const done = await json(a, root + "/tasks/" + task.body.task.id, "PATCH", {
      completed: true,
      updatedAt: task.body.task.updated_at,
    });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body.task.completed).toBe(true);
    const conversations = await json(a, root + "/conversations");
    const group = conversations.body.conversations.find(
      (x: { kind: string }) => x.kind === "group",
    );
    const groupPath = "/api/conversations/" + group.id + "/messages";
    const id = crypto.randomUUID();
    const sent = await json(a, groupPath, "POST", {
      body: "大家今天加油！",
      clientMessageId: id,
    });
    expect(sent.status, JSON.stringify(sent.body)).toBe(201);
    expect(
      (
        await json(a, groupPath, "POST", {
          body: "大家今天加油！",
          clientMessageId: id,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await json(a, groupPath, "POST", {
          body: "不能替换",
          clientMessageId: id,
        })
      ).status,
    ).toBe(409);
    expect(
      (await json(b, groupPath)).body.messages.filter(
        (m: { client_message_id: string }) => m.client_message_id === id,
      ),
    ).toHaveLength(1);
    const direct = await json(a, root + "/conversations", "POST", {
      memberId: joined.body.memberId,
    });
    expect(direct.status, JSON.stringify(direct.body)).toBeLessThan(300);
    const privatePath =
      "/api/conversations/" + direct.body.conversation.id + "/messages";
    expect(
      (
        await json(a, privatePath, "POST", {
          body: "这个只给你看",
          clientMessageId: crypto.randomUUID(),
        })
      ).status,
    ).toBe(201);
    expect((await json(b, privatePath)).body.messages).toHaveLength(1);
    expect((await json(c, privatePath)).status).toBe(403);
    const page = await a.newPage();
    await page.goto("/" + spaceId);
    await expect(page.getByText("一起成长 · 验收").first()).toBeVisible();
    await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
    const rotation = await json(a, root + "/invite", "POST");
    expect(rotation.status).toBe(200);
    const visitor = await browser.newContext({
      baseURL: "http://127.0.0.1:3000",
    });
    await registerVerifiedAccount(visitor, "迟到者");
    expect(
      (
        await json(visitor, "/api/spaces/join", "POST", {
          nickname: "迟到者",
          inviteCode,
        })
      ).status,
    ).toBe(400);
    expect((await json(visitor, root + "/summary")).status).toBe(401);
    await visitor.close();
    expect(
      (await json(a, root + "/members/" + memberId, "DELETE")).status,
    ).toBe(409);
    expect(
      (await json(a, root + "/members/" + third.body.memberId, "DELETE"))
        .status,
    ).toBe(200);
    expect((await json(c, root + "/summary")).status).toBe(401);
    expect(
      (
        await json(a, root + "/transfer", "POST", {
          memberId: joined.body.memberId,
        })
      ).status,
    ).toBe(200);
    expect(
      (await json(a, root + "/members/" + memberId, "DELETE")).status,
    ).toBe(200);
  } finally {
    await a.close();
    await b.close();
    await c.close();
  }
});
test("手机、平板和桌面均可访问完整导航且无横向溢出", async ({ browser }) => {
  const seedContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3000",
    viewport: { width: 1440, height: 1000 },
  });
  let storageState: Awaited<ReturnType<typeof seedContext.storageState>>;
  let spaceId: string;
  try {
    await registerVerifiedAccount(seedContext, "小伙伴");
    const created = await json(seedContext, "/api/spaces", "POST", {
      name: "响应式小组",
    });
    expect(created.status).toBe(201);
    spaceId = created.body.spaceId;
    const selected = await seedContext.request.post(
      `/api/spaces/${spaceId}/select`,
      { headers: { origin: "http://127.0.0.1:3000" }, data: {} },
    );
    expect(selected.status()).toBe(200);
    storageState = await seedContext.storageState();
  } finally {
    await seedContext.close();
  }
  for (const size of [
    { width: 390, height: 844 },
    { width: 820, height: 1180 },
    { width: 1024, height: 768 },
    { width: 1440, height: 768 },
    { width: 1440, height: 560 },
    { width: 1440, height: 1000 },
  ]) {
    const context = await browser.newContext({
      viewport: size,
      baseURL: "http://127.0.0.1:3000",
      storageState,
    });
    try {
      const page = await context.newPage();
      await page.goto("/" + spaceId);
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBeTruthy();
      for (const section of ["", "/tasks", "/checkin", "/chat", "/members"]) {
        await page.goto("/" + spaceId + section);
        await expect(page.locator("main")).toBeVisible();
        if (size.width >= 768) {
          const sidebar = page.locator(".sidebar");
          await expect(
            sidebar.getByRole("button", { name: "更换头像" }),
          ).toBeAttached();
          await sidebar.evaluate((element) => {
            element.scrollTop = element.scrollHeight;
          });
          const sidebarMetrics = await sidebar.evaluate((element) => ({
            scrollHeight: element.scrollHeight,
            clientHeight: element.clientHeight,
            scrollTop: element.scrollTop,
          }));
          if (sidebarMetrics.scrollHeight > sidebarMetrics.clientHeight) {
            await expect
              .poll(() => sidebar.evaluate((element) => element.scrollTop))
              .toBeGreaterThan(0);
          }
          await expect(
            sidebar.getByRole("button", { name: "更换头像" }),
          ).toBeInViewport();
        } else {
          const avatarButton = page.locator(
            ".topbar-right > button[aria-label='更换头像']",
          );
          await expect(avatarButton).toBeVisible();
          await expect(avatarButton.locator(".avatar")).toBeVisible();
          await avatarButton.click();
          await expect(
            page.getByRole("dialog", { name: "挑一个喜欢的小伙伴" }),
          ).toBeVisible();
          await page.getByRole("button", { name: "关闭头像选择" }).click();
          const bottomInset = await page.evaluate(() => {
            const workspace = document.querySelector<HTMLElement>(".workspace");
            const nav = document.querySelector<HTMLElement>(".bottom-nav");
            return workspace && nav
              ? Number.parseFloat(getComputedStyle(workspace).paddingBottom) -
                  nav.getBoundingClientRect().height
              : -1;
          });
          expect(bottomInset).toBeGreaterThanOrEqual(0);
        }
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
          )
          .toBeTruthy();
      }
      await page.goto("/" + spaceId);
      await page.screenshot({
        path: "test-results/layout-" + size.width + ".png",
        fullPage: true,
      });
    } finally {
      await context.close();
    }
  }
});

test("可通过页面创建空间、自动保存记录、创建勾选任务和发送聊天", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3000",
    viewport: { width: 1440, height: 1000 },
  });
  try {
    const page = await context.newPage();
    await registerVerifiedAccount(context, "小熊");
    await page.goto("/spaces");
    await page.getByRole("button", { name: "创建空间", exact: true }).click();
    await page.getByRole("dialog").getByLabel("空间名称").fill("叮咚体验小组");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "创建空间", exact: true })
      .click();
    await page.getByRole("button", { name: /走，进入空间/ }).click();
    await expect(
      page.getByRole("heading", { name: "你好，小熊" }),
    ).toBeVisible();
    const spaceId = new URL(page.url()).pathname.slice(1);
    await page.goto("/" + spaceId + "/checkin");
    await page
      .getByLabel("上午记录", { exact: true })
      .fill("整理需求，完成每日任务清单 ☀️");
    await expect(
      page.getByText("已保存", { exact: true }).first(),
    ).toBeVisible();
    await page
      .getByLabel("下午记录", { exact: true })
      .fill("和小伙伴讨论网站，一起成长 🌱");
    await expect(page.getByText("已保存", { exact: true })).toHaveCount(2);
    await page.getByRole("button", { name: /完成.*打卡/ }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "已完成" }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("上午记录", { exact: true })).toHaveValue(
      "整理需求，完成每日任务清单 ☀️",
    );
    await page.goto("/" + spaceId + "/tasks");
    await page.getByRole("button", { name: "添加任务", exact: true }).click();
    await page.getByLabel("任务名称").fill("读完一本喜欢的书");
    await page.getByLabel("补充说明").fill("今天先读二十页");
    await page.getByRole("button", { name: "保存小目标" }).click();
    await expect(
      page.getByRole("heading", { name: "读完一本喜欢的书" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "完成任务：读完一本喜欢的书" })
      .click();
    await expect(
      page.getByRole("button", { name: "恢复任务：读完一本喜欢的书" }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.goto("/" + spaceId + "/chat");
    await expect(page.getByLabel("聊天消息")).toBeEnabled();
    await page.getByLabel("聊天消息").fill("今天也一起加油 🌈");
    await page.getByRole("button", { name: "发送", exact: true }).click();
    await expect(
      page.getByText("今天也一起加油 🌈", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("已发送", { exact: true })).toBeVisible();
    await page.goto("/" + spaceId);
    await page.screenshot({
      path: "test-results/product-desktop.png",
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});
