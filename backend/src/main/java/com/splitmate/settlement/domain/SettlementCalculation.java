package com.splitmate.settlement.domain;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

public record SettlementCalculation(
        List<Balance> balances,
        List<Transfer> transfers
) {
    public SettlementCalculation {
        balances = List.copyOf(balances);
        transfers = List.copyOf(transfers);
    }

    public record Member(UUID id, int displayOrder) {
        public Member {
            Objects.requireNonNull(id);
            if (displayOrder < 1) {
                throw new IllegalArgumentException("displayOrder must be at least 1.");
            }
        }
    }

    public record Participant(Member member, long allocatedShare, int allocationOrder) {
        public Participant {
            Objects.requireNonNull(member);
            if (allocatedShare < 0) {
                throw new IllegalArgumentException("allocatedShare must not be negative.");
            }
            if (allocationOrder < 1) {
                throw new IllegalArgumentException("allocationOrder must be at least 1.");
            }
        }
    }

    public record Expense(
            UUID id,
            Member payer,
            long amount,
            List<Participant> participants
    ) {
        public Expense {
            Objects.requireNonNull(id);
            Objects.requireNonNull(payer);
            if (amount <= 0) {
                throw new IllegalArgumentException("amount must be positive.");
            }
            participants = List.copyOf(participants);
            if (participants.isEmpty()) {
                throw new IllegalArgumentException("participants must not be empty.");
            }
        }
    }

    public record Balance(
            Member member,
            long paidAmount,
            long burdenAmount,
            long exactBalance,
            long roundedTransferNet,
            long roundingDifference
    ) {
    }

    public record Transfer(
            int transferOrder,
            UUID fromMemberId,
            UUID toMemberId,
            long exactAmount,
            long initiallyRoundedAmount,
            long finalRoundedAmount,
            long roundingAdjustment,
            long fromExactBalanceBefore,
            long toExactBalanceBefore
    ) {
    }
}
