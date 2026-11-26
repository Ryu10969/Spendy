// Presentation model only. The authorized API's wire DTO is not approved yet.
export type MonthlyPeriod = {
  totalExpense: number;
  continuousExpense: number;
  eventExpense: number;
  eventProjectCount: number;
  contribution: { continuousPercentage: string | null; eventPercentage: string | null };
};

export type MonthlyComparison =
  | { comparisonState: "COMPARABLE"; difference: number; percentageChange: string }
  | { comparisonState: "NO_PREVIOUS_DATA" | "BOTH_MONTHS_EMPTY"; difference: number; percentageChange: null }
  | { comparisonState: "NO_PREVIOUS_MONTH"; difference: null; percentageChange: null };

export type MonthlyOverviewData = {
  month: string;
  population: { projectCount: number };
  selected: MonthlyPeriod;
  previous: MonthlyPeriod | null;
  comparison: { total: MonthlyComparison; continuous: MonthlyComparison; event: MonthlyComparison };
};

// Non-success states cannot retain financial data after loading/access loss/error.
export type MonthlyOverviewState =
  | { status: "ready"; data: MonthlyOverviewData }
  | { status: "preparing" | "loading" | "unavailable" }
  | { status: "error"; onRetry?: () => void };

export function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-");
  return `${Number(year)}年${Number(monthNumber)}月`;
}

export function comparisonLabel(comparison: MonthlyComparison): string {
  switch (comparison.comparisonState) {
    case "COMPARABLE":
      return `${Number(comparison.percentageChange) > 0 ? "+" : ""}${comparison.percentageChange}%`;
    case "NO_PREVIOUS_DATA": return "—（前月の支出が0円）";
    case "BOTH_MONTHS_EMPTY": return "—（両月の支出が0円）";
    case "NO_PREVIOUS_MONTH": return "—（比較対象月なし）";
  }
}
