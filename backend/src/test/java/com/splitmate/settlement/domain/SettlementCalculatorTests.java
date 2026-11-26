package com.splitmate.settlement.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import com.splitmate.settlement.domain.SettlementCalculation.Expense;
import com.splitmate.settlement.domain.SettlementCalculation.Member;
import com.splitmate.settlement.domain.SettlementCalculation.Participant;

class SettlementCalculatorTests {

    private final SettlementCalculator calculator = new SettlementCalculator();

    @Test
    void returnsNoBalancesOrTransfersForEmptyProject() {
        SettlementCalculation result =
                calculator.calculate(List.of(), SettlementStrategy.FEWER_TRANSFERS, 1);

        assertThat(result.balances()).isEmpty();
        assertThat(result.transfers()).isEmpty();
    }

    @Test
    void returnsZeroBalanceAndNoTransferForSinglePayerParticipant() {
        Member member = member(1, 1);

        SettlementCalculation result = calculator.calculate(
                List.of(expense(1, member, 100, participant(member, 100, 1))),
                SettlementStrategy.FEWER_TRANSFERS,
                10
        );

        assertThat(result.balances())
                .extracting(
                        balance -> balance.member().id(),
                        SettlementCalculation.Balance::paidAmount,
                        SettlementCalculation.Balance::burdenAmount,
                        SettlementCalculation.Balance::exactBalance
                )
                .containsExactly(tuple(member.id(), 100L, 100L, 0L));
        assertThat(result.transfers()).isEmpty();
    }

    @Test
    void usesPersistedUnevenAllocationAndSupportsPayerParticipant() {
        Member payer = member(1, 1);
        Member second = member(2, 2);
        Member third = member(3, 3);

        SettlementCalculation result = calculator.calculate(
                List.of(expense(
                        1,
                        payer,
                        1_000,
                        participant(payer, 334, 1),
                        participant(second, 333, 2),
                        participant(third, 333, 3)
                )),
                SettlementStrategy.FEWER_TRANSFERS,
                1
        );

        assertThat(result.balances())
                .extracting(
                        balance -> balance.member().id(),
                        SettlementCalculation.Balance::paidAmount,
                        SettlementCalculation.Balance::burdenAmount,
                        SettlementCalculation.Balance::exactBalance
                )
                .containsExactly(
                        tuple(payer.id(), 1_000L, 334L, 666L),
                        tuple(second.id(), 0L, 333L, -333L),
                        tuple(third.id(), 0L, 333L, -333L)
                );
        assertThat(result.transfers())
                .extracting(
                        SettlementCalculation.Transfer::fromMemberId,
                        SettlementCalculation.Transfer::toMemberId,
                        SettlementCalculation.Transfer::exactAmount
                )
                .containsExactly(
                        tuple(second.id(), payer.id(), 333L),
                        tuple(third.id(), payer.id(), 333L)
                );
    }

    @Test
    void bothStrategiesShareBalancesButUseTheirApprovedOrdering() {
        Member debtorFirst = member(1, 1);
        Member creditorSmall = member(2, 2);
        Member creditorLarge = member(3, 3);
        Member debtorSecond = member(4, 4);
        List<Expense> expenses = List.of(
                expense(
                        1,
                        creditorLarge,
                        8,
                        participant(debtorFirst, 6, 1),
                        participant(debtorSecond, 2, 2)
                ),
                expense(2, creditorSmall, 2, participant(debtorSecond, 2, 1))
        );

        SettlementCalculation fewer =
                calculator.calculate(expenses, SettlementStrategy.FEWER_TRANSFERS, 1);
        SettlementCalculation understandable =
                calculator.calculate(expenses, SettlementStrategy.UNDERSTANDABLE, 1);

        assertThat(understandable.balances()).isEqualTo(fewer.balances());
        assertThat(fewer.transfers())
                .extracting(
                        SettlementCalculation.Transfer::fromMemberId,
                        SettlementCalculation.Transfer::toMemberId,
                        SettlementCalculation.Transfer::exactAmount
                )
                .containsExactly(
                        tuple(debtorFirst.id(), creditorLarge.id(), 6L),
                        tuple(debtorSecond.id(), creditorSmall.id(), 2L),
                        tuple(debtorSecond.id(), creditorLarge.id(), 2L)
                );
        assertThat(understandable.transfers())
                .extracting(
                        SettlementCalculation.Transfer::fromMemberId,
                        SettlementCalculation.Transfer::toMemberId,
                        SettlementCalculation.Transfer::exactAmount
                )
                .containsExactly(
                        tuple(debtorFirst.id(), creditorSmall.id(), 2L),
                        tuple(debtorFirst.id(), creditorLarge.id(), 4L),
                        tuple(debtorSecond.id(), creditorLarge.id(), 4L)
                );
    }

