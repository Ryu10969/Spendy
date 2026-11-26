import { useQuery } from "@tanstack/react-query";
import {
  getSettlement,
  type SettlementResponse,
  type SettlementStrategy,
} from "../../api/settlementApi";
import { getSettlementFixture } from "../../mocks/fixtures/settlementResponses";
import { sameSettlementFingerprint } from "./settlementSource";

export type SettlementComparison = Record<SettlementStrategy, SettlementResponse>;

export class SettlementSourceChangedError extends Error {
  constructor() {
    super("Settlement source changed while loading the comparison.");
  }
}

function loadSettlement(
  publicToken: string,
  strategy: SettlementStrategy,
): Promise<SettlementResponse> {
  const fixture = getSettlementFixture(publicToken, strategy);
  return fixture ? Promise.resolve(fixture) : getSettlement(publicToken, strategy);
}

function sameBalances(left: SettlementResponse, right: SettlementResponse): boolean {
  if (left.balances.length !== right.balances.length) return false;
  const rightByMember = new Map(right.balances.map((balance) => [balance.memberId, balance]));
  return left.balances.every((balance) => {
    const other = rightByMember.get(balance.memberId);
    return other?.paidAmount === balance.paidAmount
      && other.burdenAmount === balance.burdenAmount
      && other.exactBalance === balance.exactBalance
      && other.roundedTransferNet === balance.roundedTransferNet
      && other.roundingDifference === balance.roundingDifference;
  });
}

export async function getSettlementComparison(
  publicToken: string,
  requireFingerprint = false,
): Promise<SettlementComparison> {
  // Every GET is serialized with Expense mutations by the Project lock. A
  // source-changing mutation stales the first run, so the final GET cannot
  // return its runId when the middle strategy saw a different source state.
  const fewer = await loadSettlement(publicToken, "FEWER_TRANSFERS");
  const understandable = await loadSettlement(publicToken, "UNDERSTANDABLE");
  const confirmedFewer = await loadSettlement(publicToken, "FEWER_TRANSFERS");
  const fingerprints = [
    fewer.sourceStateFingerprint,
    understandable.sourceStateFingerprint,
    confirmedFewer.sourceStateFingerprint,
  ];
  const hasAnyFingerprint = fingerprints.some(Boolean);
  const hasAllFingerprints = fingerprints.every(Boolean);
  // Recovery requires the fingerprint; normal display retains the run/balance checks.
  if (
    fewer.runId !== confirmedFewer.runId
    || fewer.scopeType !== "PROJECT"
    || understandable.scopeType !== "PROJECT"
    || fewer.strategy !== "FEWER_TRANSFERS"
    || understandable.strategy !== "UNDERSTANDABLE"
    || fewer.state !== "CURRENT"
    || understandable.state !== "CURRENT"
    || confirmedFewer.state !== "CURRENT"
    || (requireFingerprint && !hasAllFingerprints)
    || (hasAnyFingerprint && (!hasAllFingerprints
      || !sameSettlementFingerprint(fewer, understandable, confirmedFewer)))
    || !sameBalances(fewer, understandable)
  ) {
    throw new SettlementSourceChangedError();
  }
  return { FEWER_TRANSFERS: confirmedFewer, UNDERSTANDABLE: understandable };
}

export const settlementKeys = {
  project: (publicToken: string) =>
    ["projects", publicToken, "settlements"] as const,
  detail: (publicToken: string, strategy: SettlementStrategy, month?: string) =>
    month ? [...settlementKeys.project(publicToken), strategy, month] as const
      : [...settlementKeys.project(publicToken), strategy] as const,
  comparison: (publicToken: string) =>
    [...settlementKeys.project(publicToken), "comparison"] as const,
};

export function useSettlementQuery(
  publicToken: string | undefined,
  strategy: SettlementStrategy,
  enabled = true,
  month?: string,
) {
  return useQuery({
    queryKey: settlementKeys.detail(publicToken ?? "", strategy, month),
    queryFn: () => month ? getSettlement(publicToken!, strategy, month)
      : loadSettlement(publicToken!, strategy),
    enabled: Boolean(publicToken) && enabled,
  });
}

export function useSettlementComparisonQuery(
  publicToken: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: settlementKeys.comparison(publicToken ?? ""),
    queryFn: () => getSettlementComparison(publicToken!),
    enabled: Boolean(publicToken) && enabled,
    retry: false,
  });
}
