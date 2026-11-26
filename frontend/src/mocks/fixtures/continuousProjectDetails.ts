import type { ContinuousProjectDetail, ProjectExpenseItem } from "../../types/project";

function withExpenseDetails(
  expenses: Omit<ProjectExpenseItem, "participantNames" | "memo">[],
  participantNames: string[],
): ProjectExpenseItem[] {
  return expenses.map((expense) => ({
    ...expense,
    participantNames,
    memo: null,
  }));
}

const categoryColors = {
  HOUSING: "#5b67f1",
  UTILITIES: "#22c55e",
  FOOD: "#f59e0b",
  ENTERTAINMENT: "#8b5cf6",
  DAILY_GOODS: "#6b7280",
} as const;

// Continuous project detail dummy data.
//
// The values below are internally consistent by construction:
// - Each member's paid amount is the sum of the expenses they paid.
// - Burden is the equal split of the total (floor + deterministic +1 yen remainder).
// - balance = paid - burden, and all balances sum to 0.
// - Settlement transfers are direct debtor-to-creditor transfers that reconcile.
// - Category totals sum to the project total.
//
// Mockup member/self-balance figures were not reproduced verbatim because they do
// not reconcile with the mockup expense list; the expense list is treated as the
// source of truth per the Spendy expense-allocation and mockup-defect rules.
const shareHouse: ContinuousProjectDetail = {
  id: "project-share-house-living",
  publicToken: "demo-continuous-project",
  name: "シェアハウス生活費",
  icon: "🏠",
  type: "CONTINUOUS",
  description: "3人のシェアハウスの毎月の共同費用",
  currencyLabel: "JPY (¥)",
  members: [
    { id: "member-alice", name: "Alice", displayName: "Alice", avatarLabel: "A" },
    { id: "member-bob", name: "Bob", displayName: "Bob", avatarLabel: "B" },
    { id: "member-carol", name: "Carol", displayName: "Carol", avatarLabel: "C" },
  ],
  referenceMemberId: "member-alice",
  kpi: {
    totalExpenseYen: 687200,
    expenseCount: 14,
    perMemberAverageYen: 229067,
    settlementTransactionCount: 2,
  },
  expenses: withExpenseDetails([
    { id: "exp-sh-01", icon: "🍽️", title: "週末の買い出し", payerName: "Bob", participantCount: 3, perPersonYen: 3733, amountYen: 11200, dateLabel: "Jun 6", categoryKey: "FOOD" },
    { id: "exp-sh-02", icon: "💡", title: "電気代・インターネット", payerName: "Alice", participantCount: 3, perPersonYen: 7367, amountYen: 22100, dateLabel: "Jun 4", categoryKey: "UTILITIES" },
    { id: "exp-sh-03", icon: "🏠", title: "6月分家賃", payerName: "Carol", participantCount: 3, perPersonYen: 60000, amountYen: 180000, dateLabel: "Jun 1", categoryKey: "HOUSING" },
    { id: "exp-sh-04", icon: "🎮", title: "ゲームサブスク", payerName: "Bob", participantCount: 3, perPersonYen: 2167, amountYen: 6500, dateLabel: "May 20", categoryKey: "ENTERTAINMENT" },
    { id: "exp-sh-05", icon: "🍽️", title: "スーパーでの買い物", payerName: "Alice", participantCount: 3, perPersonYen: 4600, amountYen: 13800, dateLabel: "May 14", categoryKey: "FOOD" },
    { id: "exp-sh-06", icon: "🏠", title: "5月分家賃", payerName: "Alice", participantCount: 3, perPersonYen: 60000, amountYen: 180000, dateLabel: "May 1", categoryKey: "HOUSING" },
    { id: "exp-sh-07", icon: "💧", title: "水道代", payerName: "Carol", participantCount: 3, perPersonYen: 2800, amountYen: 8400, dateLabel: "May 3", categoryKey: "UTILITIES" },
    { id: "exp-sh-08", icon: "🧴", title: "掃除用品", payerName: "Bob", participantCount: 3, perPersonYen: 1067, amountYen: 3200, dateLabel: "May 10", categoryKey: "DAILY_GOODS" },
    { id: "exp-sh-09", icon: "🔥", title: "ガス代", payerName: "Alice", participantCount: 3, perPersonYen: 1867, amountYen: 5600, dateLabel: "Apr 28", categoryKey: "UTILITIES" },
    { id: "exp-sh-10", icon: "🏠", title: "4月分家賃", payerName: "Alice", participantCount: 3, perPersonYen: 60000, amountYen: 180000, dateLabel: "Apr 1", categoryKey: "HOUSING" },
    { id: "exp-sh-11", icon: "🎬", title: "Netflixサブスク", payerName: "Bob", participantCount: 3, perPersonYen: 660, amountYen: 1980, dateLabel: "Apr 15", categoryKey: "ENTERTAINMENT" },
    { id: "exp-sh-12", icon: "💡", title: "電気代", payerName: "Carol", participantCount: 3, perPersonYen: 6167, amountYen: 18500, dateLabel: "Apr 5", categoryKey: "UTILITIES" },
    { id: "exp-sh-13", icon: "🍽️", title: "夕食の食材", payerName: "Alice", participantCount: 3, perPersonYen: 9300, amountYen: 27900, dateLabel: "Apr 12", categoryKey: "FOOD" },
    { id: "exp-sh-14", icon: "📶", title: "Wi-Fiルーター", payerName: "Carol", participantCount: 3, perPersonYen: 9340, amountYen: 28020, dateLabel: "Apr 20", categoryKey: "UTILITIES" },
  ], ["Alice", "Bob", "Carol"]),
  settlementTransfers: [
    { id: "tr-sh-01", fromMemberName: "Bob", toMemberName: "Alice", amountYen: 200333, completed: false },
    { id: "tr-sh-02", fromMemberName: "Bob", toMemberName: "Carol", amountYen: 5854, completed: false },
  ],
  memberBalances: [
    { id: "member-alice", avatarLabel: "A", name: "Alice", paidYen: 429400, burdenYen: 229067, balanceYen: 200333 },
    { id: "member-bob", avatarLabel: "B", name: "Bob", paidYen: 22880, burdenYen: 229067, balanceYen: -206187 },
    { id: "member-carol", avatarLabel: "C", name: "Carol", paidYen: 234920, burdenYen: 229066, balanceYen: 5854 },
  ],
  categoryBreakdown: [
    { key: "HOUSING", label: "家賃・宿泊", color: categoryColors.HOUSING, percent: 79, amountYen: 540000 },
    { key: "UTILITIES", label: "光熱費", color: categoryColors.UTILITIES, percent: 12, amountYen: 82620 },
    { key: "FOOD", label: "食費", color: categoryColors.FOOD, percent: 8, amountYen: 52900 },
    { key: "ENTERTAINMENT", label: "娯楽", color: categoryColors.ENTERTAINMENT, percent: 1, amountYen: 8480 },
    { key: "DAILY_GOODS", label: "日用品", color: categoryColors.DAILY_GOODS, percent: 0, amountYen: 3200 },
  ],
  memberComparison: [
    { id: "member-alice", name: "Alice", paidYen: 429400, burdenYen: 229067 },
    { id: "member-bob", name: "Bob", paidYen: 22880, burdenYen: 229067 },
    { id: "member-carol", name: "Carol", paidYen: 234920, burdenYen: 229066 },
  ],
};

