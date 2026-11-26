import type { SettlementResponse } from "../../../api/settlementApi";

// Compare only the transfer plan shown to the user, in its displayed order.
export function areSettlementPlansEquivalent(left: SettlementResponse, right: SettlementResponse): boolean {
  return left.transfers.length === right.transfers.length
    && left.transfers.every((transfer, index) => {
      const other = right.transfers[index];
      return transfer.transferOrder === other.transferOrder
        && transfer.fromMemberId === other.fromMemberId
        && transfer.toMemberId === other.toMemberId
        && transfer.finalRoundedAmount === other.finalRoundedAmount
        && transfer.status === other.status;
    });
}
