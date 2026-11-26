package com.splitmate.analytics.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.splitmate.analytics.dto.AnalyticsCategoryResponse;
import com.splitmate.analytics.dto.AnalyticsComparisonResponse;
import com.splitmate.analytics.dto.AnalyticsMemberResponse;
import com.splitmate.analytics.dto.AnalyticsOverviewResponse;
import com.splitmate.analytics.dto.AnalyticsOverviewResponse.EndMonthComparison;
import com.splitmate.analytics.dto.AnalyticsOverviewResponse.ExcludedProject;
import com.splitmate.analytics.dto.AnalyticsOverviewResponse.Period;
import com.splitmate.analytics.dto.AnalyticsOverviewResponse.ProjectSpending;
import com.splitmate.analytics.dto.AnalyticsMonthResponse;
import com.splitmate.analytics.dto.AnalyticsTrendResponse;
import com.splitmate.analytics.dto.LocalHomeOverviewResponse;
import com.splitmate.analytics.dto.LocalHomeOverviewResponse.Comparisons;
import com.splitmate.analytics.dto.LocalHomeOverviewResponse.Contribution;
import com.splitmate.analytics.dto.ProjectMonthlyAnalyticsResponse;
import com.splitmate.expense.domain.ExpenseCategory;
import com.splitmate.project.domain.ProjectCurrency;
import com.splitmate.project.domain.ProjectType;
import com.splitmate.settlement.domain.SettlementCalculator;
import com.splitmate.settlement.domain.SettlementScopeType;

final class AnalyticsCalculator {

    private static final long MAX_SAFE_INTEGER = 9_007_199_254_740_991L;
    private static final YearMonth FIRST_MONTH = YearMonth.of(1, 1);
    private static final Comparator<Expense> EXPENSE_ORDER = Comparator.comparing(Expense::id, SettlementCalculator.UUID_ORDER);
    private static final Comparator<Member> MEMBER_ORDER = Comparator
            .comparingInt(Member::displayOrder)
            .thenComparing(Member::id, SettlementCalculator.UUID_ORDER);

    static YearMonth trendStart(YearMonth month, int trendMonths) {
        YearMonth start = month.minusMonths(trendMonths - 1L);
        return start.isBefore(FIRST_MONTH) ? FIRST_MONTH : start;
    }

    ProjectMonthlyAnalyticsResponse calculate(
            UUID projectId, String publicToken, YearMonth month, int trendMonths, List<Expense> expenses
    ) {
        try {
            return aggregate(projectId, publicToken, month, trendMonths, expenses);
        } catch (ArithmeticException exception) {
            throw new AnalyticsAmountOutOfRangeException();
        }
    }

