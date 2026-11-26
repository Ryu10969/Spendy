import type { EventProjectDetail, ProjectExpenseItem } from "../../types/project";
import { demoSettlementMembers, demoSettlementPublicToken } from "./settlementResponses";

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

// Event project detail dummy data.
//
// The values below are static demo data, not an API contract or DB schema.
//
// They are internally consistent by construction:
// - Each member's paid amount is the sum of the expenses they paid.
// - Burden is the equal split of the total (floor + deterministic +1 yen remainder).
// - balance = paid - burden, and all balances sum to 0.
// - Settlement transfers are direct debtor-to-creditor transfers that reconcile.
//
// Event detail intentionally has no category / member analytics charts, per
// PRODUCT_CHARTER.md sections 9.2 and 21 and docs/ui/MOCKUP_INDEX.md sections
// 7.6 / 8.5. The member balance panel (paid / burden / balance) is not an
// analytics chart.
//
// The mockup's overlapping / garbled settlement text and the mockup "self
// balance" (¥32,660) that does not reconcile with the member balances were
// treated as generated defects and were not reproduced verbatim. The member
// balance figures are used as the internally consistent source.

const okinawaTrip: EventProjectDetail = {
  id: "project-okinawa-trip",
  publicToken: "demo-event-project",
  name: "沖縄旅行",
  icon: "🏝️",
  type: "EVENT",
  status: "ACTIVE",
  description: "夏の沖縄バカンス",
  currencyLabel: "JPY (¥)",
  dateLabel: "May 20 – 28",
  members: [
    { id: "member-alice-trip", name: "Alice", displayName: "Alice", avatarLabel: "A" },
    { id: "member-bob-trip", name: "Bob", displayName: "Bob", avatarLabel: "B" },
    { id: "member-carol-trip", name: "Carol", displayName: "Carol", avatarLabel: "C" },
  ],
  referenceMemberId: "member-alice-trip",
  kpi: {
    totalExpenseYen: 229600,
    expenseCount: 7,
    perMemberAverageYen: 76533,
    settlementTransactionCount: 2,
  },
  expenses: withExpenseDetails([
    { id: "exp-ok-01", icon: "🎁", title: "お土産", payerName: "Carol", participantCount: 3, perPersonYen: 2667, amountYen: 8000, dateLabel: "May 28", categoryKey: "OTHER" },
    { id: "exp-ok-02", icon: "🤿", title: "ダイビング体験", payerName: "Bob", participantCount: 3, perPersonYen: 4000, amountYen: 12000, dateLabel: "May 27", categoryKey: "ENTERTAINMENT" },
    { id: "exp-ok-03", icon: "🍽️", title: "ランチ・軽食", payerName: "Alice", participantCount: 3, perPersonYen: 2667, amountYen: 8000, dateLabel: "May 27", categoryKey: "FOOD" },
    { id: "exp-ok-04", icon: "🚗", title: "レンタカー", payerName: "Carol", participantCount: 3, perPersonYen: 6000, amountYen: 18000, dateLabel: "May 26", categoryKey: "TRANSPORTATION" },
    { id: "exp-ok-05", icon: "🦞", title: "シーフードレストランでの夕食", payerName: "Alice", participantCount: 3, perPersonYen: 5200, amountYen: 15600, dateLabel: "May 26", categoryKey: "FOOD" },
    { id: "exp-ok-06", icon: "🏨", title: "ホテル予約", payerName: "Alice", participantCount: 3, perPersonYen: 32000, amountYen: 96000, dateLabel: "May 25", categoryKey: "ACCOMMODATION" },
    { id: "exp-ok-07", icon: "✈️", title: "航空券", payerName: "Bob", participantCount: 3, perPersonYen: 24000, amountYen: 72000, dateLabel: "May 20", categoryKey: "TRANSPORTATION" },
  ], ["Alice", "Bob", "Carol"]),
  settlementTransfers: [
    { id: "tr-ok-01", fromMemberName: "Carol", toMemberName: "Alice", amountYen: 43066, completed: true },
    { id: "tr-ok-02", fromMemberName: "Carol", toMemberName: "Bob", amountYen: 7467, completed: true },
  ],
  memberBalances: [
    { id: "member-alice-trip", avatarLabel: "A", name: "Alice", paidYen: 119600, burdenYen: 76534, balanceYen: 43066 },
    { id: "member-bob-trip", avatarLabel: "B", name: "Bob", paidYen: 84000, burdenYen: 76533, balanceYen: 7467 },
    { id: "member-carol-trip", avatarLabel: "C", name: "Carol", paidYen: 26000, burdenYen: 76533, balanceYen: -50533 },
  ],
};

