import { expect, test, type BrowserContext } from "@playwright/test";

async function json(
  context: BrowserContext,
  path: string,
  method = "GET",
  data?: unknown,
) {
  const response = await context.request.fetch(path, { method, data });
  return { status: response.status(), body: await response.json() };
}

test("动物头像持久化，同组实时查看自动保存记录和历史日期", async ({
  browser,
}) => {
  const owner = await browser.newContext({
    baseURL: "http://127.0.0.1:3000",
    viewport: { width: 1440, height: 1100 },
  });
  const friend = await browser.newContext({
    baseURL: "http://127.0.0.1:3000",
    viewport: { width: 1440, height: 1100 },
  });
  try {
    const created = await json(owner, "/api/spaces", "POST", {
      name: "小动物一起成长",
      nickname: "小熊同学",
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const { spaceId, memberId, inviteCode } = created.body;
    const joined = await json(friend, "/api/spaces/join", "POST", {
      inviteCode,
      nickname: "小兔同学",
    });
    expect(joined.status, JSON.stringify(joined.body)).toBe(201);
    const ownerPage = await owner.newPage();
    const friendPage = await friend.newPage();
    await ownerPage.goto(`/${spaceId}/members`);
    await expect(
      ownerPage.getByRole("heading", { name: /我们的小伙伴/ }),
    ).toBeVisible();
    // Persisted profile changes use the same endpoint as the picker; picker interaction is exercised below.
    const updated = await json(
      owner,
      `/api/spaces/${spaceId}/members/${memberId}`,
      "PATCH",
      { avatarId: "bear" },
    );
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    await ownerPage.reload();
    await expect
      .poll(
        async () =>
          (await json(owner, `/api/spaces/${spaceId}/summary`)).body.member
            .avatar_id,
      )
      .toBe("bear");
    await expect(
      (
        await json(
          friend,
          `/api/spaces/${spaceId}/members/${memberId}`,
          "PATCH",
          { avatarId: "fox" },
        )
      ).status,
    ).toBe(403);

    await ownerPage.goto(`/${spaceId}/checkin`);
    await friendPage.goto(`/${spaceId}/checkin`);
    await expect(
      friendPage.getByRole("region", { name: "小组记录" }),
    ).toBeVisible();
    const date = (await json(owner, `/api/spaces/${spaceId}/summary`)).body
      .date;
    await ownerPage
      .getByLabel("上午记录", { exact: true })
      .fill("读了二十页书，也整理了今天的计划 📚");
    await expect(
      ownerPage.getByText("已保存", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      friendPage
        .getByRole("region", { name: "小组记录" })
        .getByText("读了二十页书，也整理了今天的计划 📚", { exact: true }),
    ).toBeVisible();
    await friendPage
      .getByLabel("下午记录", { exact: true })
      .fill("跑了三公里，给小伙伴送一句加油！");
    await expect(
      friendPage.getByText("已保存", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      ownerPage
        .getByRole("region", { name: "小组记录" })
        .getByText("跑了三公里，给小伙伴送一句加油！", { exact: true }),
    ).toBeVisible();
    const summary = (await json(owner, `/api/spaces/${spaceId}/summary`)).body;
    expect(summary.checkins).toHaveLength(0);
    // A teammate's update must not replace the author's edit.
    await expect(ownerPage.getByLabel("上午记录", { exact: true })).toHaveValue(
      "读了二十页书，也整理了今天的计划 📚",
    );
    await ownerPage.getByRole("button", { name: /完成.*打卡/ }).click();
    await expect
      .poll(async () =>
        (
          await json(friend, `/api/spaces/${spaceId}/summary`)
        ).body.checkins.some(
          (row: { member_id: string }) => row.member_id === memberId,
        ),
      )
      .toBe(true);
    await ownerPage.screenshot({
      path: "test-results/shared-records-desktop.png",
      fullPage: true,
    });
    const previous = new Date(`${date}T12:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() - 1);
    const yesterday = previous.toISOString().slice(0, 10);
    expect(
      (
        await json(owner, `/api/spaces/${spaceId}/logs`, "PUT", {
          date: yesterday,
          slot: "morning",
          content: "昨天一起完成了一个小目标。",
          editedAt: null,
        })
      ).status,
    ).toBe(200);
    await friendPage.getByLabel("日期", { exact: true }).fill(yesterday);
    await friendPage.getByRole("button", { name: "查看", exact: true }).click();
    await expect(
      friendPage
        .getByRole("region", { name: "小组记录" })
        .getByText("昨天一起完成了一个小目标。", { exact: true }),
    ).toBeVisible();
    await expect(
      friendPage
        .getByRole("region", { name: "小组记录" })
        .getByText("读了二十页书，也整理了今天的计划 📚", { exact: true }),
    ).toHaveCount(0);
  } finally {
    await owner.close();
    await friend.close();
  }
});

test("成员头像选择器可保存、刷新保留，并在手机正常展示", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3000",
    viewport: { width: 390, height: 844 },
  });
  try {
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
