package com.splitmate.settlement.dto;

import java.util.UUID;

public record SettlementBalanceResponse(
        UUID memberId,
        long paidAmount,
        long burdenAmount,
        long exactBalance,
        long roundedTransferNet,
        long roundingDifference
) {
}
