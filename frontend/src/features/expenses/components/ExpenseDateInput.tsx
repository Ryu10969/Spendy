import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import { calendarDate, calendarWeekday, daysInMonth, moveCalendarDate, moveCalendarMonth, parseCalendarDate } from "./calendarDates";
import { useExpensePicker } from "./useExpensePicker";
import pickerStyles from "./ExpensePicker.module.css";
import styles from "./ExpenseDateInput.module.css";

type Props = {
  id: string;
  value: string;
  invalid: boolean;
  describedBy: string;
  onChange: (value: string) => void;
  precision?: "day" | "month";
  label?: string;
  min?: string;
  max?: string;
  active?: boolean;
  onOpen?: () => void;
};

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

function localToday(): string {
  const now = new Date();
  return calendarDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function ExpenseDateInput({ id, value, invalid, describedBy, onChange, precision = "day", label = "支払日", min, max, active = true, onOpen }: Props) {
  const { open, setOpen, inline, overlay, root, trigger, panel, close } = useExpensePicker(336);
  const monthOnly = precision === "month";
  const selectedDate = monthOnly ? `${value}-01` : value;
  const output = (date: string) => monthOnly ? date.slice(0,7) : date;
  const allowed = (date: string) => (!min || output(date) >= min) && (!max || output(date) <= max);
  const initialDate = () => {
    const date = parseCalendarDate(selectedDate) ? selectedDate : localToday();
    if (min && output(date) < min) return monthOnly ? `${min}-01` : min;
    if (max && output(date) > max) return monthOnly ? `${max}-01` : max;
    return date;
  };
  const [focusedDate, setFocusedDate] = useState(initialDate);
  const today = localToday();
  const { year, month } = parseCalendarDate(focusedDate)!;
  const heading = `${year}年${month}月`;
  const leading = calendarWeekday(calendarDate(year, month, 1));
  const cells = Array.from({ length: Math.ceil((leading + daysInMonth(year, month)) / 7) * 7 }, (_, index) => {
    const day = index - leading + 1;
    return day >= 1 && day <= daysInMonth(year, month) ? calendarDate(year, month, day) : null;
  });
  useEffect(() => {
    if (open) panel.current?.querySelector<HTMLButtonElement>(`[data-date="${focusedDate}"]`)?.focus();
  }, [open, focusedDate, inline, panel]);
  useEffect(() => { if (!active && open) setOpen(false); }, [active, open, setOpen]);

  const dateKeyDown = (event: KeyboardEvent<HTMLButtonElement>, date: string) => {
    const dayOffsets: Record<string, number> = {
      ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7,
      Home: -calendarWeekday(date), End: 6 - calendarWeekday(date),
    };
    let next: string | null;
    if (event.key in dayOffsets) next = moveCalendarDate(date, dayOffsets[event.key]);
    else if (event.key === "PageUp" || event.key === "PageDown") {
      next = moveCalendarMonth(date, (event.key === "PageUp" ? -1 : 1) * (event.shiftKey ? 12 : 1));
    } else return;
    event.preventDefault();
    event.stopPropagation();
    if (next && allowed(next)) setFocusedDate(next);
  };

  return <div ref={root} className={styles.root} data-expense-date-root
    onBlur={(event) => {
      if (open && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) close(false);
    }}
    onKeyDownCapture={(event) => {
      if (!open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (event.key === "Tab" && panel.current?.contains(event.target as Node)) {
        const buttons = Array.from(panel.current.querySelectorAll<HTMLButtonElement>('button:not([disabled]):not([tabindex="-1"])'));
        const first = buttons[0], last = buttons.at(-1);
        if ((event.shiftKey && event.target === first) || (!event.shiftKey && event.target === last)) {
          event.preventDefault();
          close();
        }
        // The parent dialog's document listener must not override calendar traversal.
        event.stopPropagation();
      }
    }}>
    <div className={styles.inputRow} data-expense-date-row>
      <input id={id} data-expense-field="date" className={styles.input} type="text"
        placeholder={monthOnly ? "YYYY-MM" : "YYYY-MM-DD"} autoComplete="off" maxLength={monthOnly ? 7 : 10} value={value}
        aria-required="true" aria-invalid={invalid} aria-describedby={describedBy}
        onFocus={() => { if (open) close(false); }}
        onChange={(event) => onChange(event.target.value)} />
      <button ref={trigger} type="button" className={styles.trigger} aria-label={`${label}をカレンダーで選択`}
        aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-calendar` : undefined}
        onClick={() => {
          if (open) close();
          else {
            onOpen?.();
            setFocusedDate(initialDate());
            setOpen(true);
          }
        }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2m-8 3h2" />
        </svg>
      </button>
    </div>
    {open ? <div ref={panel} id={`${id}-calendar`} role="dialog" popover={inline ? undefined : "manual"}
      aria-modal={overlay || undefined}
      aria-labelledby={`${id}-calendar-title`} aria-describedby={`${id}-calendar-help`}
      onMouseDown={(event) => { if (overlay && event.target === event.currentTarget) event.preventDefault(); }}
      onClick={(event) => { if (overlay && event.target === event.currentTarget) close(); }}
      className={`${pickerStyles.panel} ${styles.panel} ${inline ? `${pickerStyles.inline} ${styles.inlineCalendar}` : ""}`}>
      <div data-expense-calendar-content className={styles.content}>
      {monthOnly ? <p data-expense-calendar-context hidden={!inline}>{label}</p> : null}
      <div className={styles.navigation}>
        <button type="button" aria-label="前の月" disabled={!moveCalendarMonth(focusedDate, -1) || !allowed(moveCalendarMonth(focusedDate, -1)!)}
          onClick={() => setFocusedDate(moveCalendarMonth(focusedDate, -1)!)}>‹</button>
        <strong id={`${id}-calendar-title`} aria-live="polite">{heading}</strong>
        <button type="button" aria-label="次の月" disabled={!moveCalendarMonth(focusedDate, 1) || !allowed(moveCalendarMonth(focusedDate, 1)!)}
          onClick={() => setFocusedDate(moveCalendarMonth(focusedDate, 1)!)}>›</button>
      </div>
      <table role="grid" aria-label={heading} className={styles.grid}>
        <thead><tr>{weekdays.map((day) => <th key={day} scope="col"><abbr title={`${day}曜日`}>{day}</abbr></th>)}</tr></thead>
        <tbody>{Array.from({ length: cells.length / 7 }, (_, row) => <tr key={row}>
          {cells.slice(row * 7, row * 7 + 7).map((date, column) => <td key={column} role="gridcell" aria-selected={date ? date === selectedDate : undefined}>
            {date ? <button type="button" data-date={date} tabIndex={date === focusedDate ? 0 : -1}
              aria-label={`${year}年${month}月${Number(date.slice(-2))}日 ${weekdays[column]}曜日`}
              aria-current={date === today ? "date" : undefined} aria-pressed={date === selectedDate} disabled={!allowed(date)}
              onKeyDown={(event) => dateKeyDown(event, date)}
              onClick={() => { onChange(output(date)); close(); }}>{Number(date.slice(-2))}</button> : null}
          </td>)}
        </tr>)}</tbody>
      </table>
      <p id={`${id}-calendar-help`} className={styles.help}>矢印キーで日付、Page Up / Downで月を移動{monthOnly ? "。日付を選ぶと、その年月を設定します。" : ""}</p>
      <button type="button" className={styles.close} onClick={() => close()}>閉じる</button>
      </div>
    </div> : null}
  </div>;
}
