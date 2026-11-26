import type { ExpenseCategory } from "../../api/expenseApi";
import { previousMonth } from "../../features/projects/monthSelection";
import { demoExpenses } from "./dedicatedAnalyticsDemoExpenses";
import { analyticsCategories, percentage, selectionMonths } from "./dedicatedAnalyticsPresentation";
import type { AnalyticsProject, AnalyticsSelection, DedicatedAnalyticsData } from "./dedicatedAnalyticsPresentation";

export type DemoExpense = { id: string; projectToken: string; paidOn: string; amount: number; category: ExpenseCategory | null };
export const demoCoverage = { startMonth: "2024-10", endMonth: "2026-10" };
export const demoProjects: AnalyticsProject[] = Array.from({ length: 21 }, (_, i) => ({
  publicToken: `p${i + 1}`,
  name: i < 3 ? ["ふたりの生活費", "シェアハウス", "共同作業費"][i]
    : i === 19 ? "週末も平日もいっしょに暮らす仲間たちの共同生活プロジェクト（長い名前のサンプル）"
      : `継続プロジェクト ${String(i + 1).padStart(2, "0")}`,
  projectType: "CONTINUOUS",
}));
export const initialSelection: AnalyticsSelection = { projectTokens: ["p1", "p2", "p3"], startMonth: "2026-05", endMonth: "2026-10" };

function safeAmount(amount: bigint): number {
  if (amount > BigInt(Number.MAX_SAFE_INTEGER) || amount < -BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("分析金額が安全に表示できる範囲を超えています。");
  return Number(amount);
}

// Demo only. Production aggregation and authorization remain Backend responsibilities.
export function aggregateDemo(selection: AnalyticsSelection, expenses: DemoExpense[] = demoExpenses, projects = demoProjects): DedicatedAnalyticsData {
  const months = selectionMonths(selection, projects);
  const tokens = [...selection.projectTokens].sort();
  const selected = new Set(tokens), ids = new Set<string>();
  const records = expenses.filter((expense) => {
    if (ids.has(expense.id)) throw new Error("デモExpenseのIDが重複しています。");
    ids.add(expense.id);
    if (!Number.isSafeInteger(expense.amount) || expense.amount <= 0 || !analyticsCategories.some((c) => c.category === expense.category)) throw new Error("デモExpenseが不正です。");
    return selected.has(expense.projectToken);
  });
  const sum = (items: DemoExpense[]) => safeAmount(items.reduce((total, item) => total + BigInt(item.amount), 0n));
  const inMonth = (month: string) => records.filter((e) => e.paidOn.slice(0, 7) === month);
  const period = records.filter((e) => e.paidOn.slice(0, 7) >= selection.startMonth && e.paidOn.slice(0, 7) <= selection.endMonth);
  const previous = previousMonth(selection.endMonth), current = sum(inMonth(selection.endMonth));
  const known = previous !== null && previous >= demoCoverage.startMonth && previous <= demoCoverage.endMonth;
  const previousTotal = known ? sum(inMonth(previous)) : null;
  const difference = previousTotal === null ? null : safeAmount(BigInt(current) - BigInt(previousTotal));
  return {
    projectType: "CONTINUOUS", eventInclusion: "EXCLUDED", currency: "JPY",
    period: { startMonth: selection.startMonth, endMonth: selection.endMonth },
    includedProjectTokens: tokens, excludedProjects: [],
    totalExpense: sum(period), expenseCount: period.length,
    endMonthComparison: {
      month: selection.endMonth, totalExpense: current, previousMonth: previous,
      previousTotalExpense: previousTotal, difference,
      percentageChange: previousTotal !== null && previousTotal > 0 ? percentage(BigInt(difference!), BigInt(previousTotal)) : null,
      comparisonState: previous === null ? "NO_PREVIOUS_MONTH" : !known ? "UNAVAILABLE"
        : previousTotal === 0 ? current === 0 ? "BOTH_MONTHS_EMPTY" : "NO_PREVIOUS_DATA" : "COMPARABLE",
    },
    monthlyTrend: months.map((month) => ({ month, totalExpense: sum(inMonth(month)), expenseCount: inMonth(month).length })),
    categoryBreakdown: analyticsCategories.flatMap(({ category }) => {
      const items = period.filter((e) => e.category === category);
      return items.length ? [{ category, totalExpense: sum(items), expenseCount: items.length }] : [];
    }),
    projectComparison: tokens.map((publicToken) => {
      const items = period.filter((e) => e.projectToken === publicToken);
      return { publicToken, name: projects.find((p) => p.publicToken === publicToken)!.name, totalExpense: sum(items), expenseCount: items.length };
    }),
  };
}

export const demoScenarios = {
  normal: "Success", loading: "Loading", empty: "Empty", noPrevious: "No Previous Data（収録範囲外）",
  previousZero: "Previous Month Zero", error: "Error", access: "Access Invalidated",
};
export type DemoScenario = keyof typeof demoScenarios;

export function demoResult(selection: AnalyticsSelection, scenario: DemoScenario): DedicatedAnalyticsData {
  if (scenario === "empty") return aggregateDemo(selection, []);
  if (scenario === "previousZero") return aggregateDemo(selection, demoExpenses.filter((e) => e.paidOn.slice(0, 7) !== previousMonth(selection.endMonth)));
  if (scenario === "noPrevious") return aggregateDemo({ ...selection, startMonth: demoCoverage.startMonth, endMonth: demoCoverage.startMonth });
  return aggregateDemo(selection);
}
