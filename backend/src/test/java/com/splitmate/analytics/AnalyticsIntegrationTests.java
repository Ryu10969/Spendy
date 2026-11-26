package com.splitmate.analytics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;

import org.hibernate.SessionFactory;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;

import com.splitmate.analytics.controller.AnalyticsController;
import com.splitmate.analytics.dto.AnalyticsMemberResponse;
import com.splitmate.analytics.service.AnalyticsAmountOutOfRangeException;
import com.splitmate.analytics.service.AnalyticsCalculationException;
import com.splitmate.analytics.service.AnalyticsScopeUnsupportedException;
import com.splitmate.analytics.service.AnalyticsService;
import com.splitmate.common.error.GlobalExceptionHandler;
import com.splitmate.expense.domain.Expense;
import com.splitmate.expense.domain.ExpenseCategory;
import com.splitmate.expense.domain.ExpenseParticipant;
import com.splitmate.expense.repository.ExpenseParticipantRepository;
import com.splitmate.expense.repository.ExpenseRepository;
import com.splitmate.project.domain.Project;
import com.splitmate.project.domain.ProjectMember;
import com.splitmate.project.domain.ProjectType;
import com.splitmate.project.repository.ProjectMemberRepository;
import com.splitmate.project.repository.ProjectRepository;
import com.splitmate.project.service.ProjectNotFoundException;
import com.splitmate.settlement.domain.SettlementStrategy;
import com.splitmate.settlement.service.SettlementService;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;

@SpringBootTest(properties = "spring.jpa.properties.hibernate.generate_statistics=true")
@ActiveProfiles("local")
@Transactional(isolation = Isolation.REPEATABLE_READ)
@EnabledIfEnvironmentVariable(named = "SPLITMATE_POSTGRES_INTEGRATION_TEST", matches = "true",
        disabledReason = "Requires the Docker PostgreSQL integration-test environment.")
class AnalyticsIntegrationTests {

    private static final YearMonth MONTH = YearMonth.of(2026, 10);
    @Autowired private AnalyticsService analyticsService;
    @Autowired private SettlementService settlementService;
    @Autowired private ProjectRepository projects;
    @Autowired private ProjectMemberRepository members;
    @Autowired private ExpenseRepository expenses;
    @Autowired private ExpenseParticipantRepository participants;
    @Autowired private EntityManager entityManager;
    @Autowired private EntityManagerFactory entityManagerFactory;
    @Autowired private JdbcTemplate jdbc;

