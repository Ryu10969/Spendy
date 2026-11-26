package com.splitmate.expense.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

class EqualSplitAllocatorTests {

    private final EqualSplitAllocator allocator = new EqualSplitAllocator();

    @Test
    void dividesAmountEqually() {
        List<ExpenseAllocation> allocations = allocator.allocate(
                900,
                List.of(participant(3), participant(1), participant(2))
        );

        assertThat(allocations)
                .extracting(
                        ExpenseAllocation::allocatedShare,
                        ExpenseAllocation::allocationOrder
                )
                .containsExactly(tuple(300L, 1), tuple(300L, 2), tuple(300L, 3));
    }

    @Test
    void assignsRemainderYenToFirstOrderedParticipants() {
        List<ExpenseAllocation> allocations = allocator.allocate(
                1_000,
                List.of(participant(3), participant(1), participant(2))
        );

        assertThat(allocations)
                .extracting(ExpenseAllocation::allocatedShare)
                .containsExactly(334L, 333L, 333L);
    }

    @Test
    void ordersByDisplayOrderThenMemberUuid() {
        AllocationParticipant laterDisplayOrder = new AllocationParticipant(
                uuid("00000000-0000-0000-0000-000000000001"),
                2
        );
        AllocationParticipant higherUuid = new AllocationParticipant(
                uuid("ffffffff-ffff-ffff-ffff-ffffffffffff"),
                1
        );
        AllocationParticipant lowerUuid = new AllocationParticipant(
                uuid("80000000-0000-0000-0000-000000000000"),
                1
        );

        List<ExpenseAllocation> allocations = allocator.allocate(
                4,
                List.of(laterDisplayOrder, higherUuid, lowerUuid)
        );

        assertThat(allocations)
                .extracting(
                        ExpenseAllocation::memberId,
                        ExpenseAllocation::allocatedShare,
                        ExpenseAllocation::allocationOrder
                )
                .containsExactly(
                        tuple(lowerUuid.memberId(), 2L, 1),
                        tuple(higherUuid.memberId(), 1L, 2),
                        tuple(laterDisplayOrder.memberId(), 1L, 3)
                );
    }

    @Test
    void producesSameResultRegardlessOfInputOrder() {
        AllocationParticipant first = participant(1);
        AllocationParticipant second = participant(2);
        AllocationParticipant third = participant(3);

        assertThat(allocator.allocate(10, List.of(first, second, third)))
                .containsExactlyElementsOf(
                        allocator.allocate(10, List.of(third, first, second))
                );
    }

    @Test
    void allocatesEntireAmountToSingleParticipant() {
        assertThat(allocator.allocate(25, List.of(participant(1))))
                .singleElement()
                .satisfies(allocation -> {
                    assertThat(allocation.allocatedShare()).isEqualTo(25);
                    assertThat(allocation.allocationOrder()).isEqualTo(1);
                });
    }

    @Test
    void allowsAmountSmallerThanParticipantCount() {
        assertThat(allocator.allocate(
                2,
                List.of(participant(4), participant(2), participant(1), participant(3))
        )).extracting(ExpenseAllocation::allocatedShare)
                .containsExactly(1L, 1L, 0L, 0L);
    }

    @Test
    void conservesEveryYenForLargeAmount() {
        List<AllocationParticipant> participants = List.of(
                participant(7),
                participant(2),
                participant(9),
                participant(1),
                participant(5)
        );
        long allocatedTotal = allocator.allocate(Long.MAX_VALUE, participants).stream()
                .mapToLong(ExpenseAllocation::allocatedShare)
                .sum();

        assertThat(allocatedTotal).isEqualTo(Long.MAX_VALUE);
    }

    @Test
    void rejectsInvalidCalculationInputs() {
        AllocationParticipant participant = participant(1);

        assertThatThrownBy(() -> allocator.allocate(0, List.of(participant)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> allocator.allocate(-1, List.of(participant)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> allocator.allocate(1, List.of()))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> allocator.allocate(1, null))
                .isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> allocator.allocate(1, java.util.Arrays.asList(participant, null)))
                .isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> allocator.allocate(1, List.of(participant, participant)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new AllocationParticipant(UUID.randomUUID(), 0))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static AllocationParticipant participant(int displayOrder) {
        return new AllocationParticipant(
                new UUID(0, displayOrder),
                displayOrder
        );
    }

    private static UUID uuid(String value) {
        return UUID.fromString(value);
    }
}
