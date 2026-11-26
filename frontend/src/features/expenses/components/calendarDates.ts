export function daysInMonth(year: number, month: number): number {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function parseCalendarDate(value: string): { year: number; month: number; day: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return year >= 1 && year <= 9999 && month >= 1 && month <= 12
    && day >= 1 && day <= daysInMonth(year, month) ? { year, month, day } : null;
}

export function calendarDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function calendarWeekday(value: string): number {
  const { year, month, day } = parseCalendarDate(value)!;
  // setUTCFullYear avoids the Date constructor's 1900 offset for years 1–99.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCDay();
}

export function moveCalendarDate(value: string, days: number): string | null {
  const parsed = parseCalendarDate(value);
  if (!parsed) return null;
  const date = new Date(0);
  date.setUTCFullYear(parsed.year, parsed.month - 1, parsed.day + days);
  const result = calendarDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  return parseCalendarDate(result) ? result : null;
}

export function moveCalendarMonth(value: string, offset: number): string | null {
  const parsed = parseCalendarDate(value);
  if (!parsed) return null;
  const index = (parsed.year - 1) * 12 + parsed.month - 1 + offset;
  if (index < 0 || index >= 9999 * 12) return null;
  const year = Math.floor(index / 12) + 1;
  const month = index % 12 + 1;
  return calendarDate(year, month, Math.min(parsed.day, daysInMonth(year, month)));
}