    private ProjectMonthlyAnalyticsResponse aggregate(
            UUID projectId, String publicToken, YearMonth month, int trendMonths, List<Expense> expenses
    ) {
        Map<YearMonth, Totals> months = new HashMap<>();
        Map<ExpenseCategory, Totals> categories = new HashMap<>();
        Map<UUID, MemberAmounts> members = new HashMap<>();
        Set<UUID> participantIds = new HashSet<>();
        Set<UUID> expenseIds = new HashSet<>();
        for (Expense expense : expenses.stream().sorted(EXPENSE_ORDER).toList()) {
            List<Participant> participants = validateExpense(projectId, expense, expenseIds);
            YearMonth expenseMonth = YearMonth.from(expense.paidOn());
            months.computeIfAbsent(expenseMonth, ignored -> new Totals()).add(expense.amount());
            if (expenseMonth.equals(month)) {
                categories.computeIfAbsent(expense.category(), ignored -> new Totals()).add(expense.amount());
                MemberAmounts payer = findMember(members, expense.payer());
                payer.paidAmount = Math.addExact(payer.paidAmount, expense.amount());
                for (Participant participant : participants) {
                    participantIds.add(participant.member().id());
                    MemberAmounts member = findMember(members, participant.member());
                    member.burdenAmount = Math.addExact(member.burdenAmount, participant.allocatedShare());
                }
            }
        }
        // Each read month is returned either in the trend or as the comparison baseline.
        months.values().forEach(totals -> {
            safe(totals.amount);
            safe(totals.count);
        });
        Totals current = months.getOrDefault(month, new Totals());
        long participantCount = safe(participantIds.size());
        Long average = participantCount == 0 ? null : average(current.amount, participantCount);
        List<AnalyticsMemberResponse> memberResponses = members.values().stream()
                .sorted(Comparator.comparing(amounts -> amounts.member, MEMBER_ORDER))
                .map(amounts -> new AnalyticsMemberResponse(
                        amounts.member.id(), amounts.member.name(), amounts.member.displayOrder(),
                        amounts.member.active(), safe(amounts.paidAmount), safe(amounts.burdenAmount),
                        safe(Math.subtractExact(amounts.paidAmount, amounts.burdenAmount))))
                .toList();
        long paidTotal = 0;
        long burdenTotal = 0;
        long balanceTotal = 0;
        for (AnalyticsMemberResponse member : memberResponses) {
            paidTotal = Math.addExact(paidTotal, member.paidAmount());
            burdenTotal = Math.addExact(burdenTotal, member.burdenAmount());
            balanceTotal = Math.addExact(balanceTotal, member.exactBalance());
        }
        require(paidTotal == current.amount && burdenTotal == current.amount && balanceTotal == 0);
        YearMonth start = trendStart(month, trendMonths);
        return new ProjectMonthlyAnalyticsResponse(publicToken, SettlementScopeType.YEAR_MONTH,
                month.toString(), ProjectCurrency.JPY, current.amount, current.count,
                "DISTINCT_EXPENSE_PARTICIPANTS", participantCount, average,
                comparison(month, current.amount, months), categoryResponses(categories), memberResponses,
                new AnalyticsTrendResponse(start.toString(), month.toString(), monthlyTrend(start, month, months)));
    }

    AnalyticsOverviewResponse calculateOverview(
            List<SelectedProject> projects, YearMonth start, YearMonth end, List<Expense> expenses
    ) {
        try {
            return aggregateOverview(projects, start, end, expenses);
        } catch (ArithmeticException exception) {
            throw new AnalyticsAmountOutOfRangeException();
        }
    }

    private AnalyticsOverviewResponse aggregateOverview(
            List<SelectedProject> projects, YearMonth start, YearMonth end, List<Expense> expenses
    ) {
        List<SelectedProject> included = projects.stream().filter(project -> project.type() == ProjectType.CONTINUOUS).toList();
        List<ExcludedProject> excluded = projects.stream().filter(project -> project.type() == ProjectType.EVENT)
                .map(project -> new ExcludedProject(project.publicToken(), project.type(), "EVENT_EXCLUDED")).toList();
        Map<UUID, Totals> projectTotals = new HashMap<>();
        included.forEach(project -> projectTotals.put(project.id(), new Totals()));
        Map<YearMonth, Totals> months = new HashMap<>();
        Map<ExpenseCategory, Totals> categories = new HashMap<>();
        Set<UUID> expenseIds = new HashSet<>();
        Totals period = new Totals();
        YearMonth previous = end.minusMonths(1);
        for (Expense expense : expenses.stream().sorted(EXPENSE_ORDER).toList()) {
            Totals project = projectTotals.get(expense.projectId());
            require(project != null);
            validateExpense(expense.projectId(), expense, expenseIds);

            YearMonth month = YearMonth.from(expense.paidOn());
            require(!month.isAfter(end) && (!month.isBefore(start) || month.equals(previous)));
            months.computeIfAbsent(month, ignored -> new Totals()).add(expense.amount());
            if (!month.isBefore(start)) {
                period.add(expense.amount());
                project.add(expense.amount());
                categories.computeIfAbsent(expense.category(), ignored -> new Totals()).add(expense.amount());
            }
        }
        long total = safe(period.amount);
        long count = safe(period.count);
        long endTotal = months.getOrDefault(end, new Totals()).amount;
        AnalyticsComparisonResponse comparison = comparison(end, endTotal, months);
        return new AnalyticsOverviewResponse(ProjectType.CONTINUOUS, "EXCLUDED", ProjectCurrency.JPY,
                new Period(start.toString(), end.toString()),
                included.stream().map(SelectedProject::publicToken).toList(), excluded, total, count,
                new EndMonthComparison(end.toString(), endTotal, comparison.previousMonth(),
                        comparison.previousTotalExpense(), comparison.difference(),
                        comparison.percentageChange(), comparison.comparisonState()),
                categoryResponses(categories), monthlyTrend(start, end, months),
                included.stream().map(project -> {
                    Totals totals = projectTotals.get(project.id());
                    return new ProjectSpending(project.publicToken(), project.name(), totals.amount, totals.count);
                }).toList());
    }

