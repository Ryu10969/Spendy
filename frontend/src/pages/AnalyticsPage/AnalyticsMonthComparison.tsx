import { Comparison } from "../HomePage/monthlyOverview/MonthlyOverview";
import type { MonthlyComparison } from "../HomePage/monthlyOverview/monthlyOverviewPresentation";
import type { AnalyticsComparisonResponse } from "../../api/analyticsApi";
import { chartPointComparison } from "./AnalyticsChartInteraction";

export type SingleMonthComparison = AnalyticsComparisonResponse | "CATEGORY_HISTORY_UNAVAILABLE";
const categoryHistoryUnavailable = "前月のカテゴリ内訳は未取得";

export function chartMonthPointComparison(current: number, previous: number | null, comparison?: SingleMonthComparison) {
  if (comparison === "CATEGORY_HISTORY_UNAVAILABLE") {
    return { ...chartPointComparison(current, null), text: categoryHistoryUnavailable };
  }
  if (comparison?.comparisonState === "NO_PREVIOUS_MONTH") {
    return { ...chartPointComparison(current, null), text: "比較対象月なし" };
  }
  return comparison
    ? chartPointComparison(current, comparison.previousTotalExpense, comparison)
    : chartPointComparison(current, previous);
}

export function monthDetailComparison(current: number, previous: number | null): MonthlyComparison {
  if (previous === null) return { comparisonState: "NO_PREVIOUS_MONTH", difference: null, percentageChange: null };
  const difference = Number(BigInt(current)-BigInt(previous));
  if (previous === 0) return { comparisonState: current === 0 ? "BOTH_MONTHS_EMPTY" : "NO_PREVIOUS_DATA", difference, percentageChange: null };
  // Reuse the chart's exact rate; only adapt its display sign/unit for Home's pill.
  const rate = chartPointComparison(current, previous).rate.replace(/%$/, "").replace("−", "-").replace(/^\+/, "");
  return { comparisonState: "COMPARABLE", difference, percentageChange: rate };
}

function overviewDetailComparison({ comparisonState, difference, percentageChange }: AnalyticsComparisonResponse): MonthlyComparison {
  switch (comparisonState) {
    case "NO_PREVIOUS_MONTH":
      return { comparisonState, difference: null, percentageChange: null };
    case "COMPARABLE":
      return { comparisonState, difference: difference!, percentageChange: percentageChange! };
    default:
      return { comparisonState, difference: difference!, percentageChange: null };
  }
}

export function AnalyticsMonthComparison({ current, previous, counts, comparison }: {
  current: number; previous: number | null; counts: boolean; comparison?: SingleMonthComparison;
}) {
  if (comparison === "CATEGORY_HISTORY_UNAVAILABLE") return <p>前月比 —（{categoryHistoryUnavailable}）</p>;
  const value = comparison ? overviewDetailComparison(comparison) : monthDetailComparison(current, previous);
  return <Comparison value={value} formatDifference={counts ? amount => `${amount > 0 ? "+" : ""}${amount.toLocaleString("ja-JP")}件` : undefined} />;
}
