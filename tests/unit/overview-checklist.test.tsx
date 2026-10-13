import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import SpaceOverview from "@/app/(space)/[spaceId]/page";

const state = vi.hoisted(() => ({ data: {} as unknown }));
vi.mock("@/components/space/SpaceProvider", () => ({
  useSpace: () => ({ data: state.data, spaceId: "s1", date: "2026-10-14", setDate: vi.fn(), reload: vi.fn(), error: "" }),
}));
afterEach(cleanup);

function task(id: string, creator: string, title: string, completed: boolean, overdue = false) {
  return { id, creator_id: creator, title, notes: "", target_date: "2026-10-13", occurrence_date: "2026-10-14", recurrence: "once", completed, overdue, updated_at: "2026-10-14T00:00:00Z", created_at: "2026-10-13T00:00:00Z" };
}
describe("overview reminder preview", () => {
  it("shows my item completion and overdue state without morning/afternoon slots", () => {
    state.data = {
      space: { id: "s1", name: "小组", timezone: "Asia/Shanghai" },
      member: { id: "me", nickname: "小芽" }, members: [{ id: "me", nickname: "小芽" }],
      date: "2026-10-14", checkins: [], logs: [], activity: [],
      tasks: [task("1", "me", "阅读十页", false, true), task("2", "me", "整理书桌", true), task("3", "other", "别人的任务", false)],
      stats: {checkedIn:0,totalMembers:1,completedTasks:1,totalTasks:3,streak:0},
    };
    render(<SpaceOverview />);
    const preview = screen.getByRole("region", {name:"我的今日清单"});
    expect(preview.textContent).toContain("阅读十页");
    expect(preview.textContent).toContain("整理书桌");
    expect(preview.textContent).toContain("逾期未完成");
    expect(preview.textContent).toContain("1 / 2");
    expect(preview.textContent).not.toContain("别人的任务");
    expect(screen.queryByText("上午的小目标")).toBeNull();
    expect(screen.queryByText("下午的小收获")).toBeNull();
    expect(screen.getByRole("link", {name:"去记录"}).getAttribute("href")).toBe("/s1/checkin?date=2026-10-14");
  });
  it("keeps personal previews separate from assigned group goals", () => {
    state.data = {
      space: { id: "s1", name: "小组", timezone: "Asia/Shanghai" },
      member: { id: "me", nickname: "小芽" }, members: [{ id: "me", nickname: "小芽" }, { id: "other", nickname: "小林" }],
      date: "2026-10-14", checkins: [], logs: [], activity: [
        { id: "personal-done", memberId: "me", nickname: "小芽", type: "task", text: "完成了「我的个人进步」", time: "2026-10-14T00:10:00Z" },
        { id: "group-done", memberId: "other", nickname: "小林", type: "task", text: "完成了「为小林制定的目标」", time: "2026-10-14T00:20:00Z" },
      ],
      tasks: [
        task("legacy", "me", "原有个人清单", false),
        { ...task("personal", "me", "我的个人进步", true), scope: "personal", assignee_id: null },
        { ...task("other-personal", "other", "伙伴个人进步", false), scope: "personal", assignee_id: null },
        { ...task("for-other", "me", "为小林制定的目标", true), scope: "group", assignee_id: "other" },
        { ...task("for-me", "other", "分配给我的目标", false), scope: "group", assignee_id: "me" },
      ],
      stats: { checkedIn: 0, totalMembers: 2, completedTasks: 1, totalTasks: 2, streak: 0 },
    };
    render(<SpaceOverview />);
    const personalPreview = screen.getByRole("region", { name: "我的今日清单" });
    expect(personalPreview.textContent).toContain("原有个人清单");
    expect(personalPreview.textContent).toContain("我的个人进步");
    expect(personalPreview.textContent).toContain("1 / 2");
    expect(personalPreview.textContent).not.toContain("为小林制定的目标");
    expect(personalPreview.textContent).not.toContain("分配给我的目标");
    expect(personalPreview.textContent).not.toContain("伙伴个人进步");
    const groupPreview = screen.getByRole("heading", { name: /^小组任务/ }).closest("section")!;
    expect(groupPreview.textContent).toContain("为小林制定的目标");
    expect(groupPreview.textContent).toContain("分配给我的目标");
    expect(groupPreview.textContent).toContain("负责人：小林");
    expect(groupPreview.textContent).toContain("负责人：小芽");
    expect(groupPreview.textContent).not.toContain("原有个人清单");
    expect(groupPreview.textContent).not.toContain("我的个人进步");
    expect(groupPreview.textContent).not.toContain("伙伴个人进步");
    expect(within(groupPreview).queryByRole("button")).toBeNull();
    expect(within(groupPreview).getByRole("heading").textContent).toContain("2");
    expect(screen.getByText("小芽完成了「我的个人进步」")).toBeTruthy();
    expect(screen.getByText("小林完成了「为小林制定的目标」")).toBeTruthy();
  });
});
