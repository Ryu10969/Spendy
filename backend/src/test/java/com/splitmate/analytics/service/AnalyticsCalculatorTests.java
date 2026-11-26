package com.splitmate.analytics.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import com.splitmate.analytics.dto.AnalyticsCategoryResponse;
import com.splitmate.analytics.dto.AnalyticsMemberResponse;
import com.splitmate.analytics.dto.ProjectMonthlyAnalyticsResponse;
import com.splitmate.analytics.service.AnalyticsCalculator.Expense;
import com.splitmate.analytics.service.AnalyticsCalculator.Member;
import com.splitmate.analytics.service.AnalyticsCalculator.Participant;
import com.splitmate.expense.domain.ExpenseCategory;

class AnalyticsCalculatorTests {

    private static final UUID PROJECT = new UUID(0, 100);
    private static final YearMonth MONTH = YearMonth.of(2026, 10);
    private static final long MAX = 9_007_199_254_740_991L;
    private final AnalyticsCalculator calculator = new AnalyticsCalculator();
    private final Member alice = new Member(new UUID(0, 1), PROJECT, "Alice", 1, true);
    private final Member bob = new Member(new UUID(0, 2), PROJECT, "Bob", 2, false);

    @Test
    void preservesPersistedSharesInactiveAndZeroShareParticipantsAndExactContractExample() {
        var response = calculate(List.of(
                expense(1, MONTH, 1000, ExpenseCategory.FOOD, alice,
                        new Participant(alice, 500, 1), new Participant(bob, 500, 2)),
                expense(2, MONTH, 1, null, alice,
                        new Participant(alice, 1, 1), new Participant(bob, 0, 2)),
                expense(3, MONTH.minusMonths(1), 800, ExpenseCategory.FOOD, alice,
                        new Participant(alice, 800, 1))));
        assertThat(response.totalExpense()).isEqualTo(1001);
        assertThat(response.expenseCount()).isEqualTo(2);
        assertThat(response.averageBasis()).isEqualTo("DISTINCT_EXPENSE_PARTICIPANTS");
        assertThat(response.participantCount()).isEqualTo(2);
        assertThat(response.averagePerPerson()).isEqualTo(501);
        assertThat(response.members()).extracting(AnalyticsMemberResponse::name,
                AnalyticsMemberResponse::active, AnalyticsMemberResponse::paidAmount,
                AnalyticsMemberResponse::burdenAmount, AnalyticsMemberResponse::exactBalance)
                .containsExactly(tuple("Alice", true, 1001L, 501L, 500L),
                        tuple("Bob", false, 0L, 500L, -500L));
        assertThat(response.categoryBreakdown()).containsExactly(
                new AnalyticsCategoryResponse(ExpenseCategory.FOOD, 1000, 1),
                new AnalyticsCategoryResponse(null, 1, 1));
        assertThat(response.previousMonthComparison().percentageChange()).isEqualTo("25.13");
    }

    @Test
    void excludesPayerOnlyFromAverageAndRetainsZeroBalances() {
        var response = calculate(List.of(expense(1, MONTH, 9, null, alice, new Participant(bob, 9, 1))));
        assertThat(response.participantCount()).isEqualTo(1);
        assertThat(response.averagePerPerson()).isEqualTo(9);
        assertThat(response.members()).extracting(AnalyticsMemberResponse::exactBalance).containsExactly(9L, -9L);
        var onePerson = calculate(List.of(expense(1, MONTH, 9, null, alice, new Participant(alice, 9, 1))));
        assertThat(onePerson.members()).singleElement().satisfies(member -> assertThat(member.exactBalance()).isZero());
    }

    @ParameterizedTest
    @CsvSource({"0,0,BOTH_MONTHS_EMPTY,none", "1,0,NO_PREVIOUS_DATA,none",
            "0,1,COMPARABLE,-100.00", "4,3,COMPARABLE,33.33", "5,6,COMPARABLE,-16.67",
            "799,800,COMPARABLE,-0.13", "999999999,1000000000,COMPARABLE,0.00",
            "9007199254740991,1,COMPARABLE,900719925474099000.00"})
    void comparesImmediatePreviousMonthWithExactRounding(long current, long previous, String state, String percentage) {
        List<Expense> expenses = new ArrayList<>();
        if (current > 0) expenses.add(expense(1, MONTH, current, null, alice, new Participant(alice, current, 1)));
        if (previous > 0) expenses.add(expense(2, MONTH.minusMonths(1), previous, null, alice,
                new Participant(alice, previous, 1)));
        var response = calculate(expenses);
        var comparison = response.previousMonthComparison();
        assertThat(comparison.previousMonth()).isEqualTo("2026-09");
        assertThat(comparison.previousTotalExpense()).isEqualTo(previous);
        assertThat(comparison.difference()).isEqualTo(current - previous);
        assertThat(comparison.comparisonState()).isEqualTo(state);
        assertThat(comparison.percentageChange()).isEqualTo(percentage.equals("none") ? null : percentage);
    }

    @Test
    void fillsEmptyTrendAcrossYearBoundaryAndHandlesCanonicalEndpoints() {
        var empty = calculator.calculate(PROJECT, "token", YearMonth.of(2026, 2), 6, List.of());
        assertThat(empty.monthlyTrend().items()).extracting(item -> item.month())
                .containsExactly("2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02");
        assertThat(empty.monthlyTrend().items()).allSatisfy(item -> {
            assertThat(item.totalExpense()).isZero();
            assertThat(item.expenseCount()).isZero();
        });
        assertThat(empty.members()).isEmpty();
        assertThat(empty.categoryBreakdown()).isEmpty();
        assertThat(empty.averagePerPerson()).isNull();
        assertThat(empty.participantCount()).isZero();
        var first = calculator.calculate(PROJECT, "token", YearMonth.of(1, 1), 24, List.of());
        assertThat(first.monthlyTrend().items()).hasSize(1);
        assertThat(first.previousMonthComparison().comparisonState()).isEqualTo("NO_PREVIOUS_MONTH");
        assertThat(first.previousMonthComparison().previousMonth()).isNull();
        assertThat(first.previousMonthComparison().previousTotalExpense()).isNull();
        assertThat(first.previousMonthComparison().difference()).isNull();
        assertThat(first.previousMonthComparison().percentageChange()).isNull();
        assertThat(calculator.calculate(PROJECT, "token", YearMonth.of(9999, 12), 24, List.of())
                .monthlyTrend().items()).hasSize(24);
    }