    private List<Participant> validateExpense(UUID projectId, Expense expense, Set<UUID> expenseIds) {
        require(projectId.equals(expense.projectId()) && expense.amount() > 0
                && expenseIds.add(expense.id()) && !expense.participants().isEmpty());
        validateMember(projectId, expense.payer());
        long allocatedTotal = 0;
        Set<UUID> allocatedMembers = new HashSet<>();
        Set<Integer> allocationOrders = new HashSet<>();
        List<Participant> participants = expense.participants().stream()
                .sorted(Comparator.comparingInt(Participant::allocationOrder)).toList();
        for (Participant participant : participants) {
            validateMember(projectId, participant.member());
            require(participant.allocatedShare() >= 0 && participant.allocationOrder() > 0
                    && allocatedMembers.add(participant.member().id())
                    && allocationOrders.add(participant.allocationOrder()));
            allocatedTotal = Math.addExact(allocatedTotal, participant.allocatedShare());
        }
        require(allocatedTotal == expense.amount());
        return participants;
    }

    LocalHomeOverviewResponse calculateLocalHome(YearMonth month, YearMonth previous, long projectCount,
                                                 Map<UUID, ProjectType> types, List<Expense> expenses) {
        try {
            HomeTotals currentTotals = new HomeTotals();
            HomeTotals previousTotals = new HomeTotals();
            Set<UUID> expenseIds = new HashSet<>();
            for (Expense expense : expenses.stream().sorted(EXPENSE_ORDER).toList()) {
                ProjectType type = types.get(expense.projectId());
                YearMonth paidMonth = YearMonth.from(expense.paidOn());
                require(type != null && (paidMonth.equals(month) || paidMonth.equals(previous)));
                validateExpense(expense.projectId(), expense, expenseIds);
                (paidMonth.equals(month) ? currentTotals : previousTotals).add(expense, type);
            }
            var selected = currentTotals.period();
            var baseline = previous == null ? null : previousTotals.period();
            return new LocalHomeOverviewResponse(month.toString(), safe(projectCount), selected, baseline,
                    new Comparisons(
                            comparison(previous, selected.totalExpense(), baseline == null ? 0 : baseline.totalExpense()),
                            comparison(previous, selected.continuousExpense(), baseline == null ? 0 : baseline.continuousExpense()),
                            comparison(previous, selected.eventExpense(), baseline == null ? 0 : baseline.eventExpense())));
        } catch (ArithmeticException exception) {
            throw new AnalyticsAmountOutOfRangeException();
        }
    }

    private List<AnalyticsCategoryResponse> categoryResponses(Map<ExpenseCategory, Totals> categories) {
        return categories.entrySet().stream()
                .sorted(Map.Entry.comparingByKey(Comparator.nullsLast(Comparator.naturalOrder())))
                .map(entry -> new AnalyticsCategoryResponse(entry.getKey(),
                        safe(entry.getValue().amount), safe(entry.getValue().count)))
                .toList();
    }

