import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GroupHeroArtwork } from "@/components/space/GroupHeroArtwork";

describe("GroupHeroArtwork", () => {
  it("shows the first two active members and summarizes the rest", () => {
    render(
      <GroupHeroArtwork
        members={[
          { id: "m1", nickname: "袁帅", avatar_id: "lion" },
          { id: "m2", nickname: "然然", avatar_id: "rabbit" },
          { id: "m3", nickname: "小芽", avatar_id: "panda" },
          { id: "m4", nickname: "已离开", avatar_id: "cat", removed_at: "2026-10-01" },
        ]}
      />,
    );

    expect(screen.getByRole("img", { name: "袁帅的狮子头像" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "然然的小兔头像" })).toBeTruthy();
    expect(screen.getByText("+1 位伙伴")).toBeTruthy();
    expect(screen.queryByRole("img", { name: "已离开的猫头像" })).toBeNull();
  });

  it("falls back to the shared mascot when a space has no active members", () => {
    render(<GroupHeroArtwork members={[{ id: "m1", nickname: "离开", removed_at: "2026-10-01" }]} />);
    expect(screen.getByRole("img", { name: "一起加油的小猫与小兔" })).toBeTruthy();
    cleanup();
  });
});
