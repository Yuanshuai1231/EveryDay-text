import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { TaskBoard } from "@/components/tasks/TaskBoard";
import { CheckinWorkspace } from "@/components/checkin/CheckinWorkspace";
import {
  useSpace,
  type SpaceSummary,
  type Task,
} from "@/components/space/SpaceProvider";

vi.mock("@/components/space/SpaceProvider", async (original) => ({
  ...(await original<typeof import("@/components/space/SpaceProvider")>()),
  useSpace: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const date = "2026-10-13";
const version = "2026-10-13T00:00:00Z";
const reload = vi.fn().mockResolvedValue(undefined);
function task(
  id: string,
  title: string,
  creator = "me",
  scope = "personal",
  assignee?: string,
): Task {
  return {
    id,
    title,
    creator_id: creator,
    notes: "",
    target_date: date,
    recurrence: "once",
    completed: false,
    occurrence_date: date,
    updated_at: version,
    created_at: version,
    scope,
    assignee_id: assignee ?? null,
  } as Task;
}
function provide() {
  const data = {
    space: { id: "space", name: "成长小组", timezone: "Asia/Shanghai" },
    member: { id: "me", nickname: "我" },
    members: [
      { id: "me", nickname: "我" },
      { id: "peer", nickname: "小林" },
      { id: "gone", nickname: "离开的成员", removed_at: "2026-10-12" },
    ],
    date,
    tasks: [
      task("personal", "我的个人阅读"),
      task("peer-personal", "小林的个人记录", "peer"),
      task("assigned-peer", "给小林的组内目标", "me", "group", "peer"),
      task("assigned-me", "分配给我的组内目标", "peer", "group", "me"),
    ],
    checkins: [],
    logs: [],
    activity: [],
    stats: {
      checkedIn: 0,
      totalMembers: 2,
      totalTasks: 2,
      completedTasks: 0,
      streak: 0,
    },
  } as SpaceSummary;
  vi.mocked(useSpace).mockReturnValue({
    data,
    spaceId: "space",
    date,
    setDate: vi.fn(),
    reload,
    loading: false,
    error: "",
    connection: "connected",
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  provide();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => Response.json({})),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("group goals stay separate from personal daily tasks", () => {
  it("shows only group goals without a separate member filter", () => {
    render(<TaskBoard />);
    expect(screen.queryByText("我的个人阅读")).toBeNull();
    expect(screen.queryByText("小林的个人记录")).toBeNull();
    expect(screen.getByText("给小林的组内目标")).toBeTruthy();
    expect(screen.getByText("分配给我的组内目标")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "查看成员" })).toBeNull();
  });
  it("creates a group goal for multiple active members", async () => {
    render(<TaskBoard />);
    fireEvent.click(screen.getByRole("button", { name: "添加任务" }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("group", { name: "任务负责人" }),
    ).toBeTruthy();
    expect(
      within(dialog).getByRole("checkbox", { name: "负责人：小林" }),
    ).toBeTruthy();
    expect(
      within(dialog).queryByRole("checkbox", { name: "负责人：离开的成员" }),
    ).toBeNull();
    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: "负责人：小林" }),
    );
    fireEvent.change(
      within(dialog).getByRole("textbox", { name: "任务名称" }),
      { target: { value: "完成小组报告" } },
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "保存小目标" }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(
      JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string),
    ).toMatchObject({
      scope: "group",
      assigneeIds: ["me", "peer"],
      title: "完成小组报告",
      targetDate: date,
    });
  });
  it("separates the creator's editing rights from the assignee's completion rights", async () => {
    render(<TaskBoard />);
    const peerGoal = screen.getByRole("checkbox", {
      name: "完成任务：给小林的组内目标",
    });
    expect(peerGoal).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("button", { name: "编辑任务：给小林的组内目标" }),
    ).toBeTruthy();
    const myGoal = screen.getByRole("checkbox", {
      name: "完成任务：分配给我的组内目标",
    });
    expect(myGoal).toHaveProperty("disabled", false);
    expect(
      screen.queryByRole("button", { name: "编辑任务：分配给我的组内目标" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "删除任务：分配给我的组内目标" }),
    ).toBeNull();
    fireEvent.click(myGoal);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      "/api/spaces/space/tasks/assigned-me",
    );
    expect(
      JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string),
    ).toEqual({ completed: true, updatedAt: version, date });
  });
  it("keeps group assignments out of both personal input and personal record previews", () => {
    render(
      <CheckinWorkspace spaceId="space" memberId="me" selectedDate={date} />,
    );
    expect(screen.queryByText("给小林的组内目标")).toBeNull();
    expect(screen.queryByText("分配给我的组内目标")).toBeNull();
    const own = screen.getByRole("region", { name: "我的任务清单" });
    expect(within(own).getByText("我的个人阅读")).toBeTruthy();
    expect(within(own).queryByText("小林的个人记录")).toBeNull();
  });
  it("creates daily personal records without offering member assignment", async () => {
    render(
      <CheckinWorkspace spaceId="space" memberId="me" selectedDate={date} />,
    );
    fireEvent.click(
      within(screen.getByRole("region", { name: "我的任务清单" })).getByRole(
        "button",
        { name: "添加任务" },
      ),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).queryByRole("combobox", { name: "任务负责人" }),
    ).toBeNull();
    fireEvent.change(
      within(dialog).getByRole("textbox", { name: "任务名称" }),
      { target: { value: "个人目标" } },
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "保存小目标" }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const payload = JSON.parse(
      vi.mocked(fetch).mock.calls[0][1]?.body as string,
    );
    expect(payload.scope).toBe("personal");
    expect(payload.assigneeId).toBeUndefined();
  });
});
