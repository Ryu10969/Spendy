export type ProjectType = "CONTINUOUS" | "EVENT";

export type ProjectStatus = "ACTIVE" | "ARCHIVED";

export type ProjectMember = {
  id: string;
  name: string;
  displayName: string;
  avatarLabel: string;
  active?: boolean;
};

export type ProjectSummary = {
  description: string;
  totalExpenseYen: number | bigint;
  expenseCount: number;
  balanceYen: number | bigint;
  pendingSettlementCount?: number;
  lastUpdatedLabel: string;
};

export type ProjectListItem = {
  id: string;
  publicToken: string;
  name: string;
  icon: string;
  type: ProjectType;
  status: ProjectStatus;
  members: ProjectMember[];
  summary: ProjectSummary;
};

export type RoundingUnit = 1 | 10 | 100 | 1000;

export type ProjectFormMember = {
  id: string;
  name: string;
};

export type ProjectCreateFormState = {
  type: ProjectType;
  name: string;
  description: string;
  roundingUnit: RoundingUnit;
  members: ProjectFormMember[];
};

export type ExpenseCategoryKey =
  | "HOUSING"
  | "UTILITIES"
  | "FOOD"
  | "ENTERTAINMENT"
  | "DAILY_GOODS"
  | "DAILY_NECESSITIES"
  | "TRANSPORTATION"
  | "ACCOMMODATION"
  | "OTHER";

export type ProjectExpenseAllocation = {
  memberId: string;
  memberName: string;
  allocatedShareYen: number;
};

export type PersistedProjectExpenseState = {
  payerMemberId: string;
  participantMemberIds: string[];
  paidOn: string;
  version: number;
};

export type ProjectExpenseItem = {
  id: string;
  icon: string;
  title: string;
  payerName: string;
  participantNames: string[];
  participantAllocations?: ProjectExpenseAllocation[];
  participantCount: number;
  perPersonYen: number;
  amountYen: number;
  dateLabel: string;
  categoryKey: ExpenseCategoryKey | null;
  memo: string | null;
  persistedState?: PersistedProjectExpenseState;
};

export type SettlementTransfer = {
  id: string;
  fromMemberName: string;
  toMemberName: string;
  amountYen: number;
  completed: boolean;
};

export type MemberBalanceItem = {
  id: string;
  avatarLabel: string;
  name: string;
  paidYen: number;
  burdenYen: number;
  balanceYen: number;
};

export type CategoryBreakdownItem = {
  key: ExpenseCategoryKey;
  label: string;
  color: string;
  percent: number;
  amountYen: number;
};

export type MemberComparisonItem = {
  id: string;
  name: string;
  paidYen: number;
  burdenYen: number;
};

export type ContinuousProjectDetail = {
  id: string;
  publicToken: string;
  name: string;
  icon: string;
  type: Extract<ProjectType, "CONTINUOUS">;
  description: string;
  currencyLabel: string;
  members: ProjectMember[];
  referenceMemberId: string | null;
  kpi: {
    totalExpenseYen: number | bigint;
    expenseCount: number;
    perMemberAverageYen: number;
    settlementTransactionCount: number;
  };
  expenses: ProjectExpenseItem[];
  settlementTransfers: SettlementTransfer[];
  memberBalances: MemberBalanceItem[];
  categoryBreakdown: CategoryBreakdownItem[];
  memberComparison: MemberComparisonItem[];
};

// Event project detail static demo shape.
//
// Event detail intentionally has no analytics charts (category / member
// comparison) because PRODUCT_CHARTER.md sections 9.2 and 21 and
// docs/ui/MOCKUP_INDEX.md sections 7.6 / 8.5 exclude them for event projects
// in the MVP. Member paid / burden / balance are shown through the member
// balance panel, which is not an analytics chart.
export type EventProjectDetail = {
  id: string;
  publicToken: string;
  name: string;
  icon: string;
  type: Extract<ProjectType, "EVENT">;
  status: ProjectStatus;
  description: string;
  currencyLabel: string;
  dateLabel: string;
  members: ProjectMember[];
  referenceMemberId: string | null;
  kpi: {
    totalExpenseYen: number | bigint;
    expenseCount: number;
    perMemberAverageYen: number;
    settlementTransactionCount: number;
  };
  expenses: ProjectExpenseItem[];
  settlementTransfers: SettlementTransfer[];
  memberBalances: MemberBalanceItem[];
};
