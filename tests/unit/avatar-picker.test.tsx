import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Avatar } from "@/components/ui/Avatar";
import { AvatarPicker } from "@/components/avatars/AvatarPicker";
import { AVATAR_OPTIONS, resolveAvatar } from "@/lib/avatars/catalog";
import MembersPage from "@/app/(space)/[spaceId]/members/page";
import * as SpaceModule from "@/components/space/SpaceProvider";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const member = { id: "member-a", nickname: "小伙伴", avatar_color: "#ffeeaa", avatar_id: "cat" };

beforeEach(() => {
  // jsdom does not implement the native modal API; the browser supplies inert and focus containment.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("animal avatars", () => {
  it("renders a cartoon portrait while retaining the member nickname", () => {
    const { container } = render(<Avatar member={{ id: "member-a", nickname: "小伙伴", avatar_color: "#ffeeaa" }} />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector("[title='小伙伴']")).not.toBeNull();
    expect(container.textContent).not.toBe("小");
  });

  it("uses each selected animal and its own palette instead of the old avatar color", () => {
    const { container } = render(<>{AVATAR_OPTIONS.map(option => <Avatar key={option.id} member={{ ...member, avatar_id: option.id }} />)}</>);
    expect(container.querySelectorAll("svg")).toHaveLength(12);
    expect(new Set(Array.from(container.querySelectorAll("svg"), svg => svg.innerHTML)).size).toBe(12);
    for (const option of AVATAR_OPTIONS) {
      const portrait = container.querySelector(`[data-avatar-id='${option.id}']`) as HTMLElement;
      expect(portrait.getAttribute("style")).not.toContain("#ffeeaa");
      const colorProbe = document.createElement("span");
      colorProbe.style.background = option.background;
      expect(portrait.style.background).toBe(colorProbe.style.background);
    }
  });
});

describe("avatar picker", () => {
  it("saves the chosen avatar and refreshes the member after success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ member: { ...member, avatar_id: "rabbit" } }) });
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<AvatarPicker member={member} spaceId="space-a" onSaved={onSaved} />);
    await user.click(screen.getByRole("button", { name: "更换头像" }));
    const dialog = screen.getByRole("dialog", { name: "挑一个喜欢的小伙伴" });
    expect(within(dialog).getAllByRole("radio")).toHaveLength(12);
    await user.click(within(dialog).getByRole("radio", { name: AVATAR_OPTIONS.find(option => option.id === "rabbit")!.label }));
    await user.click(within(dialog).getByRole("button", { name: "保存头像" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetchMock).toHaveBeenCalledWith("/api/spaces/space-a/members/member-a", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ avatarId: "rabbit" }) }));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("cancels a selection without saving it", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { container } = render(<AvatarPicker member={member} spaceId="space-a" onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "更换头像" }));
    await user.click(screen.getByRole("radio", { name: AVATAR_OPTIONS[1].label }));
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelector("[data-avatar-id='cat']")).not.toBeNull();
  });

  it("keeps the selected preview and existing avatar when saving fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: { message: "连接暂时断开，请重试" } }) }));
    const onSaved = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<AvatarPicker member={member} spaceId="space-a" onSaved={onSaved} />);
    await user.click(screen.getByRole("button", { name: "更换头像" }));
    const option = screen.getByRole("radio", { name: AVATAR_OPTIONS[1].label });
    await user.click(option);
    await user.click(screen.getByRole("button", { name: "保存头像" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "连接暂时断开，请重试");
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(option.getAttribute("aria-checked")).toBe("true");
    expect(container.querySelector("[data-avatar-id='cat']")).not.toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("selects the stable default for a member without a saved avatar", async () => {
    const user = userEvent.setup();
    render(<AvatarPicker member={{ ...member, avatar_id: null }} spaceId="space-a" onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "更换头像" }));
    const current = resolveAvatar(null, member.id);
    expect(screen.getByRole("radio", { name: current.label }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("button", { name: "保存头像" })).toHaveProperty("disabled", true);
  });

  it("closes with Escape and restores focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<AvatarPicker member={member} spaceId="space-a" onSaved={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "更换头像" });
    await user.click(trigger);
    expect(document.activeElement?.getAttribute("aria-checked")).toBe("true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("contains Tab focus inside the dialog and supports arrow selection", async () => {
    const user = userEvent.setup();
    render(<AvatarPicker member={member} spaceId="space-a" onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "更换头像" }));
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement?.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement?.getAttribute("aria-label")).toBe(AVATAR_OPTIONS[1].label);
    screen.getByRole("button", { name: "关闭头像选择" }).focus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "保存头像" }));
  });
});

describe("member avatar controls", () => {
  it("offers a large avatar picker on my card and keeps another member's portrait read only", () => {
    const summary: SpaceModule.SpaceSummary = {
      space: { id: "space-a", name: "我们的小组", timezone: "Asia/Shanghai" },
      member: { ...member, role: "creator" },
      members: [{ ...member, role: "creator" }, { id: "member-b", nickname: "另一位伙伴", role: "member", avatar_id: "dog" }],
      date: "2026-10-13", checkins: [], tasks: [], logs: [], activity: [],
      stats: { checkedIn: 0, totalMembers: 2, completedTasks: 0, totalTasks: 0, streak: 0 },
    };
    vi.spyOn(SpaceModule, "useSpace").mockReturnValue({ spaceId: "space-a", data: summary, date: summary.date, setDate: vi.fn(), loading: false, error: "", connection: "connected", reload: vi.fn() });
    const { container } = render(<MembersPage />);
    const cards = container.querySelectorAll(".member-card");
    expect(within(cards[0] as HTMLElement).getByRole("button", { name: "更换头像" })).toBeDefined();
    expect(within(cards[1] as HTMLElement).queryByRole("button", { name: "更换头像" })).toBeNull();
    expect(cards[1].querySelector("[data-avatar-id='dog']")).not.toBeNull();
  });
});
