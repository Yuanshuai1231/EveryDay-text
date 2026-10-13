import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { TaskBoard } from "@/components/tasks/TaskBoard";
import userEvent from "@testing-library/user-event";
import { CheckinWorkspace } from "@/components/checkin/CheckinWorkspace";
import {
  useSpace,
  type SpaceSummary,
  type Task,
} from "@/components/space/SpaceProvider";
vi.mock("@/components/space/SpaceProvider", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/components/space/SpaceProvider")
  >()),
  useSpace: vi.fn(),
}));
const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: routerPush }) }));
const date = "2026-10-13";
const reload = vi.fn().mockResolvedValue(undefined);
const setDate = vi.fn();
const version = "2026-10-13T01:00:00Z";
function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "mine",
    creator_id: "me",
    scope: "group",
    assignee_id: overrides.creator_id ?? "me",
    title: "阅读十分钟",
    notes: "带着问题读",
    target_date: "2026-10-12",
    recurrence: "once",
    overdue: true,
    occurrence_date: date,
    completed: false,
    updated_at: version,
    created_at: version,
    ...overrides,
  };
}
function summary(
  tasks = [
    task(),
    task({ id: "other", creator_id: "friend", title: "伙伴的任务" }),
  ],
): SpaceSummary {
  return {
    space: { id: "space", name: "一起成长", timezone: "Asia/Shanghai" },
    member: { id: "me", nickname: "我" },
    members: [
      { id: "me", nickname: "我" },
      { id: "friend", nickname: "伙伴" },
    ],
    date,
    tasks,
    checkins: [],
    logs: [],
    activity: [],
    stats: {
      checkedIn: 0,
      totalMembers: 2,
      completedTasks: 0,
      totalTasks: tasks.length,
      streak: 0,
    },
  };
}
function provide(data = summary(), selectedDate = date) {
  vi.mocked(useSpace).mockReturnValue({
    data,
    spaceId: "space",
    date: selectedDate,
    setDate,
    reload,
    loading: false,
    error: "",
    connection: "connected",
  });
}
function response(ok = true, message = ""): Response {
  return new Response(JSON.stringify(ok ? {} : { error: { message } }), {
    status: ok ? 200 : 409,
    headers: { "content-type": "application/json" },
  });
}
describe("task checklist interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    provide();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });
  it("offers once or daily recurrence on creation", async () => {
    render(<TaskBoard />);
    fireEvent.click(screen.getByRole("button", { name: "添加任务" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(
      within(dialog).getByRole("textbox", { name: "任务名称" }),
      { target: { value: "跑步" } },
    );
    fireEvent.click(within(dialog).getByRole("radio", { name: "每天" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "保存小目标" }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [, options] = vi.mocked(fetch).mock.calls[0];
    expect(options?.method).toBe("POST");
    expect(JSON.parse(options?.body as string)).toEqual({
      title: "跑步",
      notes: "",
      targetDate: date,
      recurrence: "daily",
      scope: "group",
      assigneeId: "me",
    });
  });
  it("allows the assignee to complete and the creator to edit or delete a row", () => {
    render(<TaskBoard />);
    expect(
      screen.getByRole("checkbox", { name: "完成任务：阅读十分钟" }),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("checkbox", {
          name: "完成任务：伙伴的任务",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      screen.queryByRole("button", { name: "编辑任务：伙伴的任务" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "删除任务：伙伴的任务" }),
    ).toBeNull();
    expect(screen.getAllByText("逾期未完成")).toHaveLength(2);
  });
  it("keeps focus in notes while typing and restores focus on closing", async () => {
    render(<TaskBoard />);
    const user = userEvent.setup();
    const edit = screen.getByRole("button", { name: "编辑任务：阅读十分钟" });
    await user.click(edit);
    const notes = screen.getByRole("textbox", { name: /补充说明/ });
    await user.clear(notes);
    await user.type(notes, "记下完整备注");
    expect(notes).toHaveProperty("value", "记下完整备注");
    expect(document.activeElement).toBe(notes);
    expect(screen.getByRole("textbox", { name: "任务名称" })).toHaveProperty(
      "value",
      "阅读十分钟",
    );
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(edit);
  });
  it("persists changing an unfinished once task to daily", async () => {
    render(<TaskBoard />);
    fireEvent.click(
      screen.getByRole("button", { name: "编辑任务：阅读十分钟" }),
    );
    fireEvent.click(screen.getByRole("radio", { name: "每天" }));
    fireEvent.click(screen.getByRole("button", { name: "保存小目标" }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(
      JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string),
    ).toMatchObject({ recurrence: "daily", updatedAt: version, date });
  });
  it("sends selected date and version without premature completion", async () => {
    let finish!: (value: Response) => void;
    vi.mocked(fetch).mockReturnValue(
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    );
    render(<TaskBoard />);
    const toggle = screen.getByRole("checkbox", {
      name: "完成任务：阅读十分钟",
    });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect((toggle as HTMLButtonElement).disabled).toBe(true);
    expect(
      JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string),
    ).toEqual({ completed: true, updatedAt: version, date });
    expect(
      (screen.getByRole("button", { name: "任务日期" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await act(async () => {
      finish(response());
    });
    expect(reload).toHaveBeenCalledOnce();
  });
  it("retains an editing draft and version across shared refreshes", async () => {
    const view = render(<TaskBoard />);
    fireEvent.click(
      screen.getByRole("button", { name: "编辑任务：阅读十分钟" }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "任务名称" }), {
      target: { value: "本地草稿" },
    });
    provide(
      summary([task({ title: "远端的新标题", updated_at: "new-version" })]),
    );
    view.rerender(<TaskBoard />);
    expect(
      (screen.getByRole("textbox", { name: "任务名称" }) as HTMLInputElement)
        .value,
    ).toBe("本地草稿");
    fireEvent.click(screen.getByRole("button", { name: "保存小目标" }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(
      JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string),
    ).toMatchObject({ title: "本地草稿", updatedAt: version, date });
  });
  it("fixes daily schedules and explains whole-series edits", () => {
    provide(summary([task({ recurrence: "daily", overdue: false })]));
    render(<TaskBoard />);
    fireEvent.click(
      screen.getByRole("button", { name: "编辑任务：阅读十分钟" }),
    );
    expect(
      screen.getByText(
        "标题和备注会更新整个每日任务系列，已记录的每日完成状态会保留。",
      ),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "计划日期" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("radio", { name: "仅这一次" }) as HTMLInputElement)
        .disabled,
    ).toBe(true);
  });
  it("shows a failed toggle without false success", async () => {
    vi.mocked(fetch).mockResolvedValue(
      response(false, "任务已被更新，请重新加载后再试"),
    );
    render(<TaskBoard />);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "完成任务：阅读十分钟" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("任务已被更新"),
    );
    expect(
      screen
        .getByRole("checkbox", { name: "完成任务：阅读十分钟" })
        .getAttribute("aria-checked"),
    ).toBe("false");
  });
  it("stops daily repetition from the selected date and retains history", async () => {
    provide(summary([task({ recurrence: "daily", overdue: false })]));
    render(<TaskBoard />);
    fireEvent.click(
      screen.getByRole("button", { name: "删除任务：阅读十分钟" }),
    );
    expect(screen.getByText(/较早日期的任务和完成记录会保留/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "停止重复" }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      `/api/spaces/space/tasks/mine?updatedAt=${encodeURIComponent(version)}&date=${date}`,
    );
  });
  it("shows my checklist and retains the whole-day button", () => {
    provide(
      summary([
        task({ scope: "personal", assignee_id: null }),
        task({
          id: "other",
          creator_id: "friend",
          scope: "personal",
          assignee_id: null,
          title: "伙伴的任务",
        }),
      ]),
    );
    render(
      <CheckinWorkspace spaceId="space" memberId="me" selectedDate={date} />,
    );
    const own = screen.getByRole("region", { name: "我的任务清单" });
    expect(within(own).getByText("阅读十分钟")).toBeTruthy();
    expect(within(own).queryByText("伙伴的任务")).toBeNull();
    expect(
      within(own).getByRole("button", { name: "完成今日打卡 ✓" }),
    ).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "上午记录" })).toBeNull();
  });
  it("does not relabel old tasks during a date transition", () => {
    provide(summary(), "2026-10-14");
    render(<TaskBoard />);
    expect(screen.queryByText("阅读十分钟")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("正在加载");
  });
});
