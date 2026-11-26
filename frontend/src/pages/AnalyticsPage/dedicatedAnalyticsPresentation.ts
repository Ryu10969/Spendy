import type { ExpenseCategory } from "../../api/expenseApi";
import type { AnalyticsOverviewResponse } from "../../api/analyticsApi";
import { expenseCategoryOptions } from "../../features/expenses/expenseCategories";

export type AnalyticsSelection = { projectTokens: string[]; startMonth: string; endMonth: string };
export type AnalyticsProject = { publicToken: string; name: string; projectType: "CONTINUOUS" | "EVENT" };
// Local presentation model follows ADR-0007; UNAVAILABLE denotes unrecorded demo coverage, not an API enum.
export type DedicatedAnalyticsData = Omit<AnalyticsOverviewResponse, "endMonthComparison"> & {
  endMonthComparison: Omit<AnalyticsOverviewResponse["endMonthComparison"], "comparisonState"> & {
    comparisonState: AnalyticsOverviewResponse["endMonthComparison"]["comparisonState"] | "UNAVAILABLE";
  };
};
export type DedicatedAnalyticsState =
  | { status: "ready"; data: AnalyticsOverviewResponse; live: true }
  | { status: "ready"; data: DedicatedAnalyticsData; live?: false }
  | { status: "loading" }
  | { status: "accessInvalidated" }
  | { status: "error"; onRetry: () => void };

export const analyticsCategories: { category: ExpenseCategory | null; label: string; color: string }[] = [
  ...expenseCategoryOptions.map((item, index) => ({ category: item.key, label: item.label, color: `var(--analytics-category-${index})` })),
  { category: null, label: "未分類", color: "var(--analytics-category-7)" },
];

export function monthIndex(month: string): number {
  if (!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(month) || month < "0001-01") throw new Error("年は0001〜9999の西暦4桁、月は1〜12月を指定してください。");
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
}

export function selectionMonths(selection: AnalyticsSelection, projects: AnalyticsProject[]): string[] {
  const { projectTokens, startMonth, endMonth } = selection;
  if (projectTokens.length < 1 || projectTokens.length > 20) throw new Error("Projectは1〜20件選択してください。");
  if (new Set(projectTokens).size !== projectTokens.length || projectTokens.some((token) => !projects.some((p) => p.publicToken === token && p.projectType === "CONTINUOUS"))) {
    throw new Error("選択したProjectのアクセスを確認してください。");
  }
  const start = monthIndex(startMonth), end = monthIndex(endMonth);
  if (start > end) throw new Error("開始年月は終了年月以前にしてください。");
  if (end - start >= 24) throw new Error("集計期間は開始月と終了月を含む最大24か月です。");
  return Array.from({ length: end - start + 1 }, (_, i) => {
    const value = start + i;
    return `${String(Math.floor(value / 12)).padStart(4, "0")}-${String(value % 12 + 1).padStart(2, "0")}`;
  });
}

// Exact HALF_UP labels; no money enters floating-point arithmetic.
export function percentage(numerator: bigint, denominator: bigint): string {
  if (denominator <= 0n) throw new Error("割合の分母は正の整数が必要です。");
  const absolute = numerator < 0n ? -numerator : numerator;
  const rounded = (absolute * 10000n * 2n + denominator) / (denominator * 2n);
  return `${numerator < 0n && rounded > 0n ? "-" : ""}${rounded / 100n}.${String(rounded % 100n).padStart(2, "0")}`;
}

export function share(amount: number, total: number): string {
  return total === 0 ? "—" : `${percentage(BigInt(amount), BigInt(total))}%`;
}
