package com.splitmate.expense.domain;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

public final class EqualSplitAllocator {

    private static final Comparator<UUID> UUID_ORDER = (left, right) -> {
        int mostSignificantComparison = Long.compareUnsigned(
                left.getMostSignificantBits(),
                right.getMostSignificantBits()
        );
        if (mostSignificantComparison != 0) {
            return mostSignificantComparison;
        }
        return Long.compareUnsigned(left.getLeastSignificantBits(), right.getLeastSignificantBits());
    };

    private static final Comparator<AllocationParticipant> PARTICIPANT_ORDER =
            Comparator.comparingInt(AllocationParticipant::displayOrder)
                    .thenComparing(AllocationParticipant::memberId, UUID_ORDER);

    public List<ExpenseAllocation> allocate(
            long amount,
            List<AllocationParticipant> participants
    ) {
        if (amount <= 0) {
            throw new IllegalArgumentException("amount must be positive.");
        }
        Objects.requireNonNull(participants);
        if (participants.isEmpty()) {
            throw new IllegalArgumentException("participants must not be empty.");
        }

        List<AllocationParticipant> orderedParticipants = new ArrayList<>(participants.size());
        Set<UUID> memberIds = new HashSet<>();
        for (AllocationParticipant participant : participants) {
            AllocationParticipant requiredParticipant = Objects.requireNonNull(participant);
            if (!memberIds.add(requiredParticipant.memberId())) {
                throw new IllegalArgumentException("participants must contain unique member IDs.");
            }
            orderedParticipants.add(requiredParticipant);
        }
        orderedParticipants.sort(PARTICIPANT_ORDER);

        long baseShare = amount / orderedParticipants.size();
        long remainder = amount % orderedParticipants.size();
        List<ExpenseAllocation> allocations = new ArrayList<>(orderedParticipants.size());
        for (int index = 0; index < orderedParticipants.size(); index++) {
            AllocationParticipant participant = orderedParticipants.get(index);
            long allocatedShare = baseShare + (index < remainder ? 1 : 0);
            allocations.add(new ExpenseAllocation(
                    participant.memberId(),
                    allocatedShare,
                    index + 1
            ));
        }
        return List.copyOf(allocations);
    }
}
