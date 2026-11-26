package com.splitmate.settlement.dto;

import java.time.Instant;
import java.util.UUID;

import com.splitmate.settlement.domain.SettlementTransferStatus;

public record SettlementTransferResponse(
        UUID id,
        int transferOrder,
        UUID fromMemberId,
        UUID toMemberId,
        long exactAmount,
        long initiallyRoundedAmount,
        long finalRoundedAmount,
        long roundingAdjustment,
        SettlementTransferStatus status,
        Instant completedAt,
        SettlementTransferExplanationResponse explanation
) {
}