    @Test
    void categoryOrderingNullVersusOtherAndUnsignedMemberOrderingAreDeterministic() {
        Member first = new Member(new UUID(0, Long.MAX_VALUE), PROJECT, "First", 1, true);
        Member second = new Member(new UUID(0, Long.MIN_VALUE), PROJECT, "Second", 1, true);
        List<Expense> expenses = new ArrayList<>();
        for (ExpenseCategory category : ExpenseCategory.values()) {
            expenses.add(expense(category.ordinal() + 1, MONTH, 1, category, first,
                    new Participant(first, 1, 2), new Participant(second, 0, 1)));
        }
        expenses.add(expense(10, MONTH, 1, null, first, new Participant(first, 1, 1)));
        var response = calculate(expenses);
        Collections.reverse(expenses);
        assertThat(calculate(expenses)).isEqualTo(response);
        assertThat(response.categoryBreakdown()).extracting(AnalyticsCategoryResponse::category)
                .containsExactly(ExpenseCategory.FOOD, ExpenseCategory.UTILITIES,
                        ExpenseCategory.TRANSPORTATION, ExpenseCategory.ACCOMMODATION,
                        ExpenseCategory.DAILY_NECESSITIES, ExpenseCategory.ENTERTAINMENT, ExpenseCategory.OTHER, null);
        assertThat(response.members()).extracting(AnalyticsMemberResponse::name).containsExactly("First", "Second");
        assertThat(response.categoryBreakdown().stream().mapToLong(AnalyticsCategoryResponse::totalExpense).sum())
                .isEqualTo(response.totalExpense());
    }

    @Test
    void rejectsMalformedOwnershipParticipantsAndAllocations() {
        Member foreign = new Member(new UUID(0, 4), new UUID(0, 999), "Foreign", 1, true);
        List<Expense> invalid = List.of(
                expense(1, MONTH, 1, null, foreign, new Participant(alice, 1, 1)),
                expense(1, MONTH, 1, null, alice, new Participant(foreign, 1, 1)),
                expense(1, MONTH, 1, null, alice),
                expense(1, MONTH, 0, null, alice, new Participant(alice, 0, 1)),
                expense(1, MONTH, 2, null, alice, new Participant(alice, 1, 1)),
                expense(1, MONTH, 1, null, alice, new Participant(alice, -1, 1)),
                expense(1, MONTH, 1, null, alice, new Participant(alice, 1, 0)),
                expense(1, MONTH, 2, null, alice, new Participant(alice, 1, 1), new Participant(alice, 1, 2)),
                expense(1, MONTH, 2, null, alice, new Participant(alice, 1, 1), new Participant(bob, 1, 1)),
                new Expense(new UUID(0, 1), new UUID(0, 999), alice, 1, null, MONTH.atDay(1),
                        List.of(new Participant(alice, 1, 1))));
        invalid.forEach(expense -> assertThatThrownBy(() -> calculate(List.of(expense)))
                .isInstanceOf(AnalyticsCalculationException.class));
    }

    @Test
    void acceptsSafeBoundaryButFailsWholeResponseForUnsafeCurrentPreviousTrendAndLongOverflow() {
        var safe = expense(1, MONTH, MAX, null, alice, new Participant(alice, MAX, 1));
        assertThat(calculate(List.of(safe)).totalExpense()).isEqualTo(MAX);
        assertThatThrownBy(() -> calculate(List.of(safe,
                expense(2, MONTH, 1, null, alice, new Participant(alice, 1, 1)))))
                .isInstanceOf(AnalyticsAmountOutOfRangeException.class);
        for (YearMonth month : List.of(MONTH, MONTH.minusMonths(1), MONTH.minusMonths(5))) {
            assertThatThrownBy(() -> calculate(List.of(expense(1, month, MAX + 1, null, alice,
                    new Participant(alice, MAX + 1, 1)))))
                    .isInstanceOf(AnalyticsAmountOutOfRangeException.class);
        }
        assertThatThrownBy(() -> calculate(List.of(
                expense(1, MONTH, Long.MAX_VALUE, null, alice, new Participant(alice, Long.MAX_VALUE, 1)),
                expense(2, MONTH, 1, null, alice, new Participant(alice, 1, 1)))))
                .isInstanceOf(AnalyticsAmountOutOfRangeException.class);
        assertThatThrownBy(() -> calculate(List.of(expense(1, MONTH, Long.MAX_VALUE, null, alice,
                new Participant(alice, Long.MAX_VALUE, 1), new Participant(bob, 1, 2)))))
                .isInstanceOf(AnalyticsAmountOutOfRangeException.class);
    }

    private ProjectMonthlyAnalyticsResponse calculate(List<Expense> expenses) {
        return calculator.calculate(PROJECT, "A".repeat(43), MONTH, 6, expenses);
    }

    private Expense expense(long id, YearMonth month, long amount, ExpenseCategory category,
                            Member payer, Participant... participants) {
        return new Expense(new UUID(0, id), PROJECT, payer, amount, category, month.atDay(1), List.of(participants));
    }
}
