package com.splitmate.expense.domain;

import java.util.Objects;
import java.util.UUID;

public record AllocationParticipant(UUID memberId, int displayOrder) {

    public AllocationParticipant {
        Objects.requireNonNull(memberId);
        if (displayOrder < 1) {
            throw new IllegalArgumentException("displayOrder must be at least 1.");
        }
    }
}
