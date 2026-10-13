import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { GroupDailyRecords } from "@/components/checkin/GroupDailyRecords";
import { CheckinWorkspace } from "@/components/checkin/CheckinWorkspace";
import { useSpace, type SpaceSummary } from "@/components/space/SpaceProvider";
import { loadDraft } from "@/lib/offline/drafts";

vi.mock("@/components/space/SpaceProvider", () => ({ useSpace: vi.fn() }));
vi.mock("@/lib/offline/drafts", () => ({
  loadDraft: vi.fn(),
  saveDraft: vi.fn().mockResolvedValue(undefined),
  clearDraft: vi.fn().mockResolvedValue(undefined),
}));

const date = "2026-10-13";
const me = { id: "member-a", nickname: "小袁" };
const friend = { id: "member-b", nickname: "小林" };
const reload = vi.fn().mockResolvedValue(undefined);
const setDate = vi.fn();

function summary(overrides: Partial<SpaceSummary> = {}): SpaceSummary {
  return {
    space: { id: "space-a", name: "一起进步", timezone: "Asia/Shanghai" },
    member: me,
    members: [me, friend],
    date,
    checkins: [],
    tasks: [],
    activity: [],
    logs: [
      {
        id: "log-a",
        member_id: me.id,
        slot: "morning",
        content: "已经保存的记录",
        work_date: date,
        edited_at: "2026-10-13T01:15:00.000Z",
      },
      {
        id: "log-b",
        member_id: friend.id,
        slot: "afternoon",
        content: "读完两章\n整理了笔记",
        work_date: date,
        edited_at: "2026-10-13T04:00:00.000Z",
      },
    ],
    stats: {
      checkedIn: 0,
      totalMembers: 2,
      completedTasks: 0,
      totalTasks: 0,
      streak: 0,
    },
    ...overrides,
  };
}

function provide(data: SpaceSummary | null = summary(), error = "") {
  vi.mocked(useSpace).mockReturnValue({
    spaceId: "space-a",
    data,
    date: data?.date ?? "",
    setDate,
    reload,
    error,
    loading: !data,
    connection: "connected",
  });
}

