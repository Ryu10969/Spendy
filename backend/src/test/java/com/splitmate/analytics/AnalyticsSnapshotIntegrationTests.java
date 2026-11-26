package com.splitmate.analytics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mockingDetails;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.splitmate.analytics.dto.AnalyticsMemberResponse;
import com.splitmate.analytics.service.AnalyticsService;
import com.splitmate.expense.dto.CreateExpenseRequest;
import com.splitmate.expense.dto.ExpenseResponse;
import com.splitmate.expense.dto.UpdateExpenseRequest;
import com.splitmate.expense.repository.ExpenseRepository;
import com.splitmate.expense.service.ExpenseService;
import com.splitmate.project.domain.Project;
import com.splitmate.project.domain.ProjectMember;
import com.splitmate.project.domain.ProjectType;
import com.splitmate.project.repository.ProjectMemberRepository;
import com.splitmate.project.repository.ProjectRepository;
import com.splitmate.project.service.ProjectNotFoundException;
import com.splitmate.project.service.ProjectService;

@SpringBootTest
@ActiveProfiles("local")
@EnabledIfEnvironmentVariable(named = "SPLITMATE_POSTGRES_INTEGRATION_TEST", matches = "true",
        disabledReason = "Requires the Docker PostgreSQL integration-test environment.")
class AnalyticsSnapshotIntegrationTests {

    private static final YearMonth MONTH = YearMonth.of(2026, 10);
    @Autowired private AnalyticsService analyticsService;
    @Autowired private ExpenseService expenseService;
    @Autowired private ProjectService projectService;
    @Autowired private ProjectRepository projects;
    @Autowired private ProjectMemberRepository members;
    @Autowired private PlatformTransactionManager transactionManager;
    @Autowired private JdbcTemplate jdbc;
    @MockitoSpyBean private ExpenseRepository expenses;

