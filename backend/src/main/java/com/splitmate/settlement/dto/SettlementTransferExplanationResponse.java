package com.splitmate.settlement.dto;

import com.splitmate.settlement.domain.SettlementExplanationKind;

public record SettlementTransferExplanationResponse(
        SettlementExplanationKind kind,
        long fromExactBalanceBefore,
        long toExactBalanceBefore
) {
}