describe("shared daily records", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadDraft).mockResolvedValue(null);
    provide();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows each member's saved records before they complete check-in", () => {
    render(<GroupDailyRecords selectedDate={date} />);
    const ownCard = screen.getByRole("article", { name: "小袁的记录" });
    const friendCard = screen.getByRole("article", { name: "小林的记录" });
    expect(within(ownCard).getByText("已经保存的记录")).toBeTruthy();
    expect(within(ownCard).getByText("我")).toBeTruthy();
    expect(within(friendCard).getByText("读完两章 整理了笔记")).toBeTruthy();
    expect(within(friendCard).getByText("未完成打卡")).toBeTruthy();
    expect(within(ownCard).getByText(/09:15/)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("hides the previous day's summary while the selected history is loading", () => {
    render(<GroupDailyRecords selectedDate="2026-10-11" />);
    expect(screen.queryByText("已经保存的记录")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("正在加载");
  });

  it("only shows logs for the selected historical day", () => {
    provide(
      summary({
        date: "2026-10-11",
        logs: [
          {
            id: "history",
            member_id: friend.id,
            slot: "morning",
            content: "历史记录",
            work_date: "2026-10-11",
          },
          {
            id: "other",
            member_id: me.id,
            slot: "morning",
            content: "其他日期的记录",
            work_date: date,
          },
        ],
      }),
    );
    render(<GroupDailyRecords selectedDate="2026-10-11" />);
    expect(screen.getByText("历史记录")).toBeTruthy();
    expect(screen.queryByText("其他日期的记录")).toBeNull();
  });

  it("keeps active empty members and labels saved history from departed members", () => {
    provide(
      summary({
        members: [
          me,
          friend,
          { id: "old", nickname: "旧伙伴", removed_at: "2026-10-12" },
          {
            id: "empty-old",
            nickname: "离开的空成员",
            removed_at: "2026-10-12",
          },
        ],
        logs: [
          {
            id: "old-log",
            member_id: "old",
            slot: "morning",
            content: "留下的记录",
            work_date: date,
          },
        ],
      }),
    );
    render(<GroupDailyRecords selectedDate={date} />);
    expect(
      within(screen.getByRole("article", { name: "小林的记录" })).getAllByText(
        "还没有记录",
      ),
    ).toHaveLength(2);
    expect(
      within(screen.getByRole("article", { name: "旧伙伴的记录" })).getByText(
        "已离开 · 历史记录",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("离开的空成员")).toBeNull();
  });

  it("reflects shared updates with completion status independent of content", () => {
    const view = render(<GroupDailyRecords selectedDate={date} />);
    provide(
      summary({
        logs: [
          {
            id: "new",
            member_id: friend.id,
            slot: "afternoon",
            content: "伙伴刚更新的内容",
            work_date: date,
          },
        ],
        checkins: [
          { member_id: me.id, checked_in_at: "2026-10-13T02:00:00.000Z" },
        ],
      }),
    );
    view.rerender(<GroupDailyRecords selectedDate={date} />);
    expect(
      within(screen.getByRole("article", { name: "小林的记录" })).getByText(
        "伙伴刚更新的内容",
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("article", { name: "小林的记录" })).getByText(
        "未完成打卡",
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("article", { name: "小袁的记录" })).getByText(
        "已完成打卡",
      ),
    ).toBeTruthy();
  });

  it("offers retry feedback when the shared summary fails", () => {
    provide(null, "网络连接失败");
    render(<GroupDailyRecords selectedDate={date} />);
    expect(screen.getByRole("alert").textContent).toContain("网络连接失败");
    fireEvent.click(screen.getByRole("button", { name: "重试加载" }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it("renders saved content as plain text", () => {
    provide(
      summary({
        logs: [
          {
            id: "markup",
            member_id: friend.id,
            slot: "morning",
            content: "<img src=x onerror=alert(1)>\n安全的文本",
            work_date: date,
          },
        ],
      }),
    );
    const { container } = render(<GroupDailyRecords selectedDate={date} />);
    expect(
      screen.getByText("<img src=x onerror=alert(1)> 安全的文本"),
    ).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("keeps local edits private until successful save and preserves them through shared updates", async () => {
    vi.useFakeTimers();
    let finishSave!: (value: unknown) => void;
    const fetchMock = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        finishSave = resolve;
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const props = {
      spaceId: "space-a",
      memberId: me.id,
      selectedDate: date,
      initialMorning: {
        content: "已经保存的记录",
        editedAt: "2026-10-13T01:15:00.000Z",
      },
    };
    const view = render(<CheckinWorkspace {...props} />);
    await act(async () => {});
    fireEvent.change(screen.getByRole("textbox", { name: "上午记录" }), {
      target: { value: "本地还没保存的草稿" },
    });
    expect(
      within(screen.getByRole("article", { name: "小袁的记录" })).queryByText(
        "本地还没保存的草稿",
      ),
    ).toBeNull();
    provide(
      summary({
        logs: [
          {
            id: "teammate",
            member_id: friend.id,
            slot: "morning",
            content: "队友更新",
            work_date: date,
          },
        ],
      }),
    );
    view.rerender(<CheckinWorkspace {...props} />);
    expect(
      (screen.getByRole("textbox", { name: "上午记录" }) as HTMLTextAreaElement)
        .value,
    ).toBe("本地还没保存的草稿");
    expect(loadDraft).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(reload).not.toHaveBeenCalled();
    await act(async () => {
      finishSave({
        ok: true,
        status: 200,
        json: async () => ({ log: { edited_at: "2026-10-13T01:16:00.000Z" } }),
      });
    });
    expect(reload).toHaveBeenCalledOnce();
    provide(
      summary({
        logs: [
          {
            id: "saved",
            member_id: me.id,
            slot: "morning",
            content: "本地还没保存的草稿",
            work_date: date,
          },
        ],
      }),
    );
    view.rerender(<CheckinWorkspace {...props} />);
    expect(
      within(screen.getByRole("article", { name: "小袁的记录" })).getByText(
        "本地还没保存的草稿",
      ),
    ).toBeTruthy();
  });

  it("selects the provider's historical date and resets it when leaving check-in", () => {
    const view = render(
      <CheckinWorkspace
        spaceId="space-a"
        memberId={me.id}
        selectedDate="2026-10-11"
      />,
    );
    expect(setDate).toHaveBeenCalledWith("2026-10-11");
    view.unmount();
    expect(setDate).toHaveBeenLastCalledWith("");
  });
});
