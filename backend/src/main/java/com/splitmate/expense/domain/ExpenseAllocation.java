package com.splitmate.expense.domain;

import java.util.Objects;
import java.util.UUID;

public record ExpenseAllocation(
        UUID memberId,
        long allocatedShare,
        int allocationOrder
) {

    public ExpenseAllocation {
        Objects.requireNonNull(memberId);
        if (allocatedShare < 0) {
            throw new IllegalArgumentException("allocatedShare must not be negative.");
        }
        if (allocationOrder < 1) {
            throw new IllegalArgumentException("allocationOrder must be at least 1.");
        }
    }
}
