export type ProjectType = "CONTINUOUS" | "EVENT";

export type ProjectStatus = "ACTIVE" | "ARCHIVED";

export type ProjectMember = {
  id: string;
  name: string;
  displayName: string;
  avatarLabel: string;
};

export type ProjectSummary = {
  description: string;
  totalExpenseYen: number;
  expenseCount: number;
  balanceYen: number;
  pendingSettlementCount: number;
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
