export function currentMonth(now = new Date()): string {
  return `${String(now.getFullYear()).padStart(4, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function continuousExpenseDate(month: string, now = new Date()): string {
  if (month === currentMonth(now)) return `${month}-${String(now.getDate()).padStart(2, "0")}`;
  const [year, monthNumber] = month.split("-").map(Number);
  // Avoid Date's 0–99 year remapping and next-year rollover at the upper boundary.
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return `${month}-${days[monthNumber - 1]}`;
}

export function previousMonth(month: string): string | null {
  if (month === "0001-01") return null;
  const [year, monthNumber] = month.split("-").map(Number);
  return monthNumber === 1
    ? `${String(year - 1).padStart(4, "0")}-12`
    : `${String(year).padStart(4, "0")}-${String(monthNumber - 1).padStart(2, "0")}`;
}

export function nextMonth(month: string, latest = currentMonth()): string | null {
  if (month >= latest) return null;
  const [year, monthNumber] = month.split("-").map(Number);
  return monthNumber === 12
    ? `${String(year + 1).padStart(4, "0")}-01`
    : `${String(year).padStart(4, "0")}-${String(monthNumber + 1).padStart(2, "0")}`;
}
