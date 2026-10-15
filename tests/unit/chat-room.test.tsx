import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatRoom } from "@/components/chat/ChatRoom";
import * as SpaceModule from "@/components/space/SpaceProvider";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockSpace() {
  vi.spyOn(SpaceModule, "useSpace").mockReturnValue({
    spaceId: "s1",
    data: {
      space: { id: "s1", name: "晨光组", timezone: "Asia/Shanghai" },
      member: { id: "m1", nickname: "小芽", role: "creator", avatar_id: "lion" },
      members: [{ id: "m1", nickname: "小芽", role: "creator", avatar_id: "lion" }],
      date: "2026-10-15",
      checkins: [], tasks: [], logs: [], activity: [],
      stats: { checkedIn: 0, totalMembers: 1, completedTasks: 0, totalTasks: 0, streak: 0 },
    } as never,
    date: "2026-10-15",
    setDate: vi.fn(), loading: false, error: "", connection: "connected", reload: vi.fn(),
  });
}

describe("ChatRoom", () => {
  it("keeps the composer visible and inserts an emoji from the picker", async () => {
    mockSpace();
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(JSON.stringify({}), { status: 200 });
      if (url.endsWith("/conversations")) return new Response(JSON.stringify({ conversations: [{ id: "c1", kind: "group" }] }));
      return new Response(JSON.stringify({ messages: [], nextCursor: null }));
    }));
    render(<ChatRoom />);
    await waitFor(() => expect(screen.getByLabelText("聊天消息")).toBeTruthy());
    expect(screen.getByLabelText("聊天消息")).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "打开表情" }));
    await user.click(screen.getByRole("button", { name: "😊" }));
    expect((screen.getByLabelText("聊天消息") as HTMLTextAreaElement).value).toBe("😊");
  });
});