    @Test
    void usesReadOnlyRepeatableReadWhileWriterCommitsBetweenExpenseAndParticipantReads() throws Exception {
        Fixture fixture = fixture();
        CountDownLatch expensesRead = new CountDownLatch(1);
        CountDownLatch continueRead = new CountDownLatch(1);
        pauseAfterExpenseRead(fixture, expensesRead, continueRead);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var read = executor.submit(() -> analyticsService.getAnalytics(fixture.project().getPublicToken(), MONTH, 6));
            if (!expensesRead.await(10, TimeUnit.SECONDS)) read.get(1, TimeUnit.SECONDS);
            assertThat(expensesRead.getCount()).isZero();
            var write = executor.submit(() -> expenseService.updateExpense(fixture.project().getPublicToken(),
                    fixture.expense().id(), new UpdateExpenseRequest(fixture.alice().getId(),
                            List.of(fixture.bob().getId()), BigDecimal.valueOf(200), "Changed",
                            null, null, MONTH.atDay(1), fixture.expense().version())));
            // The writer completes while the reader is paused; Analytics does not lock the Project.
            assertThat(write.get(10, TimeUnit.SECONDS).amount()).isEqualTo(200);
            continueRead.countDown();
            var original = read.get(10, TimeUnit.SECONDS);
            assertThat(original.totalExpense()).isEqualTo(100);
            assertThat(original.members()).extracting(AnalyticsMemberResponse::burdenAmount).containsExactly(50L, 50L);
            assertThat(original.members()).extracting(AnalyticsMemberResponse::exactBalance).containsExactly(50L, -50L);
            var latest = analyticsService.getAnalytics(fixture.project().getPublicToken(), MONTH, 6);
            assertThat(latest.totalExpense()).isEqualTo(200);
            assertThat(latest.participantCount()).isEqualTo(1);
            assertThat(latest.members()).extracting(AnalyticsMemberResponse::burdenAmount).containsExactly(0L, 200L);
        } finally {
            continueRead.countDown();
            cleanup(fixture);
        }
    }

    @Test
    void inFlightReadFinishesFromEarlierSnapshotAfterSoftDeletionThenNewReadReturnsNotFound() throws Exception {
        Fixture fixture = fixture();
        CountDownLatch expensesRead = new CountDownLatch(1);
        CountDownLatch continueRead = new CountDownLatch(1);
        pauseAfterExpenseRead(fixture, expensesRead, continueRead);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var read = executor.submit(() -> analyticsService.getAnalytics(fixture.project().getPublicToken(), MONTH, 6));
            if (!expensesRead.await(10, TimeUnit.SECONDS)) read.get(1, TimeUnit.SECONDS);
            assertThat(expensesRead.getCount()).isZero();
            var deletion = executor.submit(() -> projectService.deleteProject(fixture.project().getPublicToken()));
            deletion.get(10, TimeUnit.SECONDS);
            continueRead.countDown();
            assertThat(read.get(10, TimeUnit.SECONDS).totalExpense()).isEqualTo(100);
            assertThatThrownBy(() -> analyticsService.getAnalytics(fixture.project().getPublicToken(), MONTH, 6))
                    .isInstanceOf(ProjectNotFoundException.class);
        } finally {
            continueRead.countDown();
            cleanup(fixture);
        }
    }

    @Test
    void overviewUsesOneSnapshotAcrossProjectsWhileAnotherProjectChanges() throws Exception {
        Fixture first = fixture();
        Fixture second = fixture();
        List<String> tokens = List.of(first.project().getPublicToken(), second.project().getPublicToken());
        CountDownLatch expensesRead = new CountDownLatch(1);
        CountDownLatch continueRead = new CountDownLatch(1);
        doAnswer(invocation -> {
            Object result = mockingDetails(expenses).getMockCreationSettings().getDefaultAnswer().answer(invocation);
            assertThat(jdbc.queryForObject("SHOW transaction_isolation", String.class)).isEqualTo("repeatable read");
            assertThat(jdbc.queryForObject("SHOW transaction_read_only", String.class)).isEqualTo("on");
            expensesRead.countDown();
            if (!continueRead.await(15, TimeUnit.SECONDS)) throw new AssertionError("Reader was not released.");
            return result;
        }).when(expenses).findByProject_IdInAndPaidOnBetween(any(), any(), any());
        try (var executor = Executors.newFixedThreadPool(2)) {
            var read = executor.submit(() -> analyticsService.getOverview(tokens, MONTH, MONTH, "CONTINUOUS"));
            if (!expensesRead.await(10, TimeUnit.SECONDS)) read.get(1, TimeUnit.SECONDS);
            assertThat(expensesRead.getCount()).isZero();
            var write = executor.submit(() -> expenseService.updateExpense(second.project().getPublicToken(),
                    second.expense().id(), new UpdateExpenseRequest(second.alice().getId(),
                            List.of(second.bob().getId()), BigDecimal.valueOf(300), "Changed",
                            null, null, MONTH.atDay(1), second.expense().version())));
            assertThat(write.get(10, TimeUnit.SECONDS).amount()).isEqualTo(300);
            continueRead.countDown();
            var original = read.get(10, TimeUnit.SECONDS);
            assertThat(original.totalExpense()).isEqualTo(200);
            assertThat(original.projectComparison()).extracting(row -> row.totalExpense()).containsExactly(100L, 100L);
            assertThat(analyticsService.getOverview(tokens, MONTH, MONTH, "CONTINUOUS").totalExpense()).isEqualTo(400);
        } finally {
            continueRead.countDown();
            cleanup(first);
            cleanup(second);
        }
    }

    @Test
    void localHomeKeepsBothMonthsAndAllocationsInOneReadOnlySnapshot() throws Exception {
        Fixture fixture = fixture();
        var baseline = analyticsService.getLocalHomeOverview(MONTH);
        CountDownLatch expensesRead = new CountDownLatch(1);
        CountDownLatch continueRead = new CountDownLatch(1);
        doAnswer(invocation -> {
            Object result = mockingDetails(expenses).getMockCreationSettings().getDefaultAnswer().answer(invocation);
            assertThat(jdbc.queryForObject("SHOW transaction_isolation", String.class)).isEqualTo("repeatable read");
            assertThat(jdbc.queryForObject("SHOW transaction_read_only", String.class)).isEqualTo("on");
            expensesRead.countDown();
            if (!continueRead.await(15, TimeUnit.SECONDS)) throw new AssertionError("Reader was not released.");
            return result;
        }).when(expenses).findByProject_DeletedAtIsNullAndPaidOnBetween(any(), any());
        try (var executor = Executors.newFixedThreadPool(2)) {
            var read = executor.submit(() -> analyticsService.getLocalHomeOverview(MONTH));
            if (!expensesRead.await(10, TimeUnit.SECONDS)) read.get(1, TimeUnit.SECONDS);
            assertThat(expensesRead.getCount()).isZero();
            var write = executor.submit(() -> expenseService.updateExpense(fixture.project().getPublicToken(),
                    fixture.expense().id(), new UpdateExpenseRequest(fixture.alice().getId(),
                            List.of(fixture.bob().getId()), BigDecimal.valueOf(300), "Moved",
                            null, null, MONTH.minusMonths(1).atDay(1), fixture.expense().version())));
            assertThat(write.get(10, TimeUnit.SECONDS).amount()).isEqualTo(300);
            continueRead.countDown();
            assertThat(read.get(10, TimeUnit.SECONDS)).isEqualTo(baseline);
            var latest = analyticsService.getLocalHomeOverview(MONTH);
            assertThat(latest.selected().totalExpense()).isEqualTo(baseline.selected().totalExpense() - 100);
            assertThat(latest.previous().totalExpense()).isEqualTo(baseline.previous().totalExpense() + 300);
        } finally {
            continueRead.countDown();
            cleanup(fixture);
        }
    }

    private void pauseAfterExpenseRead(Fixture fixture, CountDownLatch expensesRead, CountDownLatch continueRead) {
        doAnswer(invocation -> {
            Object result = mockingDetails(expenses).getMockCreationSettings()
                    .getDefaultAnswer().answer(invocation);
            if (fixture.project().getId().equals(invocation.getArgument(0))) {
                assertThat(jdbc.queryForObject("SHOW transaction_isolation", String.class)).isEqualTo("repeatable read");
                assertThat(jdbc.queryForObject("SHOW transaction_read_only", String.class)).isEqualTo("on");
                expensesRead.countDown();
                if (!continueRead.await(15, TimeUnit.SECONDS)) throw new AssertionError("Reader was not released.");
            }
            return result;
        }).when(expenses).findByProject_IdAndPaidOnBetween(any(), any(), any());
    }

    private Fixture fixture() {
        return new TransactionTemplate(transactionManager).execute(status -> {
            String token = (UUID.randomUUID().toString().replace("-", "")
                    + UUID.randomUUID().toString().replace("-", "")).substring(0, 43);
            Project project = projects.saveAndFlush(new Project(token, "Analytics snapshot", null, ProjectType.CONTINUOUS, 1));
            ProjectMember alice = members.saveAndFlush(new ProjectMember(project, "Alice", 1));
            ProjectMember bob = members.saveAndFlush(new ProjectMember(project, "Bob", 2));
            ExpenseResponse expense = expenseService.createExpense(token, new CreateExpenseRequest(alice.getId(),
                    List.of(alice.getId(), bob.getId()), BigDecimal.valueOf(100), "Original", null, null, LocalDate.of(2026, 10, 1)));
            return new Fixture(project, alice, bob, expense);
        });
    }

    private void cleanup(Fixture fixture) {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            jdbc.update("DELETE FROM expense_participants WHERE expense_id IN (SELECT id FROM expenses WHERE project_id = ?)", fixture.project().getId());
            jdbc.update("DELETE FROM expenses WHERE project_id = ?", fixture.project().getId());
            jdbc.update("DELETE FROM project_members WHERE project_id = ?", fixture.project().getId());
            jdbc.update("DELETE FROM projects WHERE id = ?", fixture.project().getId());
        });
    }

    private record Fixture(Project project, ProjectMember alice, ProjectMember bob, ExpenseResponse expense) {
    }
}