const europeTrip: EventProjectDetail = {
  id: "project-europe-backpack",
  publicToken: "demo-europe-trip",
  name: "ヨーロッパ旅行",
  icon: "✈️",
  type: "EVENT",
  status: "ACTIVE",
  description: "ヨーロッパバックパック旅行",
  currencyLabel: "JPY (¥)",
  dateLabel: "Apr 9 – 15",
  members: [
    { id: "member-alice-europe", name: "Alice", displayName: "Alice", avatarLabel: "A" },
    { id: "member-bob-europe", name: "Bob", displayName: "Bob", avatarLabel: "B" },
    { id: "member-carol-europe", name: "Carol", displayName: "Carol", avatarLabel: "C" },
  ],
  referenceMemberId: "member-alice-europe",
  kpi: {
    totalExpenseYen: 2910,
    expenseCount: 7,
    perMemberAverageYen: 970,
    settlementTransactionCount: 2,
  },
  expenses: withExpenseDetails([
    { id: "exp-eu-01", icon: "💧", title: "ミネラルウォーター", payerName: "Alice", participantCount: 3, perPersonYen: 100, amountYen: 300, dateLabel: "Apr 15", categoryKey: "FOOD" },
    { id: "exp-eu-02", icon: "🚇", title: "地下鉄チケット", payerName: "Bob", participantCount: 3, perPersonYen: 300, amountYen: 900, dateLabel: "Apr 14", categoryKey: "TRANSPORTATION" },
    { id: "exp-eu-03", icon: "🎁", title: "お土産", payerName: "Carol", participantCount: 3, perPersonYen: 200, amountYen: 600, dateLabel: "Apr 13", categoryKey: "OTHER" },
    { id: "exp-eu-04", icon: "☕", title: "カフェ", payerName: "Alice", participantCount: 3, perPersonYen: 70, amountYen: 210, dateLabel: "Apr 12", categoryKey: "FOOD" },
    { id: "exp-eu-05", icon: "🖼️", title: "美術館", payerName: "Bob", participantCount: 3, perPersonYen: 150, amountYen: 450, dateLabel: "Apr 11", categoryKey: "ENTERTAINMENT" },
    { id: "exp-eu-06", icon: "🍫", title: "スナック", payerName: "Carol", participantCount: 3, perPersonYen: 50, amountYen: 150, dateLabel: "Apr 10", categoryKey: "FOOD" },
    { id: "exp-eu-07", icon: "📮", title: "絵はがき", payerName: "Alice", participantCount: 3, perPersonYen: 100, amountYen: 300, dateLabel: "Apr 9", categoryKey: "OTHER" },
  ], ["Alice", "Bob", "Carol"]),
  settlementTransfers: [
    { id: "tr-eu-01", fromMemberName: "Carol", toMemberName: "Bob", amountYen: 220, completed: false },
    { id: "tr-eu-02", fromMemberName: "Alice", toMemberName: "Bob", amountYen: 160, completed: false },
  ],
  memberBalances: [
    { id: "member-alice-europe", avatarLabel: "A", name: "Alice", paidYen: 810, burdenYen: 970, balanceYen: -160 },
    { id: "member-bob-europe", avatarLabel: "B", name: "Bob", paidYen: 1350, burdenYen: 970, balanceYen: 380 },
    { id: "member-carol-europe", avatarLabel: "C", name: "Carol", paidYen: 750, burdenYen: 970, balanceYen: -220 },
  ],
};

