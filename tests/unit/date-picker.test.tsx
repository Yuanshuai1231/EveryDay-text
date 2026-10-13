import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { existsSync } from "node:fs";
import path from "node:path";
import { useState, type ComponentType } from "react";

type Props = { value: string; onChange: (value: string) => void; label?: string; name?: string; timeZone?: string; disabled?: boolean };
let DatePicker: ComponentType<Props> | undefined;
beforeAll(async () => {
  const filename = path.resolve("components/ui/DatePicker.tsx");
  if (existsSync(filename)) DatePicker = (await import(filename)).DatePicker;
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
function Picker(props: Partial<Props> = {}) {
  expect(DatePicker).toBeDefined();
  const Component = DatePicker!;
  const [value, setValue] = useState(props.value ?? "2026-10-13");
  return <Component value={value} onChange={setValue} label="任务日期" {...props} />;
}
const day = (value: string) => screen.getByRole("button", { name: value });

describe("custom date picker", () => {
  it("opens a Monday-start calendar and selects a date without submitting its form", async () => {
    const submit = vi.fn();
    const { container } = render(<form onSubmit={submit}><Picker name="date" /></form>);
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "任务日期" });
    await user.click(trigger);
    const grid = screen.getByRole("grid", { name: "2026年10月" });
    expect(within(grid).getAllByRole("columnheader").map(header => header.textContent)).toEqual(["一", "二", "三", "四", "五", "六", "日"]);
    expect(day("2026年10月13日")).toBe(document.activeElement);
    await user.click(day("2026年10月16日"));
    expect(container.querySelector<HTMLInputElement>("input[name='date']")?.value).toBe("2026-10-16");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toBe(document.activeElement);
    expect(submit).not.toHaveBeenCalled();
  });

  it("moves between months and uses the requested time zone for today", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-13T23:30:00Z"));
    render(<Picker timeZone="Asia/Hong_Kong" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "任务日期" }));
    expect(day("2026年10月14日").getAttribute("aria-current")).toBe("date");
    await user.click(screen.getByRole("button", { name: "上个月" }));
    expect(screen.getByRole("grid", { name: "2026年9月" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "下个月" }));
    expect(screen.getByRole("grid", { name: "2026年10月" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "回到今天" }));
    expect(screen.getByRole("button", { name: "任务日期" }).textContent).toContain("2026年10月14日");
  });

  it("supports arrows, week edges and clamped month movement with a single focusable date", async () => {
    render(<Picker value="2026-01-31" />);
    await userEvent.setup().click(screen.getByRole("button", { name: "任务日期" }));
    fireEvent.keyDown(document.activeElement!, { key: "PageDown" });
    expect(day("2026年2月28日")).toBe(document.activeElement);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(day("2026年3月1日")).toBe(document.activeElement);
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(day("2026年2月23日")).toBe(document.activeElement);
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(day("2026年3月1日")).toBe(document.activeElement);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(day("2026年2月22日")).toBe(document.activeElement);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(day("2026年3月1日")).toBe(document.activeElement);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(day("2026年2月28日")).toBe(document.activeElement);
    fireEvent.keyDown(document.activeElement!, { key: "PageUp" });
    expect(day("2026年1月28日")).toBe(document.activeElement);
    const buttons = within(screen.getByRole("grid")).getAllByRole("button");
    expect(buttons.filter(button => button.tabIndex === 0)).toHaveLength(1);
  });

  it("closes on Escape or outside interaction and restores trigger focus", async () => {
    render(<><Picker /><button type="button">外部按钮</button></>);
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "任务日期" });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toBe(document.activeElement);
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "外部按钮" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "外部按钮" })).toBe(document.activeElement);
  });

  it("keeps disabled pickers closed and their hidden form control disabled", async () => {
    const { container } = render(<Picker disabled name="date" />);
    await userEvent.setup().click(screen.getByRole("button", { name: "任务日期" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(container.querySelector<HTMLInputElement>("input[name='date']")?.disabled).toBe(true);
  });
});
