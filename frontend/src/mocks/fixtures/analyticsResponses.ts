import type { ProjectMonthlyAnalyticsResponse } from "../../api/analyticsApi";
import type { ExpenseResponse } from "../../api/expenseApi";
import type { SettlementResponse } from "../../api/settlementApi";

// Test-only DTOs: never substituted for a failed real Project request.
export const analyticsFixtureToken = "A".repeat(43);
const memberId = (value: number) => `00000000-0000-0000-0000-${String(value).padStart(12, "0")}`;
export const analyticsFixtureExpenses: ExpenseResponse[] = [
  { id: memberId(10), payerMemberId: memberId(1), amount: 1000, content: "食材", category: "FOOD",
    paidOn: "2026-10-01", note: null, version: 0, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
    participants: [
      { memberId: memberId(1), allocatedShare: 500, allocationOrder: 1 },
      { memberId: memberId(2), allocatedShare: 500, allocationOrder: 2 },
    ] },
  { id: memberId(11), payerMemberId: memberId(3), amount: 1, content: "未分類の支出", category: null,
    paidOn: "2026-10-09", note: null, version: 0, createdAt: "2026-10-09T00:00:00Z", updatedAt: "2026-10-09T00:00:00Z",
    participants: [
      { memberId: memberId(1), allocatedShare: 1, allocationOrder: 1 },
      { memberId: memberId(2), allocatedShare: 0, allocationOrder: 2 },
      { memberId: memberId(4), allocatedShare: 0, allocationOrder: 3 },
    ] },
];

export const analyticsFixture: ProjectMonthlyAnalyticsResponse = {
  publicToken: analyticsFixtureToken, scopeType: "YEAR_MONTH", scopeKey: "2026-10", currency: "JPY",
  totalExpense: 1001, expenseCount: 2, averageBasis: "DISTINCT_EXPENSE_PARTICIPANTS",
  participantCount: 3, averagePerPerson: 334,
  previousMonthComparison: { previousMonth: "2026-09", previousTotalExpense: 800, difference: 201,
    percentageChange: "25.13", comparisonState: "COMPARABLE" },
  categoryBreakdown: [
    { category: "FOOD", totalExpense: 1000, expenseCount: 1 },
    { category: null, totalExpense: 1, expenseCount: 1 },
  ],
  members: [
    { memberId: memberId(1), name: "Alice", displayOrder: 1, active: true, paidAmount: 1000, burdenAmount: 501, exactBalance: 499 },
    { memberId: memberId(2), name: "Bob", displayOrder: 2, active: false, paidAmount: 0, burdenAmount: 500, exactBalance: -500 },
    { memberId: memberId(3), name: "Carol（支払いのみ）", displayOrder: 3, active: true, paidAmount: 1, burdenAmount: 0, exactBalance: 1 },
    { memberId: memberId(4), name: "負担額が0円の参加者・長い名前の表示確認用メンバー", displayOrder: 4, active: true, paidAmount: 0, burdenAmount: 0, exactBalance: 0 },
  ],
  monthlyTrend: { startMonth: "2026-05", endMonth: "2026-10", items: [
    { month: "2026-05", totalExpense: 0, expenseCount: 0 },
    { month: "2026-06", totalExpense: 0, expenseCount: 0 },
    { month: "2026-07", totalExpense: 0, expenseCount: 0 },
    { month: "2026-08", totalExpense: 0, expenseCount: 0 },
    { month: "2026-09", totalExpense: 800, expenseCount: 1 },
    { month: "2026-10", totalExpense: 1001, expenseCount: 2 },
  ] },
};

export const emptyAnalyticsFixture: ProjectMonthlyAnalyticsResponse = {
  ...analyticsFixture, scopeKey: "2026-11", totalExpense: 0, expenseCount: 0,
  participantCount: 0, averagePerPerson: null, categoryBreakdown: [], members: [],
  previousMonthComparison: { previousMonth: "2026-10", previousTotalExpense: 1001, difference: -1001,
    percentageChange: "-100.00", comparisonState: "COMPARABLE" },
  monthlyTrend: { startMonth: "2026-06", endMonth: "2026-11", items: [
    ...analyticsFixture.monthlyTrend.items.slice(1), { month: "2026-11", totalExpense: 0, expenseCount: 0 },
  ] },
};

export const bothEmptyAnalyticsFixture: ProjectMonthlyAnalyticsResponse = {
  ...emptyAnalyticsFixture, scopeKey: "2026-12",
  previousMonthComparison: { previousMonth: "2026-11", previousTotalExpense: 0, difference: 0,
    percentageChange: null, comparisonState: "BOTH_MONTHS_EMPTY" },
  monthlyTrend: { startMonth: "2026-07", endMonth: "2026-12", items: [
    ...emptyAnalyticsFixture.monthlyTrend.items.slice(1), { month: "2026-12", totalExpense: 0, expenseCount: 0 },
  ] },
};

export const noPreviousDataAnalyticsFixture: ProjectMonthlyAnalyticsResponse = {
  ...analyticsFixture, scopeKey: "2027-01",
  previousMonthComparison: { previousMonth: "2026-12", previousTotalExpense: 0, difference: 1001,
    percentageChange: null, comparisonState: "NO_PREVIOUS_DATA" },
  monthlyTrend: { startMonth: "2026-08", endMonth: "2027-01", items: [
    ...bothEmptyAnalyticsFixture.monthlyTrend.items.slice(1), { month: "2027-01", totalExpense: 1001, expenseCount: 2 },
  ] },
};

export const noPreviousMonthAnalyticsFixture: ProjectMonthlyAnalyticsResponse = {
  ...analyticsFixture, scopeKey: "0001-01",
  previousMonthComparison: { previousMonth: null, previousTotalExpense: null, difference: null,
    percentageChange: null, comparisonState: "NO_PREVIOUS_MONTH" },
  monthlyTrend: { startMonth: "0001-01", endMonth: "0001-01", items: [{ month: "0001-01", totalExpense: 1001, expenseCount: 2 }] },
};

export const analyticsSettlementFixture: SettlementResponse = {
  runId: memberId(20), sourceStateFingerprint: "a".repeat(64), scopeType: "YEAR_MONTH", scopeKey: "2026-10",
  strategy: "FEWER_TRANSFERS", state: "CURRENT", generatedAt: "2026-10-09T00:00:00Z",
  balances: analyticsFixture.members.map((member) => ({
    memberId: member.memberId, paidAmount: member.paidAmount, burdenAmount: member.burdenAmount,
    exactBalance: member.exactBalance, roundedTransferNet: member.exactBalance, roundingDifference: 0,
  })),
  transfers: [
    { id: memberId(21), transferOrder: 1, fromMemberId: memberId(2), toMemberId: memberId(1),
      exactAmount: 499, initiallyRoundedAmount: 500, finalRoundedAmount: 499, roundingAdjustment: -1,
      status: "OUTSTANDING", completedAt: null,
      explanation: { kind: "NET_BALANCE_MATCH", fromExactBalanceBefore: -500, toExactBalanceBefore: 499 } },
    { id: memberId(22), transferOrder: 2, fromMemberId: memberId(2), toMemberId: memberId(3),
      exactAmount: 1, initiallyRoundedAmount: 0, finalRoundedAmount: 1, roundingAdjustment: 1,
      status: "OUTSTANDING", completedAt: null,
      explanation: { kind: "NET_BALANCE_MATCH", fromExactBalanceBefore: -1, toExactBalanceBefore: 1 } },
  ],
};
