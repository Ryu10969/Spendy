package com.splitmate.settlement.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.splitmate.settlement.domain.SettlementRunState;
import com.splitmate.settlement.domain.SettlementScopeType;
import com.splitmate.settlement.domain.SettlementStrategy;
import com.fasterxml.jackson.annotation.JsonInclude;

public record SettlementResponse(
        UUID runId,
        String sourceStateFingerprint,
        SettlementScopeType scopeType,
        @JsonInclude(JsonInclude.Include.NON_NULL) String scopeKey,
        SettlementStrategy strategy,
        SettlementRunState state,
        Instant generatedAt,
        List<SettlementBalanceResponse> balances,
        List<SettlementTransferResponse> transfers
) {
    public SettlementResponse {
        balances = List.copyOf(balances);
        transfers = List.copyOf(transfers);
    }

    public SettlementResponse(
            UUID runId,
            String sourceStateFingerprint,
            SettlementScopeType scopeType,
            SettlementStrategy strategy,
            SettlementRunState state,
            Instant generatedAt,
            List<SettlementBalanceResponse> balances,
            List<SettlementTransferResponse> transfers
    ) {
        this(runId, sourceStateFingerprint, scopeType, null, strategy, state,
                generatedAt, balances, transfers);
    }
}
