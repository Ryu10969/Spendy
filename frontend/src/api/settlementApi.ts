import { apiRequest } from "./client";

export const SETTLEMENT_STRATEGIES = ["FEWER_TRANSFERS", "UNDERSTANDABLE"] as const;

export type SettlementStrategy = (typeof SETTLEMENT_STRATEGIES)[number];

export const SETTLEMENT_STRATEGY_LABELS: Record<SettlementStrategy, string> = {
  FEWER_TRANSFERS: "送金回数を少なくする",
  UNDERSTANDABLE: "わかりやすく精算",
};

export type SettlementScopeType = "PROJECT" | "YEAR_MONTH";

export type SettlementRunState = "CURRENT" | "STALE";

export type SettlementTransferStatus = "OUTSTANDING" | "COMPLETED";

export type SettlementBalanceResponse = {
  memberId: string;
  paidAmount: number;
  burdenAmount: number;
  exactBalance: number;
  roundedTransferNet: number;
  roundingDifference: number;
};

export type SettlementTransferExplanationResponse = {
  kind: "NET_BALANCE_MATCH";
  fromExactBalanceBefore: number;
  toExactBalanceBefore: number;
};

export type SettlementTransferResponse = {
  id: string;
  transferOrder: number;
  fromMemberId: string;
  toMemberId: string;
  exactAmount: number;
  initiallyRoundedAmount: number;
  finalRoundedAmount: number;
  roundingAdjustment: number;
  status: SettlementTransferStatus;
  completedAt: string | null;
  explanation: SettlementTransferExplanationResponse;
};

export type SettlementResponse = {
  runId: string;
  sourceStateFingerprint: string;
  scopeType: SettlementScopeType;
  scopeKey?: string;
  strategy: SettlementStrategy;
  state: SettlementRunState;
  generatedAt: string;
  balances: SettlementBalanceResponse[];
  transfers: SettlementTransferResponse[];
};

export function getSettlement(
  publicToken: string,
  strategy: SettlementStrategy,
  month?: string,
): Promise<SettlementResponse> {
  const search = new URLSearchParams({ strategy });
  if (month) search.set("month", month);
  return apiRequest<SettlementResponse>(
    `/api/projects/${encodeURIComponent(publicToken)}/settlements?${search.toString()}`,
  );
}
