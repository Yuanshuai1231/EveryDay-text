import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { GroupDailyRecords } from "@/components/checkin/GroupDailyRecords";
import { CheckinWorkspace } from "@/components/checkin/CheckinWorkspace";
import { useSpace, type SpaceSummary, type Task } from "@/components/space/SpaceProvider";
vi.mock("@/components/space/SpaceProvider", async (importOriginal) => ({ ...await importOriginal<typeof import("@/components/space/SpaceProvider")>(), useSpace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const date = "2026-10-13";
const me = { id: "member-a", nickname: "小袁" };
const friend = { id: "member-b", nickname: "小林" };
const reload = vi.fn().mockResolvedValue(undefined);
const setDate = vi.fn();
function task(overrides: Partial<Task> = {}): Task { return { id: "task-a", creator_id: me.id, title: "已经保存的任务", notes: "", target_date: date, completed: false, updated_at: "2026-10-13T01:15:00.000Z", created_at: "2026-10-13T01:15:00.000Z", recurrence: "once", overdue: false, occurrence_date: date, ...overrides }; }
function summary(overrides: Partial<SpaceSummary> = {}): SpaceSummary { return { space: { id: "space-a", name: "一起进步", timezone: "Asia/Shanghai" }, member: me, members: [me, friend], date, checkins: [], tasks: [task(), task({ id: "task-b", creator_id: friend.id, title: "读完两章", notes: "整理了笔记", completed: true })], logs: [{ id: "legacy", member_id: me.id, slot: "morning", content: "备份旧记录", work_date: date }], activity: [], stats: { checkedIn: 0, totalMembers: 2, completedTasks: 1, totalTasks: 2, streak: 0 }, ...overrides }; }
function provide(data: SpaceSummary | null = summary(), error = "") { vi.mocked(useSpace).mockReturnValue({ spaceId: "space-a", data, date: data?.date ?? "", setDate, reload, error, loading: !data, connection: "connected" }); }
describe("shared daily checklists", () => {
  beforeEach(() => { vi.clearAllMocks(); provide(); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it("shows member item completion independently of the whole-day mark", () => {
    render(<GroupDailyRecords selectedDate={date} />);
    const own = screen.getByRole("article", { name: "小袁的记录" });
    const other = screen.getByRole("article", { name: "小林的记录" });
    expect(within(own).getByText("已经保存的任务")).toBeTruthy();
    expect(within(own).getByText("我")).toBeTruthy();
    expect(within(other).getByText("读完两章")).toBeTruthy();
    expect(within(other).getByText("整理了笔记")).toBeTruthy();
    expect(within(other).getByText("已完成")).toBeTruthy();
    expect(within(other).getByText("未完成打卡")).toBeTruthy();
    expect(within(own).getByText(/09:15/)).toBeTruthy();
    expect(screen.queryByText("备份旧记录")).toBeNull();
    expect(screen.queryByText("上午记录")).toBeNull();
    expect(screen.queryByText("下午记录")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /编辑任务/ })).toBeNull();
  });
  it("only shares personal history when the same summary includes assigned group goals", () => {
    provide(summary({
      members: [me, friend, { id: "group-author", nickname: "离开的目标作者", removed_at: "2026-10-12" }],
      tasks: [
        task({ title: "原有个人记录" }),
        task({ id: "personal", scope: "personal", assignee_id: null, title: "我的个人记录", completed: true }),
        task({ id: "friend-personal", scope: "personal", assignee_id: null, creator_id: friend.id, title: "伙伴个人记录" }),
        task({ id: "group-for-friend", scope: "group", assignee_id: friend.id, title: "我创建的小组目标", completed: true }),
        task({ id: "group-for-me", scope: "group", assignee_id: me.id, creator_id: friend.id, title: "分配给我的小组目标", completed: true }),
        task({ id: "group-left", scope: "group", assignee_id: friend.id, creator_id: "group-author", title: "旧作者的小组目标" }),
      ],
    }));
    render(<GroupDailyRecords selectedDate={date} />);
    const own = screen.getByRole("article", { name: "小袁的记录" });
    const other = screen.getByRole("article", { name: "小林的记录" });
    expect(within(own).getByText("原有个人记录")).toBeTruthy();
    expect(within(own).getByText("我的个人记录")).toBeTruthy();
    expect(within(own).getByText("已完成 1 / 2")).toBeTruthy();
    expect(within(other).getByText("伙伴个人记录")).toBeTruthy();
    expect(within(other).getByText("已完成 0 / 1")).toBeTruthy();
    expect(screen.queryByText("我创建的小组目标")).toBeNull();
    expect(screen.queryByText("分配给我的小组目标")).toBeNull();
    expect(screen.queryByText("旧作者的小组目标")).toBeNull();
    expect(screen.queryByRole("article", { name: "离开的目标作者的记录" })).toBeNull();
  });
  it("hides the previous summary while a historical date loads", () => {
    render(<GroupDailyRecords selectedDate="2026-10-11" />);
    expect(screen.queryByText("已经保存的任务")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("正在加载");
  });
  it("only displays occurrences for the selected historical day", () => {
    provide(summary({ date: "2026-10-11", tasks: [task({ title: "历史任务", occurrence_date: "2026-10-11" }), task({ id: "other", title: "其他日期的任务" })] }));
    render(<GroupDailyRecords selectedDate="2026-10-11" />);
    expect(screen.getByText("历史任务")).toBeTruthy();
    expect(screen.queryByText("其他日期的任务")).toBeNull();
  });
  it("keeps empty active members and task history from departed members", () => {
    provide(summary({ members: [me, friend, { id: "old", nickname: "旧伙伴", removed_at: "2026-10-12" }, { id: "empty-old", nickname: "离开的空成员", removed_at: "2026-10-12" }], tasks: [task({ creator_id: "old", title: "留下的任务" })] }));
    render(<GroupDailyRecords selectedDate={date} />);
    expect(within(screen.getByRole("article", { name: "小林的记录" })).getByText("还没有任务")).toBeTruthy();
    expect(within(screen.getByRole("article", { name: "旧伙伴的记录" })).getByText("已离开 · 历史记录")).toBeTruthy();
    expect(screen.queryByText("离开的空成员")).toBeNull();
  });
  it("refreshes completion, overdue and daily labels", () => {
    const view = render(<GroupDailyRecords selectedDate={date} />);
    provide(summary({ tasks: [task({ title: "每天阅读", recurrence: "daily", completed: true }), task({ id: "late", creator_id: friend.id, title: "昨天的小事", target_date: "2026-10-12", overdue: true })], checkins: [{ member_id: me.id, checked_in_at: "2026-10-13T02:00:00.000Z" }] }));
    view.rerender(<GroupDailyRecords selectedDate={date} />);
    expect(screen.getByText("每天阅读")).toBeTruthy();
    expect(screen.getByText("每天")).toBeTruthy();
    expect(screen.getByText("逾期未完成")).toBeTruthy();
    expect(within(screen.getByRole("article", { name: "小袁的记录" })).getByText("已完成打卡")).toBeTruthy();
  });
  it("offers retry feedback when summary fails", () => {
    provide(null, "网络连接失败"); render(<GroupDailyRecords selectedDate={date} />);
    expect(screen.getByRole("alert").textContent).toContain("网络连接失败");
    fireEvent.click(screen.getByRole("button", { name: "重试加载" })); expect(reload).toHaveBeenCalledOnce();
  });
  it("renders notes as plain text", () => {
    provide(summary({ tasks: [task({ notes: "<img src=x onerror=alert(1)>\n安全的文本" })] }));
    const { container } = render(<GroupDailyRecords selectedDate={date} />);
    expect(screen.getByText("<img src=x onerror=alert(1)> 安全的文本")).toBeTruthy(); expect(container.querySelector("img")).toBeNull();
  });
  it("selects and clears the provider historical date", () => {
    const view = render(<CheckinWorkspace spaceId="space-a" memberId={me.id} selectedDate="2026-10-11" />);
    expect(setDate).toHaveBeenCalledWith("2026-10-11"); view.unmount(); expect(setDate).toHaveBeenLastCalledWith("");
  });
});
