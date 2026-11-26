package com.splitmate.expense.dto;

import java.util.UUID;

public record ExpenseParticipantResponse(
        UUID memberId,
        long allocatedShare,
        int allocationOrder
) {
}
