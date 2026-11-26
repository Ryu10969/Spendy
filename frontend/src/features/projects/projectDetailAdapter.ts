import type { ExpenseCategory, ExpenseResponse } from "../../api/expenseApi";
import type { ProjectResponse } from "../../api/projectApi";
import type { SettlementResponse } from "../../api/settlementApi";
import type {
  ContinuousProjectDetail,
  EventProjectDetail,
  MemberBalanceItem,
  ProjectExpenseItem,
  ProjectMember,
  SettlementTransfer,
} from "../../types/project";

function avatarLabel(name: string): string {
  return Array.from(name)[0]?.toLocaleUpperCase() ?? "";
}

function toProjectMembers(project: ProjectResponse): ProjectMember[] {
  return [...project.members]
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .map((member) => ({
      id: member.id,
      name: member.name,
      displayName: member.name,
      avatarLabel: avatarLabel(member.name),
      active: member.active,
    }));
}

const expenseCategoryIcons: Record<ExpenseCategory, string> = {
  FOOD: "🍽️",
  UTILITIES: "💡",
  TRANSPORTATION: "🚃",
  ACCOMMODATION: "🏨",
  DAILY_NECESSITIES: "🧴",
  ENTERTAINMENT: "🎬",
  OTHER: "🧾",
};

function formatPaidOn(paidOn: string): string {
  const [year, month, day] = paidOn.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}

function toExpenseSummary(expenses: ExpenseResponse[]) {
  return {
    totalExpenseYen: expenses.reduce(
      (total, expense) => total + BigInt(expense.amount),
      0n,
    ),
    expenseCount: expenses.length,
  };
}

function toExpenseItems(
  expenses: ExpenseResponse[],
  members: ProjectMember[],
): ProjectExpenseItem[] {
  const memberNames = new Map(members.map((member) => [member.id, member.displayName]));

  return expenses.map((expense) => {
    const participantAllocations = expense.participants.map((participant) => ({
      memberId: participant.memberId,
      memberName: memberNames.get(participant.memberId) ?? "不明なメンバー",
      allocatedShareYen: participant.allocatedShare,
    }));

    return {
      id: expense.id,
      icon: expense.category ? expenseCategoryIcons[expense.category] : "🧾",
      title: expense.content,
      payerName: memberNames.get(expense.payerMemberId) ?? "不明なメンバー",
      participantNames: participantAllocations.map((participant) => participant.memberName),
      participantAllocations,
      participantCount: participantAllocations.length,
      perPersonYen: participantAllocations[0]?.allocatedShareYen ?? 0,
      amountYen: expense.amount,
      dateLabel: formatPaidOn(expense.paidOn),
      categoryKey: expense.category,
      memo: expense.note,
      persistedState: {
        payerMemberId: expense.payerMemberId,
        participantMemberIds: expense.participants.map((participant) => participant.memberId),
        paidOn: expense.paidOn,
        version: expense.version,
      },
    };
  });
}

function memberNameById(members: ProjectMember[]): Map<string, ProjectMember> {
  return new Map(members.map((member) => [member.id, member]));
}

function toSettlementTransfers(
  settlement: SettlementResponse,
  members: ProjectMember[],
): SettlementTransfer[] {
  const membersById = memberNameById(members);

  return settlement.transfers.map((transfer) => ({
    id: transfer.id,
    fromMemberName: membersById.get(transfer.fromMemberId)?.displayName ?? "不明なメンバー",
    toMemberName: membersById.get(transfer.toMemberId)?.displayName ?? "不明なメンバー",
    amountYen: transfer.finalRoundedAmount,
    completed: transfer.status === "COMPLETED",
  }));
}

function toMemberBalances(
  settlement: SettlementResponse,
  members: ProjectMember[],
): MemberBalanceItem[] {
  const membersById = memberNameById(members);

  return settlement.balances.map((balance) => {
    const member = membersById.get(balance.memberId);
    const name = member?.displayName ?? "不明なメンバー";

    return {
      id: balance.memberId,
      avatarLabel: member?.avatarLabel ?? avatarLabel(name),
      name,
      paidYen: balance.paidAmount,
      burdenYen: balance.burdenAmount,
      balanceYen: balance.exactBalance,
    };
  });
}

export function withEventSettlement(
  detail: EventProjectDetail,
  settlement?: SettlementResponse,
): EventProjectDetail {
  if (!settlement) return detail;
  const settlementTransfers = toSettlementTransfers(settlement, detail.members);
  return {
    ...detail,
    kpi: { ...detail.kpi, settlementTransactionCount: settlementTransfers.length },
    settlementTransfers,
    memberBalances: toMemberBalances(settlement, detail.members),
  };
}

function toContinuousDetail(
  project: ProjectResponse,
  expenses: ExpenseResponse[],
  settlement?: SettlementResponse,
): ContinuousProjectDetail {
  const members = toProjectMembers(project);
  const expenseSummary = toExpenseSummary(expenses);

  return {
    id: project.publicToken,
    publicToken: project.publicToken,
    name: project.name,
    icon: "",
    type: "CONTINUOUS",
    description: project.description ?? "",
    currencyLabel: "JPY (¥)",
    members,
    referenceMemberId: null,
    kpi: {
      ...expenseSummary,
      perMemberAverageYen: 0,
      settlementTransactionCount: settlement?.transfers.length ?? 0,
    },
    expenses: toExpenseItems(expenses, members),
    settlementTransfers: settlement ? toSettlementTransfers(settlement, members) : [],
    memberBalances: settlement ? toMemberBalances(settlement, members) : [],
    categoryBreakdown: [],
    memberComparison: [],
  };
}

function toEventDetail(
  project: ProjectResponse,
  expenses: ExpenseResponse[],
  settlement?: SettlementResponse,
): EventProjectDetail {
  const members = toProjectMembers(project);
  const expenseSummary = toExpenseSummary(expenses);
  const settlementTransfers = settlement ? toSettlementTransfers(settlement, members) : [];
  const memberBalances = settlement ? toMemberBalances(settlement, members) : [];

  return {
    id: project.publicToken,
    publicToken: project.publicToken,
    name: project.name,
    icon: "",
    type: "EVENT",
    status: project.status,
    description: project.description ?? "",
    currencyLabel: "JPY (¥)",
    dateLabel: "",
    members,
    referenceMemberId: null,
    kpi: {
      ...expenseSummary,
      perMemberAverageYen: 0,
      settlementTransactionCount: settlementTransfers.length,
    },
    expenses: toExpenseItems(expenses, members),
    settlementTransfers,
    memberBalances,
  };
}

export function toProjectDetail(
  project: ProjectResponse,
  expenses: ExpenseResponse[],
  settlement?: SettlementResponse,
): ContinuousProjectDetail | EventProjectDetail {
  return project.type === "CONTINUOUS"
    ? toContinuousDetail(project, expenses, settlement)
    : toEventDetail(project, expenses, settlement);
}
