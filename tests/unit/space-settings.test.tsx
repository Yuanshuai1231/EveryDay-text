import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SpaceSettings from "@/components/space/SpaceSettings";
import * as SpaceModule from "@/components/space/SpaceProvider";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  navigation.replace.mockClear();
});

describe("space settings", () => {
  it("keeps settings read-only for members and lets them leave for the space list", async () => {
    vi.spyOn(SpaceModule, "useSpace").mockReturnValue({
      spaceId: "s1",
      data: {
        space: {
          id: "s1",
          name: "晨光组",
          timezone: "Asia/Shanghai",
          avatar_id: "cat",
        },
        member: { id: "m1", nickname: "小芽", role: "member" },
        members: [],
        date: "2026-10-13",
        checkins: [],
        tasks: [],
        logs: [],
        activity: [],
        stats: {
          checkedIn: 0,
          totalMembers: 0,
          completedTasks: 0,
          totalTasks: 0,
          streak: 0,
        },
      } as never,
      date: "2026-10-13",
      setDate: vi.fn(),
      loading: false,
      error: "",
      connection: "connected",
      reload: vi.fn(),
    });
    render(<SpaceSettings />);
    expect(screen.getByDisplayValue("晨光组")).toHaveProperty("readOnly", true);
    expect(screen.queryByRole("button", { name: "保存设置" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "删除空间 晨光组" }),
    ).toBeNull();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "退出空间 晨光组" }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/spaces/s1/leave",
      expect.objectContaining({ method: "POST" }),
    );
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith("/spaces"),
    );
  });

  it("saves creator name and avatar and reports failures", async () => {
    vi.spyOn(SpaceModule, "useSpace").mockReturnValue({
      spaceId: "s1",
      data: {
        space: {
          id: "s1",
          name: "晨光组",
          timezone: "Asia/Shanghai",
          avatar_id: "cat",
        },
        member: { id: "m1", nickname: "小芽", role: "creator" },
        members: [],
        date: "2026-10-13",
        checkins: [],
        tasks: [],
        logs: [],
        activity: [],
        stats: {
          checkedIn: 0,
          totalMembers: 0,
          completedTasks: 0,
          totalTasks: 0,
          streak: 0,
        },
      } as never,
      date: "2026-10-13",
      setDate: vi.fn(),
      loading: false,
      error: "",
      connection: "connected",
      reload: vi.fn(),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { message: "保存失败" } }),
      }),
    );
    render(<SpaceSettings />);
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("空间名称"));
    await user.type(screen.getByLabelText("空间名称"), "新晨光组");
    await user.click(screen.getByRole("radio", { name: "咖啡杯" }));
    await user.click(screen.getByRole("button", { name: "保存设置" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("保存失败"),
    );
  });

  it("refreshes the space after a creator saves the new name and object", async () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(SpaceModule, "useSpace").mockReturnValue({
      spaceId: "s1",
      data: {
        space: {
          id: "s1",
          name: "晨光组",
          timezone: "Asia/Shanghai",
          avatar_id: "cat",
        },
        member: { id: "m1", nickname: "小芽", role: "creator" },
        members: [],
        date: "2026-10-13",
        checkins: [],
        tasks: [],
        logs: [],
        activity: [],
        stats: {
          checkedIn: 0,
          totalMembers: 0,
          completedTasks: 0,
          totalTasks: 0,
          streak: 0,
        },
      } as never,
      date: "2026-10-13",
      setDate: vi.fn(),
      loading: false,
      error: "",
      connection: "connected",
      reload,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SpaceSettings />);
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("空间名称"));
    await user.type(screen.getByLabelText("空间名称"), "新晨光组");
    await user.click(screen.getByRole("radio", { name: "咖啡杯" }));
    await user.click(screen.getByRole("button", { name: "保存设置" }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/spaces/s1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "新晨光组", avatarId: "coffee" }),
      }),
    );
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(screen.getByRole("status").textContent).toContain("空间资料已更新");
  });
});
