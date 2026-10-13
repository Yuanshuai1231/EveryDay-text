"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { isValidWorkDate, localDateInTimeZone } from "@/lib/data/checkins";
import styles from "./DatePicker.module.css";

export type DatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  name?: string;
  timeZone?: string;
  disabled?: boolean;
};
function parseDate(value: string) { return new Date(`${value}T00:00:00Z`); }
function dateValue(date: Date) { return date.toISOString().slice(0, 10); }
function monthValue(value: string) { return `${value.slice(0, 7)}-01`; }
function dateLabel(value: string) { const [year, month, day] = value.split("-").map(Number); return `${year}年${month}月${day}日`; }
function shiftDays(value: string, amount: number) { const date = parseDate(value); date.setUTCDate(date.getUTCDate() + amount); return dateValue(date); }
function shiftMonth(value: string, amount: number) {
  const date = parseDate(value);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + amount);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return dateValue(date);
}

export function DatePicker({ value, onChange, label = "选择日期", name, timeZone = "Asia/Shanghai", disabled = false }: DatePickerProps) {
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const calendar = useRef<HTMLTableElement>(null);
  const id = useId();
  const today = localDateInTimeZone(new Date(), timeZone);
  const selected = isValidWorkDate(value) ? value : "";
  const [open, setOpen] = useState(false);
  const [focusedDate, setFocusedDate] = useState(selected || today);
  const [month, setMonth] = useState(monthValue(selected || today));
  const [position, setPosition] = useState({ top: 80, left: 18 });

  function close() { setOpen(false); trigger.current?.focus(); }
  function openCalendar() {
    const initialDate = selected || today;
    setFocusedDate(initialDate);
    setMonth(monthValue(initialDate));
    setOpen(true);
  }
  function moveFocus(next: string) { setFocusedDate(next); setMonth(monthValue(next)); }
  function selectDate(next: string) { onChange(next); close(); }

  const positionCalendar = useCallback(() => {
    if (!open || !trigger.current) return;
    const bounds = trigger.current.getBoundingClientRect();
    const width = Math.min(294, window.innerWidth - 36);
    const height = calendar.current?.parentElement?.getBoundingClientRect().height ?? 380;
    const left = bounds.right + width > window.innerWidth - 18
      ? Math.max(18, bounds.right - width)
      : Math.max(18, bounds.left);
    const roomBelow = window.innerHeight - bounds.bottom - 10;
    const top = roomBelow < height && bounds.top > roomBelow
      ? Math.max(10, bounds.top - height - 10)
      : Math.min(bounds.bottom + 9, window.innerHeight - height - 10);
    setPosition({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    positionCalendar();
    window.addEventListener("resize", positionCalendar);
    window.addEventListener("scroll", positionCalendar, true);
    return () => {
      window.removeEventListener("resize", positionCalendar);
      window.removeEventListener("scroll", positionCalendar, true);
    };
  }, [open, positionCalendar, focusedDate, month]);

  useEffect(() => {
    if (!open) return;
    calendar.current?.querySelector<HTMLButtonElement>(`[data-date='${focusedDate}']`)?.focus();
  }, [open, focusedDate, month]);

  useEffect(() => {
    if (!open) return;
    function outside(event: MouseEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("click", outside);
    return () => document.removeEventListener("click", outside);
  }, [open]);

  function navigate(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const weekDay = (parseDate(date).getUTCDay() + 6) % 7;
    const next = event.key === "ArrowLeft" ? shiftDays(date, -1)
      : event.key === "ArrowRight" ? shiftDays(date, 1)
      : event.key === "ArrowUp" ? shiftDays(date, -7)
      : event.key === "ArrowDown" ? shiftDays(date, 7)
      : event.key === "Home" ? shiftDays(date, -weekDay)
      : event.key === "End" ? shiftDays(date, 6 - weekDay)
      : event.key === "PageUp" ? shiftMonth(date, -1)
      : event.key === "PageDown" ? shiftMonth(date, 1) : null;
    if (next) { event.preventDefault(); moveFocus(next); }
  }
  const first = parseDate(month);
  const offset = (first.getUTCDay() + 6) % 7;
  const gridStart = shiftDays(month, -offset);
  const monthLabel = `${first.getUTCFullYear()}年${first.getUTCMonth() + 1}月`;
  const weeks = Array.from({ length: 6 }, (_, week) => Array.from({ length: 7 }, (_, day) => shiftDays(gridStart, week * 7 + day)));

  return <div className={styles.root} ref={root} onBlur={(event) => { if (open && event.relatedTarget instanceof Node && !root.current?.contains(event.relatedTarget)) setOpen(false); }}>
    {name && <input type="hidden" name={name} value={selected} disabled={disabled} />}
    <button ref={trigger} type="button" className={styles.trigger} aria-label={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-calendar` : undefined} disabled={disabled} onClick={() => open ? close() : openCalendar()}>
      <CalendarDays size={16} aria-hidden="true" /><span>{selected ? dateLabel(selected) : "选择日期"}</span><ChevronRight size={14} className={open ? styles.openArrow : styles.arrow} aria-hidden="true" />
    </button>
    {open && <div id={`${id}-calendar`} role="dialog" aria-labelledby={`${id}-month`} className={styles.calendar} style={{ "--date-picker-top": `${position.top}px`, "--date-picker-left": `${position.left}px` } as React.CSSProperties} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } }}>
      <div className={styles.header}>
        <button type="button" aria-label="上个月" onClick={() => moveFocus(shiftMonth(focusedDate, -1))}><ChevronLeft size={17} /></button>
        <strong id={`${id}-month`} aria-live="polite">{monthLabel}</strong>
        <button type="button" aria-label="下个月" onClick={() => moveFocus(shiftMonth(focusedDate, 1))}><ChevronRight size={17} /></button>
      </div>
      <table ref={calendar} role="grid" aria-label={monthLabel} className={styles.grid}>
        <thead><tr>{["一", "二", "三", "四", "五", "六", "日"].map(day => <th key={day} scope="col">{day}</th>)}</tr></thead>
        <tbody>{weeks.map((week, index) => <tr key={index}>{week.map(date => <td key={date} aria-selected={date === selected}><button type="button" data-date={date} tabIndex={date === focusedDate ? 0 : -1} aria-label={dateLabel(date)} aria-current={date === today ? "date" : undefined} className={`${styles.day} ${date.slice(0, 7) !== month.slice(0, 7) ? styles.adjacent : ""} ${date === selected ? styles.selected : ""} ${date === today ? styles.today : ""}`} onKeyDown={event => navigate(event, date)} onFocus={() => setFocusedDate(date)} onClick={() => selectDate(date)}>{parseDate(date).getUTCDate()}</button></td>)}</tr>)}</tbody>
      </table>
      <div className={styles.footer}><span><i />今天</span><button type="button" aria-label="回到今天" onClick={() => selectDate(today)}>回到今天</button></div>
      <p className={styles.visuallyHidden}>方向键移动日期，Home 和 End 跳到本周首尾，Page Up 和 Page Down 切换月份。</p>
    </div>}
  </div>;
}
