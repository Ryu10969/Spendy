package com.splitmate.expense.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.splitmate.expense.domain.ExpenseCategory;

public record ExpenseResponse(
        UUID id,
        UUID payerMemberId,
        long amount,
        String content,
        ExpenseCategory category,
        String note,
        LocalDate paidOn,
        long version,
        List<ExpenseParticipantResponse> participants,
        Instant createdAt,
        Instant updatedAt
) {
}