    @ParameterizedTest
    @CsvSource({
            "1, 1234, 1234, 0",
            "10, 1234, 1230, 4",
            "100, 1234, 1200, 34",
            "1000, 1600, 2000, -400",
            "1000, 1500, 2000, -500",
            "1000, 1499, 1000, 499"
    })
    void appliesHalfUpAndExplicitlyReconciles(
            int unit,
            long exact,
            long initiallyRounded,
            long adjustment
    ) {
        Member payer = member(1, 1);
        Member participant = member(2, 2);

        var result = calculator.calculate(
                List.of(expense(1, payer, exact, participant(participant, exact, 1))),
                SettlementStrategy.FEWER_TRANSFERS,
                unit
        );

        assertThat(result.transfers()).singleElement().satisfies(transfer -> {
            assertThat(transfer.exactAmount()).isEqualTo(exact);
            assertThat(transfer.initiallyRoundedAmount()).isEqualTo(initiallyRounded);
            assertThat(transfer.roundingAdjustment()).isEqualTo(adjustment);
            assertThat(transfer.finalRoundedAmount()).isEqualTo(exact);
        });
        assertThat(result.balances())
                .allSatisfy(balance -> assertThat(balance.roundingDifference()).isZero());
    }

    @Test
    void recordsTruthfulRemainingBalanceExplanationAndConservesTransfers() {
        Member payer = member(1, 2);
        Member first = member(2, 1);
        Member second = member(3, 3);

        var result = calculator.calculate(
                List.of(expense(
                        1,
                        payer,
                        10,
                        participant(first, 6, 1),
                        participant(second, 4, 2)
                )),
                SettlementStrategy.UNDERSTANDABLE,
                10
        );

        assertThat(result.transfers())
                .extracting(
                        SettlementCalculation.Transfer::transferOrder,
                        SettlementCalculation.Transfer::fromExactBalanceBefore,
                        SettlementCalculation.Transfer::toExactBalanceBefore
                )
                .containsExactly(tuple(1, -6L, 10L), tuple(2, -4L, 4L));
        assertThat(result.transfers()).allSatisfy(transfer -> {
            assertThat(transfer.exactAmount()).isPositive();
            assertThat(transfer.finalRoundedAmount()).isEqualTo(transfer.exactAmount());
        });
        assertThat(result.balances())
                .allSatisfy(balance -> assertThat(balance.exactBalance())
                        .isEqualTo(balance.roundedTransferNet()));
    }

    @Test
    void includesInactiveHistoricalMembersBecauseActivityIsNotACalculationInput() {
        Member historicalMember = member(1, 1);
        Member payer = member(2, 2);

        var result = calculator.calculate(
                List.of(expense(
                        1,
                        payer,
                        100,
                        participant(historicalMember, 100, 1)
                )),
                SettlementStrategy.FEWER_TRANSFERS,
                1
        );

        assertThat(result.balances())
                .extracting(balance -> balance.member().id())
                .containsExactly(historicalMember.id(), payer.id());
    }

    @Test
    void rejectsMalformedAllocationsAndCheckedOverflow() {
        Member payer = member(1, 1);
        Member participant = member(2, 2);

        assertThatThrownBy(() -> calculator.calculate(
                List.of(expense(1, payer, 100, participant(participant, 99, 1))),
                SettlementStrategy.FEWER_TRANSFERS,
                1
        )).isInstanceOf(IllegalArgumentException.class);

        assertThatThrownBy(() -> calculator.calculate(
                List.of(
                        expense(1, payer, Long.MAX_VALUE,
                                participant(participant, Long.MAX_VALUE, 1)),
                        expense(2, payer, 1, participant(participant, 1, 1))
                ),
                SettlementStrategy.FEWER_TRANSFERS,
                1
        )).isInstanceOf(ArithmeticException.class);
    }

    private Expense expense(
            long id,
            Member payer,
            long amount,
            Participant... participants
    ) {
        return new Expense(uuid(id), payer, amount, List.of(participants));
    }

    private Participant participant(Member member, long amount, int order) {
        return new Participant(member, amount, order);
    }

    private Member member(long id, int displayOrder) {
        return new Member(uuid(id), displayOrder);
    }

    private UUID uuid(long id) {
        return new UUID(0, id);
    }
}