    @Test
    void aggregatesPersistedHistoryAndDoesNotChangeBalancesUnderEitherSettlementStrategy() throws Exception {
        Project project = project(ProjectType.CONTINUOUS);
        ProjectMember alice = member(project, "Alice", 1);
        ProjectMember bob = member(project, "Bob", 2);
        expense(project, alice, 1000, ExpenseCategory.FOOD, MONTH.atDay(1), List.of(alice, bob), List.of(500L, 500L));
        expense(project, alice, 1, null, MONTH.atEndOfMonth(), List.of(alice, bob), List.of(1L, 0L));
        expense(project, alice, 800, ExpenseCategory.FOOD, MONTH.minusMonths(1).atDay(1), List.of(alice), List.of(800L));
        jdbc.update("UPDATE project_members SET active = false WHERE id = ?", bob.getId());
        entityManager.clear();
        var fewer = settlementService.getSettlement(project.getPublicToken(), SettlementStrategy.FEWER_TRANSFERS, MONTH);
        var understandable = settlementService.getSettlement(project.getPublicToken(), SettlementStrategy.UNDERSTANDABLE, MONTH);
        var runsBefore = jdbc.queryForList("SELECT * FROM settlement_runs WHERE project_id = ? ORDER BY id", project.getId());
        var balancesBefore = jdbc.queryForList("SELECT * FROM settlement_balances WHERE project_id = ? ORDER BY id", project.getId());
        var transfersBefore = jdbc.queryForList("SELECT * FROM settlement_transfers WHERE project_id = ? ORDER BY id", project.getId());
        var allocationsBefore = jdbc.queryForList("SELECT ep.* FROM expense_participants ep JOIN expenses e ON e.id = ep.expense_id WHERE e.project_id = ? ORDER BY ep.id", project.getId());

        var response = analyticsService.getAnalytics(project.getPublicToken(), MONTH, 3);
        assertThat(response.totalExpense()).isEqualTo(1001);
        assertThat(response.expenseCount()).isEqualTo(2);
        assertThat(response.averagePerPerson()).isEqualTo(501);
        assertThat(response.participantCount()).isEqualTo(2);
        assertThat(response.previousMonthComparison().percentageChange()).isEqualTo("25.13");
        var shortestTrend = analyticsService.getAnalytics(project.getPublicToken(), MONTH, 1);
        assertThat(shortestTrend.monthlyTrend().items()).hasSize(1);
        assertThat(shortestTrend.previousMonthComparison()).isEqualTo(response.previousMonthComparison());
        var validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        String json = MockMvcBuilders.standaloneSetup(new AnalyticsController(analyticsService))
                .setControllerAdvice(new GlobalExceptionHandler()).setValidator(validator).build()
                .perform(get("/api/projects/{token}/analytics", project.getPublicToken())
                        .queryParam("month", "2026-10").queryParam("trendMonths", "3"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalExpense").value(1001))
                .andExpect(jsonPath("$.averagePerPerson").value(501))
                .andExpect(jsonPath("$.previousMonthComparison.percentageChange").value("25.13"))
                .andExpect(jsonPath("$.members[1].exactBalance").value(-500))
                .andReturn().getResponse().getContentAsString();
        assertThat(json).contains("\"category\":null").doesNotContain("\"projectId\"");
        assertThat(response.members()).extracting(AnalyticsMemberResponse::active).containsExactly(true, false);
        for (var settlement : List.of(fewer, understandable)) {
            assertThat(response.members()).extracting(AnalyticsMemberResponse::exactBalance)
                    .containsExactlyElementsOf(settlement.balances().stream().map(balance -> balance.exactBalance()).toList());
            assertThat(response.members()).extracting(AnalyticsMemberResponse::paidAmount)
                    .containsExactlyElementsOf(settlement.balances().stream().map(balance -> balance.paidAmount()).toList());
            assertThat(response.members()).extracting(AnalyticsMemberResponse::burdenAmount)
                    .containsExactlyElementsOf(settlement.balances().stream().map(balance -> balance.burdenAmount()).toList());
        }
        member(project, "Unreferenced", 3);
        jdbc.update("UPDATE project_members SET name = 'Renamed' WHERE id = ?", alice.getId());
        entityManager.clear();
        var renamed = analyticsService.getAnalytics(project.getPublicToken(), MONTH, 3);
        assertThat(renamed.averagePerPerson()).isEqualTo(501);
        assertThat(renamed.members()).hasSize(2);
        assertThat(renamed.members().getFirst().name()).isEqualTo("Renamed");
        assertThat(jdbc.queryForList("SELECT * FROM settlement_runs WHERE project_id = ? ORDER BY id", project.getId())).isEqualTo(runsBefore);
        assertThat(jdbc.queryForList("SELECT * FROM settlement_balances WHERE project_id = ? ORDER BY id", project.getId())).isEqualTo(balancesBefore);
        assertThat(jdbc.queryForList("SELECT * FROM settlement_transfers WHERE project_id = ? ORDER BY id", project.getId())).isEqualTo(transfersBefore);
        assertThat(jdbc.queryForList("SELECT ep.* FROM expense_participants ep JOIN expenses e ON e.id = ep.expense_id WHERE e.project_id = ? ORDER BY ep.id", project.getId())).isEqualTo(allocationsBefore);
    }

    @Test
    void scopesByPaidOnIncludingLeapDayYearBoundariesAndCanonicalEndpoints() {
        Project project = project(ProjectType.CONTINUOUS);
        ProjectMember only = member(project, "Only", 1);
        for (LocalDate date : List.of(LocalDate.of(2024, 2, 29), LocalDate.of(2024, 3, 1),
                LocalDate.of(2025, 12, 31), LocalDate.of(2026, 1, 1),
                LocalDate.of(1, 1, 1), LocalDate.of(9999, 12, 31))) {
            expense(project, only, 1, null, date, List.of(only), List.of(1L));
        }
        for (YearMonth month : List.of(YearMonth.of(2024, 2), YearMonth.of(2024, 3),
                YearMonth.of(2025, 12), YearMonth.of(2026, 1), YearMonth.of(1, 1), YearMonth.of(9999, 12))) {
            var response = analyticsService.getAnalytics(project.getPublicToken(), month, 6);
            assertThat(response.totalExpense()).isEqualTo(1);
            assertThat(response.expenseCount()).isEqualTo(1);
            assertThat(response.monthlyTrend().items().getLast().totalExpense()).isEqualTo(1);
        }
        var empty = analyticsService.getAnalytics(project.getPublicToken(), YearMonth.of(2, 1), 24);
        assertThat(empty.totalExpense()).isZero();
        assertThat(empty.averagePerPerson()).isNull();
        assertThat(empty.members()).isEmpty();
        assertThat(empty.monthlyTrend().items()).hasSize(13);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM settlement_runs WHERE project_id = ?", Long.class, project.getId())).isZero();
    }

    @Test
    void validatesBeforeLookupAndScopeAndRejectsDeletedProjectsAndEvents() throws Exception {
        Project event = project(ProjectType.EVENT);
        Project deleted = project(ProjectType.CONTINUOUS);
        deleted.delete(Instant.now());
        projects.saveAndFlush(deleted);
        var validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        var mvc = MockMvcBuilders.standaloneSetup(new AnalyticsController(analyticsService))
                .setControllerAdvice(new GlobalExceptionHandler()).setValidator(validator).build();
        for (String token : List.of(event.getPublicToken(), deleted.getPublicToken(), "A".repeat(43))) {
            mvc.perform(get("/api/projects/{token}/analytics", token).queryParam("month", "bad"))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
            mvc.perform(get("/api/projects/{token}/analytics", token).queryParam("month", "2026-10", "2026-10"))
                    .andExpect(status().isBadRequest());
        }
        assertThatThrownBy(() -> analyticsService.getAnalytics(event.getPublicToken(), MONTH, 6))
                .isInstanceOf(AnalyticsScopeUnsupportedException.class);
        assertThatThrownBy(() -> analyticsService.getAnalytics(deleted.getPublicToken(), MONTH, 6))
                .isInstanceOf(ProjectNotFoundException.class);
        assertThatThrownBy(() -> analyticsService.getAnalytics("A".repeat(43), MONTH, 6))
                .isInstanceOf(ProjectNotFoundException.class);
        mvc.perform(get("/api/projects/{token}/analytics", event.getPublicToken()).queryParam("month", "2026-10"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ANALYTICS_SCOPE_UNSUPPORTED"));
    }

    @Test
    void detectsMalformedPersistedAllocationAndCrossProjectPayerAndParticipant() {
        Project project = project(ProjectType.CONTINUOUS);
        ProjectMember only = member(project, "Only", 1);
        ProjectMember foreign = member(project(ProjectType.CONTINUOUS), "Foreign", 1);
        Expense expense = expense(project, only, 10, null, MONTH.atDay(1), List.of(only), List.of(10L));
        jdbc.update("UPDATE expenses SET payer_member_id = ? WHERE id = ?", foreign.getId(), expense.getId());
        entityManager.clear();
        assertInvalid(project);
        jdbc.update("UPDATE expenses SET payer_member_id = ? WHERE id = ?", only.getId(), expense.getId());
        jdbc.update("UPDATE expense_participants SET member_id = ? WHERE expense_id = ?", foreign.getId(), expense.getId());
        entityManager.clear();
        assertInvalid(project);
        jdbc.update("UPDATE expense_participants SET member_id = ?, allocated_share = 9 WHERE expense_id = ?", only.getId(), expense.getId());
        entityManager.clear();
        assertInvalid(project);
        jdbc.update("DELETE FROM expense_participants WHERE expense_id = ?", expense.getId());
        entityManager.clear();
        assertInvalid(project);
    }

    @Test
    void supportsSafeIntegerBoundaryAndRejectsUnsafeAggregateWithoutCreatingRuns() {
        Project project = project(ProjectType.CONTINUOUS);
        ProjectMember only = member(project, "Only", 1);
        long max = 9_007_199_254_740_991L;
        expense(project, only, max, null, MONTH.atDay(1), List.of(only), List.of(max));
        assertThat(analyticsService.getAnalytics(project.getPublicToken(), MONTH, 6).totalExpense()).isEqualTo(max);
        expense(project, only, 1, null, MONTH.atDay(2), List.of(only), List.of(1L));
        assertThatThrownBy(() -> analyticsService.getAnalytics(project.getPublicToken(), MONTH, 6))
                .isInstanceOf(AnalyticsAmountOutOfRangeException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM settlement_runs WHERE project_id = ?", Long.class, project.getId())).isZero();
    }

    @Test
    void keepsThreeQueriesForDenseMonthAndLongerTrendWithoutParticipantJoinMultiplication() {
        Project project = project(ProjectType.CONTINUOUS);
        ProjectMember payer = member(project, "Payer", 1);
        ProjectMember participant = member(project, "Participant", 2);
        assertQueryCount(project, 6, 0);
        for (int index = 0; index < 500; index++) {
            expense(project, payer, 3, ExpenseCategory.OTHER, MONTH.atDay(1),
                    List.of(payer, participant), List.of(1L, 2L));
        }
        // Outside the maximum read interval: invalid allocations must not be loaded.
        expenses.saveAndFlush(new Expense(project, payer, 99, "Outside", null, null, LocalDate.of(2020, 1, 1)));
        assertQueryCount(project, 6, 1500);
        assertQueryCount(project, 24, 1500);
        Project second = project(ProjectType.CONTINUOUS);
        entityManager.clear();
        var statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.clear();
        var overview = analyticsService.getOverview(List.of(project.getPublicToken(), second.getPublicToken()),
                MONTH.minusMonths(23), MONTH, "CONTINUOUS");
        assertThat(overview.totalExpense()).isEqualTo(1500);
        assertThat(overview.expenseCount()).isEqualTo(500);
        assertThat(overview.monthlyTrend()).hasSize(24);
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(3);
        var plan = jdbc.queryForList("EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM expenses WHERE project_id = ? AND paid_on BETWEEN ? AND ?",
                String.class, project.getId(), MONTH.atDay(1), MONTH.atEndOfMonth());
        assertThat(plan).anyMatch(line -> line.contains("actual time="));
        var participantPlan = jdbc.queryForList("EXPLAIN (ANALYZE, BUFFERS) SELECT ep.* FROM expense_participants ep JOIN expenses e ON e.id = ep.expense_id WHERE e.project_id = ? AND e.paid_on BETWEEN ? AND ?",
                String.class, project.getId(), MONTH.atDay(1), MONTH.atEndOfMonth());
        System.out.println("Analytics dense-month Expense plan:\n" + String.join("\n", plan));
        System.out.println("Analytics dense-month participant plan:\n" + String.join("\n", participantPlan));
    }

    private void assertQueryCount(Project project, int trend, long total) {
        entityManager.flush();
        entityManager.clear();
        var statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.clear();
        var response = analyticsService.getAnalytics(project.getPublicToken(), MONTH, trend);
        assertThat(response.totalExpense()).isEqualTo(total);
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(3);
        if (total > 0) {
            assertThat(response.expenseCount()).isEqualTo(500);
            assertThat(response.participantCount()).isEqualTo(2);
            assertThat(response.averagePerPerson()).isEqualTo(750);
        }
    }

    @Test
    void overviewAggregatesSelectedProjectsInThreeQueriesAndExcludesEventLedgers() {
        Project first = project(ProjectType.CONTINUOUS);
        Project second = project(ProjectType.CONTINUOUS);
        Project empty = project(ProjectType.CONTINUOUS);
        Project event = project(ProjectType.EVENT);
        Project unrelated = project(ProjectType.CONTINUOUS);
        ProjectMember firstMember = member(first, "Alice", 1);
        ProjectMember anotherMember = member(first, "Bob", 2);
        ProjectMember secondMember = member(second, "Alice", 1);
        expense(first, firstMember, 200, ExpenseCategory.FOOD, MONTH.minusMonths(1).atEndOfMonth(),
                List.of(firstMember, anotherMember), List.of(100L, 100L));
        expense(first, firstMember, 100, null, MONTH.atDay(1), List.of(firstMember), List.of(100L));
        expense(second, secondMember, 500, ExpenseCategory.OTHER, MONTH.atEndOfMonth(), List.of(secondMember), List.of(500L));
        // Neither the Event nor the unrelated Project should be read or validated.
        for (Project ignored : List.of(event, unrelated)) {
            expenses.saveAndFlush(new Expense(ignored, member(ignored, "Ignored", 1), 99,
                    "Outside scope", null, null, MONTH.atDay(1)));
        }
        entityManager.clear();
        var statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.clear();

        List<String> tokens = List.of(second.getPublicToken(), empty.getPublicToken(), event.getPublicToken(), first.getPublicToken());
        var overview = analyticsService.getOverview(tokens, MONTH.minusMonths(2), MONTH, "CONTINUOUS");
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(3);
        assertThat(overview.includedProjectTokens()).containsExactlyElementsOf(tokens.stream()
                .filter(token -> !token.equals(event.getPublicToken())).sorted().toList());
        assertThat(overview.excludedProjects()).singleElement().satisfies(excluded -> {
            assertThat(excluded.publicToken()).isEqualTo(event.getPublicToken());
            assertThat(excluded.reason()).isEqualTo("EVENT_EXCLUDED");
        });
        assertThat(overview.totalExpense()).isEqualTo(800);
        assertThat(overview.expenseCount()).isEqualTo(3);
        assertThat(overview.monthlyTrend()).extracting(row -> row.totalExpense()).containsExactly(0L, 200L, 600L);
        assertThat(overview.monthlyTrend()).extracting(row -> row.expenseCount()).containsExactly(0L, 1L, 2L);
        assertThat(overview.categoryBreakdown()).extracting(row -> row.category())
                .containsExactly(ExpenseCategory.FOOD, ExpenseCategory.OTHER, null);
        assertThat(overview.categoryBreakdown()).extracting(row -> row.totalExpense()).containsExactly(200L, 500L, 100L);
        assertThat(overview.projectComparison()).anySatisfy(row -> {
            assertThat(row.publicToken()).isEqualTo(empty.getPublicToken());
            assertThat(row.totalExpense()).isZero();
            assertThat(row.expenseCount()).isZero();
        });
        var singleMonth = analyticsService.getOverview(tokens, MONTH, MONTH, "CONTINUOUS");
        assertThat(singleMonth.totalExpense()).isEqualTo(600);
        assertThat(singleMonth.endMonthComparison().previousTotalExpense()).isEqualTo(200);
        assertThat(singleMonth.endMonthComparison().percentageChange()).isEqualTo("200.00");
    }

    @Test
    void overviewReturnsAllEventEmptyAndRejectsMissingProjectsBeforeUnsupportedMode() {
        Project event = project(ProjectType.EVENT);
        Project deleted = project(ProjectType.CONTINUOUS);
        deleted.delete(Instant.now());
        projects.saveAndFlush(deleted);
        var empty = analyticsService.getOverview(List.of(event.getPublicToken()), MONTH.minusMonths(1), MONTH, "CONTINUOUS");
        assertThat(empty.totalExpense()).isZero();
        assertThat(empty.projectComparison()).isEmpty();
        assertThat(empty.monthlyTrend()).extracting(row -> row.expenseCount()).containsExactly(0L, 0L);
        assertThat(empty.endMonthComparison().comparisonState()).isEqualTo("BOTH_MONTHS_EMPTY");
        assertThat(empty.excludedProjects()).extracting(row -> row.publicToken()).containsExactly(event.getPublicToken());
        for (String token : List.of("A".repeat(43), deleted.getPublicToken())) {
            assertThatThrownBy(() -> analyticsService.getOverview(List.of(event.getPublicToken(), token), MONTH, MONTH, "ALL"))
                    .isInstanceOf(ProjectNotFoundException.class);
        }
        for (String mode : List.of("EVENT", "ALL")) {
            assertThatThrownBy(() -> analyticsService.getOverview(List.of(event.getPublicToken()), MONTH, MONTH, mode))
                    .isInstanceOf(AnalyticsScopeUnsupportedException.class);
        }
    }

    @Test
    void overviewRejectsInvalidAllocationsAndUnsafeTotalsAcrossProjectsOrMonths() {
        Project first = project(ProjectType.CONTINUOUS);
        Project second = project(ProjectType.CONTINUOUS);
        ProjectMember firstMember = member(first, "First", 1);
        ProjectMember secondMember = member(second, "Second", 1);
        List<String> tokens = List.of(first.getPublicToken(), second.getPublicToken());
        long max = 9_007_199_254_740_991L;
        expense(first, firstMember, max, ExpenseCategory.FOOD, MONTH.minusMonths(1).atDay(1),
                List.of(firstMember), List.of(max));
        Expense secondExpense = expense(second, secondMember, 1, null, MONTH.atDay(1), List.of(secondMember), List.of(1L));
        var singleMonth = analyticsService.getOverview(tokens, MONTH, MONTH, "CONTINUOUS");
        assertThat(singleMonth.endMonthComparison().previousTotalExpense()).isEqualTo(max);
        assertThatThrownBy(() -> analyticsService.getOverview(tokens, MONTH.minusMonths(1), MONTH, "CONTINUOUS"))
                .isInstanceOf(AnalyticsAmountOutOfRangeException.class);
        jdbc.update("UPDATE expense_participants SET member_id = ? WHERE expense_id = ?", firstMember.getId(), secondExpense.getId());
        entityManager.clear();
        assertThatThrownBy(() -> analyticsService.getOverview(tokens, MONTH, MONTH, "CONTINUOUS"))
                .isInstanceOf(AnalyticsCalculationException.class);
    }

    @Test
    void localHomeAggregatesFullPaidOnMonthsAndCountsDistinctArchivedEvents() {
        long initialCount = projects.countByDeletedAtIsNull();
        YearMonth month = YearMonth.of(9876, 1);
        Project continuous = project(ProjectType.CONTINUOUS);
        Project event = project(ProjectType.EVENT);
        Project deleted = project(ProjectType.EVENT);
        project(ProjectType.EVENT); // No expenses, so it contributes to population only.
        ProjectMember payer = member(continuous, "Continuous", 1);
        ProjectMember attendee = member(event, "Event", 1);
        ProjectMember removed = member(deleted, "Deleted", 1);
        expense(continuous, payer, 1, null, month.atEndOfMonth(), List.of(payer), List.of(1L));
        expense(event, attendee, 10, null, month.minusMonths(1).atEndOfMonth(), List.of(attendee), List.of(10L));
        expense(event, attendee, 11, null, month.atDay(1), List.of(attendee), List.of(11L));
        expense(event, attendee, 20, null, month.atEndOfMonth(), List.of(attendee), List.of(20L));
        expense(deleted, removed, 999, null, month.atDay(1), List.of(removed), List.of(999L));
        expenses.saveAndFlush(new Expense(event, attendee, 99, "Outside range", null, null, month.minusMonths(2).atDay(1)));
        event.archive(Instant.now());
        deleted.delete(Instant.now());
        projects.flush();
        entityManager.clear();
        var statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.clear();

        var overview = analyticsService.getLocalHomeOverview(month);
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(3);
        assertThat(overview.projectCount()).isEqualTo(initialCount + 3);
        assertThat(overview.selected().continuousExpense()).isEqualTo(1);
        assertThat(overview.selected().eventExpense()).isEqualTo(31);
        assertThat(overview.selected().totalExpense()).isEqualTo(32);
        assertThat(overview.selected().eventProjectCount()).isEqualTo(1);
        assertThat(overview.selected().contribution().continuousPercentage()).isEqualTo("3.13");
        assertThat(overview.selected().contribution().eventPercentage()).isEqualTo("96.88");
        assertThat(overview.previous().totalExpense()).isEqualTo(10);
        assertThat(overview.previous().eventProjectCount()).isEqualTo(1);
        assertThat(overview.comparison().total().difference()).isEqualTo(22);
        assertThat(overview.comparison().total().percentageChange()).isEqualTo("220.00");
        assertThat(overview.comparison().continuous().comparisonState()).isEqualTo("NO_PREVIOUS_DATA");
        assertThat(overview.comparison().continuous().percentageChange()).isNull();
        assertThat(overview.comparison().event().percentageChange()).isEqualTo("210.00");

        var empty = analyticsService.getLocalHomeOverview(month.plusMonths(2));
        assertThat(empty.selected().contribution().eventPercentage()).isNull();
        assertThat(empty.comparison().total().comparisonState()).isEqualTo("BOTH_MONTHS_EMPTY");
        var first = analyticsService.getLocalHomeOverview(YearMonth.of(1, 1));
        assertThat(first.previous()).isNull();
        assertThat(first.comparison().total().difference()).isNull();
        assertThat(first.comparison().total().comparisonState()).isEqualTo("NO_PREVIOUS_MONTH");
        assertThat(analyticsService.getLocalHomeOverview(YearMonth.of(9999, 12)).month()).isEqualTo("9999-12");
    }

    @Test
    void localHomeRejectsUnsafeCombinedTotalsAndInvalidAllocations() {
        YearMonth month = YearMonth.of(9876, 1);
        Project continuous = project(ProjectType.CONTINUOUS);
        Project event = project(ProjectType.EVENT);
        ProjectMember payer = member(continuous, "Continuous", 1);
        ProjectMember attendee = member(event, "Event", 1);
        long max = 9_007_199_254_740_991L;
        expense(continuous, payer, max, null, month.atDay(1), List.of(payer), List.of(max));
        expense(event, attendee, 1, null, month.atDay(1), List.of(attendee), List.of(1L));
        expenses.saveAndFlush(new Expense(event, attendee, 99, "Missing allocations", null, null, month.plusMonths(2).atDay(1)));
        entityManager.clear();

        assertThatThrownBy(() -> analyticsService.getLocalHomeOverview(month))
                .isInstanceOf(AnalyticsAmountOutOfRangeException.class);
        assertThatThrownBy(() -> analyticsService.getLocalHomeOverview(month.plusMonths(2)))
                .isInstanceOf(AnalyticsCalculationException.class);
    }

    private void assertInvalid(Project project) {
        assertThatThrownBy(() -> analyticsService.getAnalytics(project.getPublicToken(), MONTH, 6))
                .isInstanceOf(AnalyticsCalculationException.class);
    }

    private Project project(ProjectType type) {
        return projects.saveAndFlush(new Project(randomToken(), "Analytics", null, type, 1000));
    }

    private ProjectMember member(Project project, String name, int order) {
        return members.saveAndFlush(new ProjectMember(project, name, order));
    }

    private Expense expense(Project project, ProjectMember payer, long amount, ExpenseCategory category,
                            LocalDate date, List<ProjectMember> selected, List<Long> shares) {
        Expense expense = expenses.saveAndFlush(new Expense(project, payer, amount, "Expense", category, null, date));
        for (int index = 0; index < selected.size(); index++) {
            participants.save(new ExpenseParticipant(expense, selected.get(index), shares.get(index), index + 1));
        }
        participants.flush();
        return expense;
    }

    private String randomToken() {
        return (UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", "")).substring(0, 43);
    }
}
