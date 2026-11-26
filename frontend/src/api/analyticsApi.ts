import { apiRequest } from "./client";
import type { ExpenseCategory } from "./expenseApi";

export type AnalyticsComparisonResponse = {
  previousMonth: string | null;
  previousTotalExpense: number | null;
  difference: number | null;
  percentageChange: string | null;
  comparisonState: "COMPARABLE" | "NO_PREVIOUS_DATA" | "BOTH_MONTHS_EMPTY" | "NO_PREVIOUS_MONTH";
};

export type AnalyticsCategoryResponse = {
  category: ExpenseCategory | null;
  totalExpense: number;
  expenseCount: number;
};

export type AnalyticsMemberResponse = {
  memberId: string;
  name: string;
  displayOrder: number;
  active: boolean;
  paidAmount: number;
  burdenAmount: number;
  exactBalance: number;
};

export type AnalyticsMonthResponse = {
  month: string;
  totalExpense: number;
  expenseCount: number;
};

export type ProjectMonthlyAnalyticsResponse = {
  publicToken: string;
  scopeType: "YEAR_MONTH";
  scopeKey: string;
  currency: "JPY";
  totalExpense: number;
  expenseCount: number;
  averageBasis: "DISTINCT_EXPENSE_PARTICIPANTS";
  participantCount: number;
  averagePerPerson: number | null;
  previousMonthComparison: AnalyticsComparisonResponse;
  categoryBreakdown: AnalyticsCategoryResponse[];
  members: AnalyticsMemberResponse[];
  monthlyTrend: { startMonth: string; endMonth: string; items: AnalyticsMonthResponse[] };
};

export type AnalyticsOverviewResponse = {
  projectType: "CONTINUOUS";
  eventInclusion: "EXCLUDED";
  currency: "JPY";
  period: { startMonth: string; endMonth: string };
  includedProjectTokens: string[];
  excludedProjects: { publicToken: string; projectType: "EVENT"; reason: "EVENT_EXCLUDED" }[];
  totalExpense: number;
  expenseCount: number;
  endMonthComparison: AnalyticsComparisonResponse & { month: string; totalExpense: number };
  categoryBreakdown: AnalyticsCategoryResponse[];
  monthlyTrend: AnalyticsMonthResponse[];
  projectComparison: { publicToken: string; name: string; totalExpense: number; expenseCount: number }[];
};

function validOverview(data: AnalyticsOverviewResponse, startMonth: string, endMonth: string) {
  const validTotals = (item: { totalExpense: number; expenseCount: number }) =>
    Number.isSafeInteger(item?.totalExpense) && item.totalExpense >= 0
    && Number.isSafeInteger(item.expenseCount) && item.expenseCount >= 0;
  const comparison = data?.endMonthComparison;
  return data?.currency === "JPY" && data.projectType === "CONTINUOUS" && data.eventInclusion === "EXCLUDED"
    && data.period?.startMonth === startMonth && data.period?.endMonth === endMonth
    && Array.isArray(data.includedProjectTokens) && data.includedProjectTokens.every(token => typeof token === "string")
    && Array.isArray(data.excludedProjects) && data.excludedProjects.every(project => typeof project?.publicToken === "string")
    && validTotals(data) && comparison?.month === endMonth
    && Number.isSafeInteger(comparison.totalExpense) && comparison.totalExpense >= 0
    && (comparison.previousTotalExpense === null || (Number.isSafeInteger(comparison.previousTotalExpense) && comparison.previousTotalExpense >= 0))
    && (comparison.difference === null || Number.isSafeInteger(comparison.difference))
    && (comparison.percentageChange === null || (typeof comparison.percentageChange === "string" && /^-?\d+\.\d{2}$/.test(comparison.percentageChange)))
    && ["COMPARABLE", "NO_PREVIOUS_DATA", "BOTH_MONTHS_EMPTY", "NO_PREVIOUS_MONTH"].includes(comparison.comparisonState)
    && Array.isArray(data.categoryBreakdown) && data.categoryBreakdown.every(row => validTotals(row)
      && (row.category === null || typeof row.category === "string"))
    && Array.isArray(data.monthlyTrend) && data.monthlyTrend.length > 0 && data.monthlyTrend.every(row => validTotals(row)
      && typeof row.month === "string" && /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(row.month))
    && Array.isArray(data.projectComparison) && data.projectComparison.every(row => validTotals(row)
      && typeof row.publicToken === "string" && typeof row.name === "string");
}

export async function getAnalyticsOverview(projectTokens: string[], startMonth: string, endMonth: string, signal?: AbortSignal) {
  const search = new URLSearchParams({ startMonth, endMonth, projectType: "CONTINUOUS" });
  for (const token of projectTokens) search.append("projectToken", token);
  const endpoint = globalThis.__SPENDINGMATE_PORTFOLIO_DEMO__ ? "/api/demo/analytics" : "/api/analytics";
  const data = await apiRequest<AnalyticsOverviewResponse>(`${endpoint}?${search.toString()}`, { signal });
  if (globalThis.__SPENDINGMATE_PORTFOLIO_DEMO__ && !validOverview(data, startMonth, endMonth)) {
    throw new Error("Invalid Analytics overview.");
  }
  return data;
}

export function getProjectMonthlyAnalytics(
  publicToken: string,
  month: string,
  trendMonths = 6,
  signal?: AbortSignal,
): Promise<ProjectMonthlyAnalyticsResponse> {
  const search = new URLSearchParams({ month, trendMonths: String(trendMonths) });
  return apiRequest<ProjectMonthlyAnalyticsResponse>(
    `/api/projects/${encodeURIComponent(publicToken)}/analytics?${search.toString()}`,
    { signal },
  );
}
