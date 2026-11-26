import type {
  SettlementResponse,
  SettlementStrategy,
  SettlementTransferResponse,
} from "../../api/settlementApi";
import type { ProjectMember } from "../../types/project";

export const demoSettlementPublicToken = "demo-settlement-comparison";

export const demoSettlementMembers: ProjectMember[] = [
  { id: "member-ryudai", name: "琉大", displayName: "琉大", avatarLabel: "琉" },
  { id: "member-futaba", name: "双葉", displayName: "双葉", avatarLabel: "双" },
  { id: "member-kaito", name: "かいと", displayName: "かいと", avatarLabel: "か" },
  { id: "member-riki", name: "りき", displayName: "りき", avatarLabel: "り" },
  { id: "member-mother", name: "お母さん", displayName: "お母さん（旅行幹事）", avatarLabel: "母" },
];

const balances: SettlementResponse["balances"] = [
  { memberId: "member-ryudai", paidAmount: 6000, burdenAmount: 10000, exactBalance: -4000, roundedTransferNet: -4000, roundingDifference: 0 },
  { memberId: "member-futaba", paidAmount: 16000, burdenAmount: 10000, exactBalance: 6000, roundedTransferNet: 6000, roundingDifference: 0 },
  { memberId: "member-kaito", paidAmount: 4000, burdenAmount: 10000, exactBalance: -6000, roundedTransferNet: -6000, roundingDifference: 0 },
  { memberId: "member-riki", paidAmount: 8000, burdenAmount: 10000, exactBalance: -2000, roundedTransferNet: -2000, roundingDifference: 0 },
  { memberId: "member-mother", paidAmount: 16000, burdenAmount: 10000, exactBalance: 6000, roundedTransferNet: 6000, roundingDifference: 0 },
];

function transfer(
  strategy: SettlementStrategy,
  transferOrder: number,
  fromMemberId: string,
  toMemberId: string,
  amount: number,
  fromExactBalanceBefore: number,
  toExactBalanceBefore: number,
): SettlementTransferResponse {
  return {
    id: `demo-${strategy.toLowerCase()}-${transferOrder}`,
    transferOrder,
    fromMemberId,
    toMemberId,
    exactAmount: amount,
    initiallyRoundedAmount: amount,
    finalRoundedAmount: amount,
    roundingAdjustment: 0,
    status: "OUTSTANDING",
    completedAt: null,
    explanation: { kind: "NET_BALANCE_MATCH", fromExactBalanceBefore, toExactBalanceBefore },
  };
}

const responses: Record<SettlementStrategy, SettlementResponse> = {
  FEWER_TRANSFERS: {
    runId: "demo-settlement-fewer-v1",
    sourceStateFingerprint: "a".repeat(64),
    scopeType: "PROJECT",
    strategy: "FEWER_TRANSFERS",
    state: "CURRENT",
    generatedAt: "2026-09-30T00:00:00Z",
    balances,
    transfers: [
      transfer("FEWER_TRANSFERS", 1, "member-kaito", "member-futaba", 6000, -6000, 6000),
      transfer("FEWER_TRANSFERS", 2, "member-ryudai", "member-mother", 4000, -4000, 6000),
      transfer("FEWER_TRANSFERS", 3, "member-riki", "member-mother", 2000, -2000, 2000),
    ],
  },
  UNDERSTANDABLE: {
    runId: "demo-settlement-understandable-v1",
    sourceStateFingerprint: "a".repeat(64),
    scopeType: "PROJECT",
    strategy: "UNDERSTANDABLE",
    state: "CURRENT",
    generatedAt: "2026-09-30T00:00:00Z",
    balances,
    transfers: [
      transfer("UNDERSTANDABLE", 1, "member-ryudai", "member-futaba", 4000, -4000, 6000),
      transfer("UNDERSTANDABLE", 2, "member-kaito", "member-futaba", 2000, -6000, 2000),
      transfer("UNDERSTANDABLE", 3, "member-kaito", "member-mother", 4000, -4000, 6000),
      transfer("UNDERSTANDABLE", 4, "member-riki", "member-mother", 2000, -2000, 2000),
    ],
  },
};

export function getSettlementFixture(
  publicToken: string | undefined,
  strategy: SettlementStrategy,
): SettlementResponse | null {
  return publicToken === demoSettlementPublicToken ? responses[strategy] : null;
}