const familyCosts: ContinuousProjectDetail = {
  id: "project-family-shared-costs",
  publicToken: "demo-family-costs",
  name: "家族の共同費用",
  icon: "👨‍👩‍👧‍👦",
  type: "CONTINUOUS",
  description: "家族4人の家計共有",
  currencyLabel: "JPY (¥)",
  members: [
    { id: "member-father", name: "Father", displayName: "父", avatarLabel: "父" },
    { id: "member-mother", name: "Mother", displayName: "母", avatarLabel: "母" },
    { id: "member-yu", name: "Yu", displayName: "ユ", avatarLabel: "ユ" },
    { id: "member-rei", name: "Rei", displayName: "レ", avatarLabel: "レ" },
  ],
  referenceMemberId: "member-father",
  kpi: {
    totalExpenseYen: 315000,
    expenseCount: 10,
    perMemberAverageYen: 78750,
    settlementTransactionCount: 3,
  },
  expenses: withExpenseDetails([
    { id: "exp-fm-01", icon: "🏠", title: "6月分家賃", payerName: "父", participantCount: 4, perPersonYen: 26250, amountYen: 105000, dateLabel: "Jun 1", categoryKey: "HOUSING" },
    { id: "exp-fm-02", icon: "🍽️", title: "食料品まとめ買い", payerName: "母", participantCount: 4, perPersonYen: 7500, amountYen: 30000, dateLabel: "Jun 2", categoryKey: "FOOD" },
    { id: "exp-fm-03", icon: "💡", title: "電気代", payerName: "父", participantCount: 4, perPersonYen: 3750, amountYen: 15000, dateLabel: "May 28", categoryKey: "UTILITIES" },
    { id: "exp-fm-04", icon: "🔥", title: "水道・ガス", payerName: "母", participantCount: 4, perPersonYen: 3000, amountYen: 12000, dateLabel: "May 20", categoryKey: "UTILITIES" },
    { id: "exp-fm-05", icon: "🧴", title: "日用品", payerName: "ユ", participantCount: 4, perPersonYen: 2000, amountYen: 8000, dateLabel: "May 18", categoryKey: "DAILY_GOODS" },
    { id: "exp-fm-06", icon: "🍽️", title: "外食", payerName: "母", participantCount: 4, perPersonYen: 4500, amountYen: 18000, dateLabel: "May 10", categoryKey: "FOOD" },
    { id: "exp-fm-07", icon: "📶", title: "インターネット", payerName: "父", participantCount: 4, perPersonYen: 1500, amountYen: 6000, dateLabel: "May 5", categoryKey: "UTILITIES" },
    { id: "exp-fm-08", icon: "🧴", title: "子ども用品", payerName: "レ", participantCount: 4, perPersonYen: 2500, amountYen: 10000, dateLabel: "Apr 28", categoryKey: "DAILY_GOODS" },
    { id: "exp-fm-09", icon: "🏠", title: "5月分家賃", payerName: "父", participantCount: 4, perPersonYen: 26250, amountYen: 105000, dateLabel: "May 1", categoryKey: "HOUSING" },
    { id: "exp-fm-10", icon: "🎬", title: "映画・娯楽", payerName: "ユ", participantCount: 4, perPersonYen: 1500, amountYen: 6000, dateLabel: "Apr 20", categoryKey: "ENTERTAINMENT" },
  ], ["父", "母", "ユ", "レ"]),
  settlementTransfers: [
    { id: "tr-fm-01", fromMemberName: "母", toMemberName: "父", amountYen: 18750, completed: false },
    { id: "tr-fm-02", fromMemberName: "ユ", toMemberName: "父", amountYen: 64750, completed: false },
    { id: "tr-fm-03", fromMemberName: "レ", toMemberName: "父", amountYen: 68750, completed: false },
  ],
  memberBalances: [
    { id: "member-father", avatarLabel: "父", name: "父", paidYen: 231000, burdenYen: 78750, balanceYen: 152250 },
    { id: "member-mother", avatarLabel: "母", name: "母", paidYen: 60000, burdenYen: 78750, balanceYen: -18750 },
    { id: "member-yu", avatarLabel: "ユ", name: "ユ", paidYen: 14000, burdenYen: 78750, balanceYen: -64750 },
    { id: "member-rei", avatarLabel: "レ", name: "レ", paidYen: 10000, burdenYen: 78750, balanceYen: -68750 },
  ],
  categoryBreakdown: [
    { key: "HOUSING", label: "家賃・宿泊", color: categoryColors.HOUSING, percent: 67, amountYen: 210000 },
    { key: "FOOD", label: "食費", color: categoryColors.FOOD, percent: 15, amountYen: 48000 },
    { key: "UTILITIES", label: "光熱費", color: categoryColors.UTILITIES, percent: 10, amountYen: 33000 },
    { key: "DAILY_GOODS", label: "日用品", color: categoryColors.DAILY_GOODS, percent: 6, amountYen: 18000 },
    { key: "ENTERTAINMENT", label: "娯楽", color: categoryColors.ENTERTAINMENT, percent: 2, amountYen: 6000 },
  ],
  memberComparison: [
    { id: "member-father", name: "父", paidYen: 231000, burdenYen: 78750 },
    { id: "member-mother", name: "母", paidYen: 60000, burdenYen: 78750 },
    { id: "member-yu", name: "ユ", paidYen: 14000, burdenYen: 78750 },
    { id: "member-rei", name: "レ", paidYen: 10000, burdenYen: 78750 },
  ],
};

const continuousProjectDetails: Record<string, ContinuousProjectDetail> = {
  [shareHouse.publicToken]: shareHouse,
  [familyCosts.publicToken]: familyCosts,
};

export function getContinuousProjectDetail(
  publicToken: string | undefined,
): ContinuousProjectDetail | null {
  if (!publicToken) {
    return null;
  }

  return continuousProjectDetails[publicToken] ?? null;
}
