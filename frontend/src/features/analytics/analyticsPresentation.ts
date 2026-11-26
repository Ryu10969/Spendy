import type { AnalyticsComparisonResponse, ProjectMonthlyAnalyticsResponse } from "../../api/analyticsApi";
import { ApiError } from "../../api/client";
import { formatSignedYen, formatYen } from "../../utils/formatMoney";

export type AnalyticsPresentation = {
  data?: ProjectMonthlyAnalyticsResponse;
  status: "loading" | "error" | "ready";
  refreshing: boolean;
  retained: boolean;
  error: unknown;
};

export function analyticsPresentation(
  query: { data?: ProjectMonthlyAnalyticsResponse; isError: boolean; fetchStatus: string; error: unknown },
  publicToken: string,
  month: string,
  invalidated: boolean,
): AnalyticsPresentation {
  const unavailable = query.error instanceof ApiError && [
    "ANALYTICS_AMOUNT_OUT_OF_RANGE", "ANALYTICS_CALCULATION_INVALID",
    "PROJECT_NOT_FOUND", "ANALYTICS_SCOPE_UNSUPPORTED",
  ].includes(query.error.code);
  const data = !invalidated && !unavailable && query.data?.publicToken === publicToken
    && query.data.scopeType === "YEAR_MONTH" && query.data.scopeKey === month
    ? query.data : undefined;
  return {
    data,
    status: query.isError ? "error" : data ? "ready" : "loading",
    refreshing: query.fetchStatus !== "idle",
    retained: Boolean(data && (query.isError || query.fetchStatus !== "idle")),
    error: query.error,
  };
}

export function analyticsMonthLabel(month: string): string {
  const [year, value] = month.split("-");
  return `${year}年${Number(value)}月`;
}

export function comparisonText(comparison: AnalyticsComparisonResponse): string {
  const { previousMonth, previousTotalExpense, difference, percentageChange, comparisonState } = comparison;
  if (comparisonState === "NO_PREVIOUS_MONTH") return "前月なし · 前月・前月総額・差額・割合 —";
  const previous = `${analyticsMonthLabel(previousMonth!)} ${formatYen(previousTotalExpense!)}`;
  if (comparisonState === "BOTH_MONTHS_EMPTY") return `両月の支出なし · ${previous} · 差額 ${formatYen(difference!)} · 割合 —`;
  if (comparisonState === "NO_PREVIOUS_DATA") return `前月の支出なし · ${previous} · 差額 ${formatSignedYen(difference!)} · 割合 —`;
  const direction = difference! > 0 ? "増加" : difference! < 0 ? "減少" : "増減なし";
  const percent = percentageChange === null ? "—" : `${difference! > 0 ? "+" : ""}${percentageChange}%`;
  return `${previous}から${direction} · 差額 ${formatSignedYen(difference!)}（${percent}）`;
}