const springCamp: EventProjectDetail = {
  id: "project-spring-camp",
  publicToken: "demo-archived-event-project",
  name: "春キャンプ",
  icon: "⛺",
  type: "EVENT",
  status: "ARCHIVED",
  description: "精算済みの週末キャンプ",
  currencyLabel: "JPY (¥)",
  dateLabel: "Mar 22 – 24",
  members: [
    { id: "member-aki", name: "Aki", displayName: "Aki", avatarLabel: "A" },
    { id: "member-mio", name: "Mio", displayName: "Mio", avatarLabel: "M" },
    { id: "member-ren", name: "Ren", displayName: "Ren", avatarLabel: "R" },
  ],
  referenceMemberId: "member-aki",
  kpi: {
    totalExpenseYen: 86400,
    expenseCount: 9,
    perMemberAverageYen: 28800,
    settlementTransactionCount: 2,
  },
  expenses: withExpenseDetails([
    { id: "exp-sc-01", icon: "🍖", title: "追加食材", payerName: "Mio", participantCount: 3, perPersonYen: 6800, amountYen: 20400, dateLabel: "Mar 24", categoryKey: "FOOD" },
    { id: "exp-sc-02", icon: "♨️", title: "温泉入浴", payerName: "Ren", participantCount: 3, perPersonYen: 2000, amountYen: 6000, dateLabel: "Mar 24", categoryKey: "ENTERTAINMENT" },
    { id: "exp-sc-03", icon: "⛽", title: "ガソリン代", payerName: "Aki", participantCount: 3, perPersonYen: 2400, amountYen: 7200, dateLabel: "Mar 23", categoryKey: "TRANSPORTATION" },
    { id: "exp-sc-04", icon: "🍳", title: "朝食材料", payerName: "Mio", participantCount: 3, perPersonYen: 1600, amountYen: 4800, dateLabel: "Mar 23", categoryKey: "FOOD" },
    { id: "exp-sc-05", icon: "🎒", title: "レンタル用品", payerName: "Ren", participantCount: 3, perPersonYen: 3000, amountYen: 9000, dateLabel: "Mar 23", categoryKey: "OTHER" },
    { id: "exp-sc-06", icon: "🏕️", title: "キャンプ場利用料", payerName: "Aki", participantCount: 3, perPersonYen: 6000, amountYen: 18000, dateLabel: "Mar 22", categoryKey: "ACCOMMODATION" },
    { id: "exp-sc-07", icon: "🥤", title: "飲み物", payerName: "Mio", participantCount: 3, perPersonYen: 1800, amountYen: 5400, dateLabel: "Mar 22", categoryKey: "FOOD" },
    { id: "exp-sc-08", icon: "🍗", title: "BBQ食材", payerName: "Aki", participantCount: 3, perPersonYen: 4000, amountYen: 12000, dateLabel: "Mar 22", categoryKey: "FOOD" },
    { id: "exp-sc-09", icon: "🪵", title: "薪・炭", payerName: "Ren", participantCount: 3, perPersonYen: 1200, amountYen: 3600, dateLabel: "Mar 22", categoryKey: "OTHER" },
  ], ["Aki", "Mio", "Ren"]),
  settlementTransfers: [
    { id: "tr-sc-01", fromMemberName: "Ren", toMemberName: "Aki", amountYen: 8400, completed: true },
    { id: "tr-sc-02", fromMemberName: "Ren", toMemberName: "Mio", amountYen: 1800, completed: true },
  ],
  memberBalances: [
    { id: "member-aki", avatarLabel: "A", name: "Aki", paidYen: 37200, burdenYen: 28800, balanceYen: 8400 },
    { id: "member-mio", avatarLabel: "M", name: "Mio", paidYen: 30600, burdenYen: 28800, balanceYen: 1800 },
    { id: "member-ren", avatarLabel: "R", name: "Ren", paidYen: 18600, burdenYen: 28800, balanceYen: -10200 },
  ],
};

const settlementComparisonDemo: EventProjectDetail = {
  id: "project-settlement-comparison-demo",
  publicToken: demoSettlementPublicToken,
  name: "精算方式の比較デモ",
  icon: "🧾",
  type: "EVENT",
  status: "ACTIVE",
  description: "同じ支出から2方式の精算を確認するデモ",
  currencyLabel: "JPY (¥)",
  dateLabel: "Sep 30",
  members: demoSettlementMembers,
  referenceMemberId: demoSettlementMembers[0].id,
  kpi: {
    totalExpenseYen: 50000,
    expenseCount: 5,
    perMemberAverageYen: 10000,
    settlementTransactionCount: 0,
  },
  expenses: withExpenseDetails([
    { id: "exp-demo-ryudai", icon: "🧾", title: "琉大の立替", payerName: demoSettlementMembers[0].displayName, participantCount: 5, perPersonYen: 1200, amountYen: 6000, dateLabel: "Sep 30", categoryKey: "OTHER" },
    { id: "exp-demo-futaba", icon: "🧾", title: "双葉の立替", payerName: demoSettlementMembers[1].displayName, participantCount: 5, perPersonYen: 3200, amountYen: 16000, dateLabel: "Sep 30", categoryKey: "OTHER" },
    { id: "exp-demo-kaito", icon: "🧾", title: "かいとの立替", payerName: demoSettlementMembers[2].displayName, participantCount: 5, perPersonYen: 800, amountYen: 4000, dateLabel: "Sep 30", categoryKey: "OTHER" },
    { id: "exp-demo-riki", icon: "🧾", title: "りきの立替", payerName: demoSettlementMembers[3].displayName, participantCount: 5, perPersonYen: 1600, amountYen: 8000, dateLabel: "Sep 30", categoryKey: "OTHER" },
    { id: "exp-demo-mother", icon: "🧾", title: "お母さんの立替", payerName: demoSettlementMembers[4].displayName, participantCount: 5, perPersonYen: 3200, amountYen: 16000, dateLabel: "Sep 30", categoryKey: "OTHER" },
  ], demoSettlementMembers.map((member) => member.displayName)),
  // The selected SettlementResponse populates these fields in ProjectDetailPage.
  settlementTransfers: [],
  memberBalances: [],
};

const eventProjectDetails: Record<string, EventProjectDetail> = {
  [okinawaTrip.publicToken]: okinawaTrip,
  [europeTrip.publicToken]: europeTrip,
  [springCamp.publicToken]: springCamp,
  [settlementComparisonDemo.publicToken]: settlementComparisonDemo,
};

export function getEventProjectDetail(
  publicToken: string | undefined,
): EventProjectDetail | null {
  if (!publicToken) {
    return null;
  }

  return eventProjectDetails[publicToken] ?? null;
}
