import type { MonthlyComparison, MonthlyOverviewData, MonthlyOverviewState, MonthlyPeriod } from "./monthlyOverviewPresentation";

export const previewScenarios = {
  normal: "正常", zero: "当月0円", previousZero: "前月0円", bothZero: "両月0円",
  empty: "対象Projectなし", loading: "Loading", error: "Error", unavailable: "データなし（認証喪失相当）",
} as const;
export type PreviewScenario = keyof typeof previewScenarios;

const selected: MonthlyPeriod = {
  totalExpense: 153800, continuousExpense: 108500, eventExpense: 45300, eventProjectCount: 2,
  contribution: { continuousPercentage: "70.55", eventPercentage: "29.45" },
};
const previous: MonthlyPeriod = {
  totalExpense: 128600, continuousExpense: 116600, eventExpense: 12000, eventProjectCount: 1,
  contribution: { continuousPercentage: "90.67", eventPercentage: "9.33" },
};
const zero: MonthlyPeriod = {
  totalExpense: 0, continuousExpense: 0, eventExpense: 0, eventProjectCount: 0,
  contribution: { continuousPercentage: null, eventPercentage: null },
};
const comparable = (difference: number, percentageChange: string): MonthlyComparison => ({
  comparisonState: "COMPARABLE", difference, percentageChange,
});
const noPrevious: MonthlyComparison = { comparisonState: "NO_PREVIOUS_MONTH", difference: null, percentageChange: null };

// Explicit display fixtures, never derived from public Projects/Expenses or used by production.
export function previewState(month: string, scenario: PreviewScenario): MonthlyOverviewState {
  if (scenario === "loading" || scenario === "error" || scenario === "unavailable") return { status: scenario };
  const data: MonthlyOverviewData = {
    month, population: { projectCount: 4 }, selected, previous,
    comparison: { total: comparable(25200, "19.60"), continuous: comparable(-8100, "-6.95"), event: comparable(33300, "277.50") },
  };
  if (scenario === "zero") {
    data.selected = zero;
    data.comparison = { total: comparable(-128600, "-100.00"), continuous: comparable(-116600, "-100.00"), event: comparable(-12000, "-100.00") };
  } else if (scenario === "previousZero") {
    data.previous = zero;
    const comparison = (difference: number): MonthlyComparison => ({ comparisonState: "NO_PREVIOUS_DATA", difference, percentageChange: null });
    data.comparison = { total: comparison(153800), continuous: comparison(108500), event: comparison(45300) };
  } else if (scenario === "bothZero" || scenario === "empty") {
    data.selected = zero;
    data.previous = zero;
    if (scenario === "empty") data.population = { projectCount: 0 };
    const comparison: MonthlyComparison = { comparisonState: "BOTH_MONTHS_EMPTY", difference: 0, percentageChange: null };
    data.comparison = { total: comparison, continuous: comparison, event: comparison };
  }
  if (month === "0001-01") {
    data.previous = null;
    data.comparison = { total: noPrevious, continuous: noPrevious, event: noPrevious };
  }
  return { status: "ready", data };
}