    private List<AnalyticsMonthResponse> monthlyTrend(YearMonth start, YearMonth end, Map<YearMonth, Totals> months) {
        List<AnalyticsMonthResponse> trend = new ArrayList<>();
        for (YearMonth item = start; !item.isAfter(end); item = item.plusMonths(1)) {
            Totals totals = months.getOrDefault(item, new Totals());
            trend.add(new AnalyticsMonthResponse(item.toString(), safe(totals.amount), safe(totals.count)));
        }
        return trend;
    }

    private AnalyticsComparisonResponse comparison(YearMonth month, long total, Map<YearMonth, Totals> months) {
        YearMonth previous = month.equals(FIRST_MONTH) ? null : month.minusMonths(1);
        return comparison(previous, total, previous == null ? 0 : months.getOrDefault(previous, new Totals()).amount);
    }

    private AnalyticsComparisonResponse comparison(YearMonth previous, long total, long previousTotal) {
        if (previous == null) {
            return new AnalyticsComparisonResponse(null, null, null, null, "NO_PREVIOUS_MONTH");
        }
        long baseline = safe(previousTotal);
        long difference = safe(Math.subtractExact(total, baseline));
        String state = baseline > 0 ? "COMPARABLE" : total > 0 ? "NO_PREVIOUS_DATA" : "BOTH_MONTHS_EMPTY";
        return new AnalyticsComparisonResponse(previous.toString(), baseline, difference, percentage(difference, baseline), state);
    }

    private static String percentage(long numerator, long denominator) {
        return denominator == 0 ? null : BigDecimal.valueOf(numerator)
                .multiply(BigDecimal.valueOf(100))
                .divide(BigDecimal.valueOf(denominator), 2, RoundingMode.HALF_UP).toPlainString();
    }

    private long average(long total, long count) {
        long quotient = total / count;
        long remainder = total % count;
        return safe(remainder >= count - remainder ? Math.addExact(quotient, 1) : quotient);
    }

    private MemberAmounts findMember(Map<UUID, MemberAmounts> members, Member member) {
        MemberAmounts amounts = members.computeIfAbsent(member.id(), ignored -> new MemberAmounts(member));
        require(amounts.member.equals(member));
        return amounts;
    }

    private void validateMember(UUID projectId, Member member) {
        require(projectId.equals(member.projectId()) && member.id() != null && member.displayOrder() > 0);
    }

    private static long safe(long value) {
        if (value < -MAX_SAFE_INTEGER || value > MAX_SAFE_INTEGER) {
            throw new AnalyticsAmountOutOfRangeException();
        }
        return value;
    }

    private void require(boolean condition) {
        if (!condition) {
            throw new AnalyticsCalculationException();
        }
    }

    record SelectedProject(UUID id, String publicToken, String name, ProjectType type) {
    }

    record Member(UUID id, UUID projectId, String name, int displayOrder, boolean active) {
    }

    record Participant(Member member, long allocatedShare, int allocationOrder) {
    }

    record Expense(UUID id, UUID projectId, Member payer, long amount, ExpenseCategory category,
                   LocalDate paidOn, List<Participant> participants) {
    }

    private static final class Totals {
        private long amount;
        private long count;

        void add(long value) {
            amount = Math.addExact(amount, value);
            count = Math.addExact(count, 1);
        }
    }

    private static final class HomeTotals {
        private long continuous;
        private long event;
        private final Set<UUID> eventProjects = new HashSet<>();

        void add(Expense expense, ProjectType type) {
            if (type == ProjectType.EVENT) {
                event = Math.addExact(event, expense.amount());
                eventProjects.add(expense.projectId());
            } else {
                continuous = Math.addExact(continuous, expense.amount());
            }
        }

        LocalHomeOverviewResponse.Period period() {
            long total = safe(Math.addExact(continuous, event));
            return new LocalHomeOverviewResponse.Period(total, continuous, event, eventProjects.size(),
                    new Contribution(percentage(continuous, total), percentage(event, total)));
        }
    }

    private static final class MemberAmounts {
        private final Member member;
        private long paidAmount;
        private long burdenAmount;

        MemberAmounts(Member member) {
            this.member = member;
        }
    }
}
