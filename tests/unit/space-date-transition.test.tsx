import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { SpaceProvider, useSpace } from "@/components/space/SpaceProvider";
import SpaceOverview from "@/app/(space)/[spaceId]/page";
import { TaskBoard } from "@/components/tasks/TaskBoard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({
    children,
    ...props
  }: React.PropsWithChildren<{ href: string }>) => <a {...props}>{children}</a>,
}));
class Events {
  onopen = null;
  onerror = null;
  addEventListener() {}
  close() {}
}
const me = { id: "me", nickname: "小伙伴" };
function data(date: string, content: string) {
  return {
    space: { id: "space", name: "小组", timezone: "Asia/Shanghai" },
    member: me,
    members: [me],
    date,
    checkins: [],
    tasks: [
      {
        id: "task",
        creator_id: "me",
        scope: "group",
        assignee_id: "me",
        title: `任务：${content}`,
        notes: "",
        target_date: date,
        completed: false,
        updated_at: "2026-10-13T00:00:00Z",
        created_at: "2026-10-13T00:00:00Z",
      },
    ],
    logs: [{ id: "log", member_id: "me", slot: "morning", content }],
    activity: [],
    stats: {
      checkedIn: 0,
      totalMembers: 1,
      completedTasks: 0,
      totalTasks: 0,
      streak: 0,
    },
  };
}
function Preview({ view }: { view: "overview" | "tasks" }) {
  const { setDate, reload } = useSpace();
  return (
    <>
      <button onClick={() => setDate("2026-10-12")}>历史日期</button>
      <button onClick={() => setDate("")}>返回今天</button>
      <button onClick={() => void reload()}>重新加载数据</button>
      {view === "overview" ? <SpaceOverview /> : <TaskBoard />}
    </>
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("space date transitions", () => {
  it.each(["overview", "tasks"] as const)(
    "%s never labels a previous summary as the newly selected day",
    async (view) => {
      const prefix = "任务：";
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-13T03:00:00Z"));
      vi.stubGlobal("EventSource", Events);
      let resolveHistory!: (response: Response) => void;
      let resolveToday!: (response: Response) => void;
      let initial = true;
      vi.stubGlobal(
        "fetch",
        vi.fn((url: string) => {
          if (url.includes("date=2026-10-12"))
            return new Promise<Response>((resolve) => {
              resolveHistory = resolve;
            });
          if (initial) {
            initial = false;
            return Promise.resolve(
            Response.json(data("2026-10-13", "今天的记录")),
            );
          }
          return new Promise<Response>((resolve) => {
            resolveToday = resolve;
          });
        }),
      );
      render(
        <SpaceProvider spaceId="space">
          <Preview view={view} />
        </SpaceProvider>,
      );
      await waitFor(() => expect(screen.queryAllByText(`${prefix}今天的记录`).length).toBeGreaterThan(0));
      fireEvent.click(screen.getByRole("button", { name: "历史日期" }));
      await waitFor(() => expect(resolveHistory).toBeTypeOf("function"));
      expect(screen.queryAllByText(`${prefix}今天的记录`)).toHaveLength(0);
      resolveHistory(Response.json(data("2026-10-12", "昨天的记录")));
      await waitFor(() => expect(screen.queryAllByText(`${prefix}昨天的记录`).length).toBeGreaterThan(0));
      fireEvent.click(screen.getByRole("button", { name: "返回今天" }));
      await waitFor(() => expect(resolveToday).toBeTypeOf("function"));
      expect(screen.queryAllByText(`${prefix}昨天的记录`)).toHaveLength(0);
      resolveToday(Response.json(data("2026-10-13", "今天的记录")));
      await waitFor(() => expect(screen.queryAllByText(`${prefix}今天的记录`).length).toBeGreaterThan(0));
    },
  );

  it("coalesces duplicate refreshes while a summary request is in flight", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-13T03:00:00Z"));
    vi.stubGlobal("EventSource", Events);
    let initial = true;
    let resolveRefresh!: (response: Response) => void;
    const fetchMock = vi.fn(() => {
      if (initial) {
        initial = false;
        return Promise.resolve(Response.json(data("2026-10-13", "今天的记录")));
      }
      return new Promise<Response>((resolve) => {
        resolveRefresh = resolve;
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <SpaceProvider spaceId="space">
        <Preview view="overview" />
      </SpaceProvider>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "重新加载数据" }));
    fireEvent.click(screen.getByRole("button", { name: "重新加载数据" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    resolveRefresh(Response.json(data("2026-10-13", "刷新完成")));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });
});
