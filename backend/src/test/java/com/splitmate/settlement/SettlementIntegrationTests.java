package com.splitmate.settlement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import com.splitmate.expense.domain.ExpenseCategory;
import com.splitmate.expense.dto.CreateExpenseRequest;
import com.splitmate.expense.dto.ExpenseResponse;
import com.splitmate.expense.dto.UpdateExpenseRequest;
import com.splitmate.expense.service.ExpenseService;
import com.splitmate.project.domain.Project;
import com.splitmate.project.domain.ProjectMember;
import com.splitmate.project.domain.ProjectType;
import com.splitmate.project.repository.ProjectMemberRepository;
import com.splitmate.project.repository.ProjectRepository;
import com.splitmate.project.service.ProjectService;
import com.splitmate.settlement.domain.SettlementRunState;
import com.splitmate.settlement.domain.SettlementScopeType;
import com.splitmate.settlement.domain.SettlementStrategy;
import com.splitmate.settlement.domain.SettlementTransferStatus;
import com.splitmate.settlement.dto.SettlementResponse;
import com.splitmate.settlement.repository.SettlementRunRepository;
import com.splitmate.settlement.repository.SettlementTransferRepository;
import com.splitmate.settlement.service.SettlementCalculationException;
import com.splitmate.settlement.service.SettlementRunUnavailableException;
import com.splitmate.settlement.service.SettlementScopeUnsupportedException;
import com.splitmate.settlement.service.SettlementService;

import jakarta.persistence.EntityManager;

@SpringBootTest
@ActiveProfiles("local")
@Transactional
@EnabledIfEnvironmentVariable(
        named = "SPLITMATE_POSTGRES_INTEGRATION_TEST",
        matches = "true",
        disabledReason = "Requires the Docker PostgreSQL integration-test environment."
)
class SettlementIntegrationTests {

    @Autowired
    private SettlementService settlementService;

    @Autowired
    private ExpenseService expenseService;

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private ProjectMemberRepository projectMemberRepository;

    @Autowired
    private SettlementRunRepository settlementRunRepository;

    @Autowired
    private SettlementTransferRepository settlementTransferRepository;

    @Autowired
    private ProjectService projectService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EntityManager entityManager;

    @Test
    void flywayCreatesExactEventSettlementTablesAndIndexes() {
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM flyway_schema_history WHERE version = '3' AND success",
                Integer.class
        )).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM flyway_schema_history WHERE version = '5' AND success",
                Integer.class
        )).isEqualTo(1);
        assertThat(jdbcTemplate.queryForList(
                """
                SELECT tablename
                FROM pg_tables
                WHERE schemaname = 'public' AND tablename LIKE 'settlement_%'
                ORDER BY tablename
                """,
                String.class
        )).containsExactly(
                "settlement_balances",
                "settlement_runs",
                "settlement_transfers"
        );
        assertThat(jdbcTemplate.queryForList(
                """
                SELECT indexname
                FROM pg_indexes
                WHERE schemaname = 'public' AND tablename = 'settlement_runs'
                ORDER BY indexname
                """,
                String.class
        )).contains(
                "idx_settlement_runs_project_state_strategy",
                "uq_settlement_runs_current_scope_strategy",
                "idx_settlement_runs_scope_state_strategy",
                "uq_settlement_runs_project_sequence"
        );
    }

    @Test
    void flywayCreatesRequiredSettlementConstraintsAndArithmeticRules() {
        Map<String, String> constraints = jdbcTemplate.query(
                """
                SELECT conname, pg_get_constraintdef(oid)
                FROM pg_constraint
                WHERE conrelid IN (
                    'settlement_runs'::regclass,
                    'settlement_balances'::regclass,
                    'settlement_transfers'::regclass
                )
                """,
                (resultSet, rowNumber) -> Map.entry(
                        resultSet.getString("conname"),
                        resultSet.getString("pg_get_constraintdef")
                )
        ).stream().collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));

        assertThat(constraints.keySet()).contains(
                "fk_settlement_runs_project",
                "uq_settlement_runs_id_project",
                "uq_settlement_runs_project_sequence",
                "chk_settlement_runs_sequence",
                "chk_settlement_runs_scope",
                "chk_settlement_runs_scope_key",
                "chk_settlement_runs_strategy",
                "chk_settlement_runs_fingerprint",
                "chk_settlement_runs_state",
                "chk_settlement_runs_lifecycle",
                "fk_settlement_balances_run_project",
                "fk_settlement_balances_member",
                "uq_settlement_balances_run_member",
                "chk_settlement_balances_paid_non_negative",
                "chk_settlement_balances_burden_non_negative",
                "chk_settlement_balances_exact",
                "chk_settlement_balances_rounding",
                "fk_settlement_transfers_run_project",
                "fk_settlement_transfers_from_member",
                "fk_settlement_transfers_to_member",
                "uq_settlement_transfers_run_order",
                "chk_settlement_transfers_order",
                "chk_settlement_transfers_members",
                "chk_settlement_transfers_exact_positive",
                "chk_settlement_transfers_initial_non_negative",
                "chk_settlement_transfers_final_positive",
                "chk_settlement_transfers_adjustment",
                "chk_settlement_transfers_final_exact",
                "chk_settlement_transfers_explanation",
                "chk_settlement_transfers_status",
                "chk_settlement_transfers_completion"
        );
        assertThat(constraints.get("fk_settlement_balances_run_project"))
                .isEqualTo("FOREIGN KEY (settlement_run_id, project_id) "
                        + "REFERENCES settlement_runs(id, project_id)");
        assertThat(constraints.get("fk_settlement_transfers_run_project"))
                .isEqualTo("FOREIGN KEY (settlement_run_id, project_id) "
                        + "REFERENCES settlement_runs(id, project_id)");
        assertThat(constraints.get("chk_settlement_balances_exact"))
                .contains("exact_balance = (paid_amount - burden_amount)");
        assertThat(constraints.get("chk_settlement_balances_rounding"))
                .contains("rounding_difference = (exact_balance - rounded_transfer_net)");
        assertThat(constraints.get("chk_settlement_transfers_adjustment"))
                .contains("final_rounded_amount = "
                        + "(initially_rounded_amount + rounding_adjustment)");
        assertThat(constraints.get("chk_settlement_transfers_final_exact"))
                .contains("final_rounded_amount = exact_amount");
        assertThat(constraints.get("chk_settlement_transfers_completion"))
                .contains("OUTSTANDING")
                .contains("COMPLETED")
                .contains("completed_at IS NULL")
                .contains("completed_at IS NOT NULL");
    }

    @Test
    void emptyEventProjectCreatesCurrentRunWithNoBalancesOrTransfers() {
        Project project = saveProject(ProjectType.EVENT, 1);
        saveMember(project, "Only member", 1);

        SettlementResponse response = settlementService.getSettlement(
                project.getPublicToken(),
                SettlementStrategy.FEWER_TRANSFERS
        );

        assertThat(response.scopeType()).isEqualTo(SettlementScopeType.PROJECT);
        assertThat(response.state()).isEqualTo(SettlementRunState.CURRENT);
        assertThat(response.balances()).isEmpty();
        assertThat(response.transfers()).isEmpty();
        assertThat(settlementService.getSettlement(
                project.getPublicToken(),
                SettlementStrategy.FEWER_TRANSFERS
        ).runId()).isEqualTo(response.runId());
    }

    @Test
    void malformedPersistedAllocationIsCalculationInvalid() {
        Project project = saveProject(ProjectType.EVENT, 1);
        ProjectMember payer = saveMember(project, "Payer", 1);
        ProjectMember participant = saveMember(project, "Participant", 2);
        ExpenseResponse expense = expenseService.createExpense(
                project.getPublicToken(),
                request(payer, List.of(participant), 100)
        );
        jdbcTemplate.update(
                "UPDATE expense_participants SET allocated_share = allocated_share - 1 WHERE expense_id = ?",
                expense.id()
        );
        entityManager.clear();

        assertThatThrownBy(() -> settlementService.getSettlement(
                project.getPublicToken(),
                SettlementStrategy.FEWER_TRANSFERS
        )).isInstanceOf(SettlementCalculationException.class);
    }

    @Test
    void createsAndReusesStrategySpecificCurrentRunsFromPersistedAllocations() {
        Project project = saveProject(ProjectType.EVENT, 10);
        ProjectMember payer = saveMember(project, "Payer", 3);
        ProjectMember first = saveMember(project, "First", 1);
        ProjectMember second = saveMember(project, "Second", 2);
        expenseService.createExpense(
                project.getPublicToken(),
                request(payer, List.of(second, first), 1_001)
        );

        SettlementResponse fewer = settlementService.getSettlement(
                project.getPublicToken(),
                SettlementStrategy.FEWER_TRANSFERS
        );
        SettlementResponse reused = settlementService.getSettlement(
                project.getPublicToken(),
                SettlementStrategy.FEWER_TRANSFERS
        );
        SettlementResponse understandable = settlementService.getSettlement(
                project.getPublicToken(),
                SettlementStrategy.UNDERSTANDABLE
        );

        assertThat(reused.runId()).isEqualTo(fewer.runId());
        assertThat(fewer.sourceStateFingerprint()).isEqualTo(
                settlementRunRepository.findById(fewer.runId()).orElseThrow()
                        .getSourceStateFingerprint()
        );
        assertThat(reused.sourceStateFingerprint()).isEqualTo(fewer.sourceStateFingerprint());
        assertThat(understandable.sourceStateFingerprint())
                .isEqualTo(fewer.sourceStateFingerprint());
        assertThat(understandable.runId()).isNotEqualTo(fewer.runId());
        assertThat(understandable.balances()).isEqualTo(fewer.balances());
        assertThat(fewer.balances())
                .extracting(
                        balance -> balance.memberId(),
                        balance -> balance.paidAmount(),
                        balance -> balance.burdenAmount(),
                        balance -> balance.exactBalance()
                )
                .containsExactly(
                        tuple(first.getId(), 0L, 501L, -501L),
                        tuple(second.getId(), 0L, 500L, -500L),
                        tuple(payer.getId(), 1_001L, 0L, 1_001L)
                );
        assertThat(fewer.transfers()).allSatisfy(transfer -> {
            assertThat(transfer.finalRoundedAmount()).isEqualTo(transfer.exactAmount());
            assertThat(transfer.explanation().fromExactBalanceBefore()).isNegative();
            assertThat(transfer.explanation().toExactBalanceBefore()).isPositive();
        });
        assertThat(settlementRunRepository.findAllByProject_IdAndState(
                project.getId(),
                SettlementRunState.CURRENT
        )).hasSize(2);
    }

    @Test
    void expenseCreateUpdateAndDeleteEachStaleAllCurrentEventRuns() {
        Project project = saveProject(ProjectType.EVENT, 1);
        ProjectMember payer = saveMember(project, "Payer", 1);
        ProjectMember participant = saveMember(project, "Participant", 2);
        ExpenseResponse firstExpense =
                expenseService.createExpense(
                        project.getPublicToken(),
                        request(payer, List.of(participant), 100)
                );
        SettlementResponse firstRun = settlementService.getSettlement(
                project.getPublicToken(),
                SettlementStrategy.FEWER_TRANSFERS
        );
        settlementService.getSettlement(
                project.getPublicToken(),
                SettlementStrategy.UNDERSTANDABLE
        );

        expenseService.createExpense(
                project.getPublicToken(),
                request(participant, List.of(payer), 10)
        );
        assertNoCurrentAndAllStale(project, 2);

        SettlementResponse secondRun = settlementService.getSettlement(
                project.getPublicToken(),
                SettlementStrategy.FEWER_TRANSFERS
        );
        expenseService.updateExpense(
                project.getPublicToken(),
                firstExpense.id(),
                new UpdateExpenseRequest(
                        payer.getId(),
                        List.of(participant.getId()),
                        BigDecimal.valueOf(120),
                        "Updated",
                        ExpenseCategory.OTHER,
                        null,
                        LocalDate.of(2026, 9, 1),
                        firstExpense.version()
                )
        );
        assertNoCurrentAndAllStale(project, 3);

        SettlementResponse thirdRun = settlementService.getSettlement(
                project.getPublicToken(),
                SettlementStrategy.FEWER_TRANSFERS
        );
        expenseService.deleteExpense(project.getPublicToken(), firstExpense.id());
        assertNoCurrentAndAllStale(project, 4);

        assertThat(secondRun.runId()).isNotEqualTo(firstRun.runId());
        assertThat(secondRun.sourceStateFingerprint())
                .isNotEqualTo(firstRun.sourceStateFingerprint());
        assertThat(thirdRun.runId()).isNotEqualTo(secondRun.runId());
        assertThat(thirdRun.sourceStateFingerprint())
                .isNotEqualTo(secondRun.sourceStateFingerprint());
    }

    @Test
    void archivedEventReturnsMatchingCurrentAndNeverCreatesMissingRun() {
        Project project = saveProject(ProjectType.EVENT, 1);
        ProjectMember payer = saveMember(project, "Payer", 1);
        ProjectMember participant = saveMember(project, "Participant", 2);
        expenseService.createExpense(
                project.getPublicToken(),
                request(payer, List.of(participant), 100)
        );
        SettlementResponse current = settlementService.getSettlement(
                project.getPublicToken(),
                SettlementStrategy.FEWER_TRANSFERS
        );
        archive(project);

        assertThat(settlementService.getSettlement(
                project.getPublicToken(),
                SettlementStrategy.FEWER_TRANSFERS
        ).runId()).isEqualTo(current.runId());
        assertThatThrownBy(() -> settlementService.getSettlement(
                project.getPublicToken(),
                SettlementStrategy.UNDERSTANDABLE
        )).isInstanceOf(SettlementRunUnavailableException.class);
        assertThat(settlementRunRepository.findAllByProject_IdAndState(
                project.getId(),
                SettlementRunState.CURRENT
        )).hasSize(1);
    }

    @Test
    void archiveDoesNotMutateSettlementAndPreservesArchivedRead() {
        Project project = saveProject(ProjectType.EVENT, 1);
        ProjectMember payer = saveMember(project, "Payer", 1);
        ProjectMember participant = saveMember(project, "Participant", 2);
        expenseService.createExpense(
                project.getPublicToken(),
                request(payer, List.of(participant), 100)
        );
        SettlementResponse current = settlementService.getSettlement(
                project.getPublicToken(),
                SettlementStrategy.FEWER_TRANSFERS
        );
        var transfersBefore = settlementTransferRepository
                .findAllBySettlementRun_IdOrderByTransferOrderAsc(current.runId());
        Instant generatedAt = settlementRunRepository.findById(current.runId()).orElseThrow()
                .getGeneratedAt();

        projectService.archiveProject(project.getPublicToken());
        entityManager.clear();

        assertThat(settlementService.getSettlement(
                project.getPublicToken(),
                SettlementStrategy.FEWER_TRANSFERS
        ).runId()).isEqualTo(current.runId());
        assertThatThrownBy(() -> settlementService.getSettlement(
                project.getPublicToken(),
                SettlementStrategy.UNDERSTANDABLE
        )).isInstanceOf(SettlementRunUnavailableException.class);

        var runAfter = settlementRunRepository.findById(current.runId()).orElseThrow();
        assertThat(runAfter.getState()).isEqualTo(SettlementRunState.CURRENT);
        assertThat(runAfter.getStaledAt()).isNull();
        assertThat(runAfter.getGeneratedAt()).isEqualTo(generatedAt);
        assertThat(settlementRunRepository.findAllByProject_IdAndState(
                project.getId(),
                SettlementRunState.CURRENT
        )).hasSize(1);
        assertThat(settlementTransferRepository
                .findAllBySettlementRun_IdOrderByTransferOrderAsc(current.runId()))
                .hasSize(transfersBefore.size())
                .allSatisfy(transfer -> {
                    assertThat(transfer.getStatus()).isEqualTo(SettlementTransferStatus.OUTSTANDING);
                    assertThat(transfer.getCompletedAt()).isNull();
                });
    }

    @Test
    void archiveWithoutExpensesOrRunLeavesSettlementUnavailable() {
        Project project = saveProject(ProjectType.EVENT, 1);
        saveMember(project, "Payer", 1);

        projectService.archiveProject(project.getPublicToken());
        entityManager.clear();

        assertThatThrownBy(() -> settlementService.getSettlement(
                project.getPublicToken(),
                SettlementStrategy.FEWER_TRANSFERS
        )).isInstanceOf(SettlementRunUnavailableException.class);
        assertThat(settlementRunRepository.findAllByProject_IdAndState(
                project.getId(),
                SettlementRunState.CURRENT
        )).isEmpty();
    }

    @Test
    void rejectsContinuousScopeAndScopesRunsByProject() {
        Project continuous = saveProject(ProjectType.CONTINUOUS, 1);
        Project first = saveProject(ProjectType.EVENT, 1);
        Project second = saveProject(ProjectType.EVENT, 1);
        ProjectMember firstPayer = saveMember(first, "First payer", 1);
        ProjectMember firstParticipant = saveMember(first, "First participant", 2);
        ProjectMember secondPayer = saveMember(second, "Second payer", 1);
        ProjectMember secondParticipant = saveMember(second, "Second participant", 2);
        expenseService.createExpense(
                first.getPublicToken(),
                request(firstPayer, List.of(firstParticipant), 100)
        );
        expenseService.createExpense(
                second.getPublicToken(),
                request(secondPayer, List.of(secondParticipant), 200)
        );

        assertThatThrownBy(() -> settlementService.getSettlement(
                continuous.getPublicToken(),
                SettlementStrategy.FEWER_TRANSFERS
        )).isInstanceOf(com.splitmate.expense.service.ExpenseValidationException.class);
        SettlementResponse firstResponse = settlementService.getSettlement(
                first.getPublicToken(),
                SettlementStrategy.FEWER_TRANSFERS
        );
        SettlementResponse secondResponse = settlementService.getSettlement(
                second.getPublicToken(),
                SettlementStrategy.FEWER_TRANSFERS
        );

        assertThat(firstResponse.transfers()).singleElement()
                .satisfies(transfer -> assertThat(transfer.exactAmount()).isEqualTo(100));
        assertThat(secondResponse.transfers()).singleElement()
                .satisfies(transfer -> assertThat(transfer.exactAmount()).isEqualTo(200));
    }

    @Test
    void retainsInactiveHistoricalMemberInSettlement() {
        Project project = saveProject(ProjectType.EVENT, 1);
        ProjectMember payer = saveMember(project, "Payer", 1);
        ProjectMember historical = saveMember(project, "Historical", 2);
        expenseService.createExpense(
                project.getPublicToken(),
                request(payer, List.of(historical), 100)
        );
        jdbcTemplate.update(
                "UPDATE project_members SET active = FALSE WHERE id = ?",
                historical.getId()
        );
        entityManager.clear();

        assertThat(settlementService.getSettlement(
                project.getPublicToken(),
                SettlementStrategy.FEWER_TRANSFERS
        ).balances()).extracting(balance -> balance.memberId())
                .contains(historical.getId());
    }

    @Test
    void databaseRejectsInvalidRunLifecycle() {
        Project project = saveProject(ProjectType.EVENT, 1);
        String insert = """
                INSERT INTO settlement_runs (
                    id, project_id, run_sequence, scope_type, scope_key, strategy,
                    source_state_fingerprint, state, generated_at, staled_at
                ) VALUES (?, ?, ?, 'PROJECT', 'PROJECT', 'FEWER_TRANSFERS', ?, ?, CURRENT_TIMESTAMP, ?)
                """;

        assertThatThrownBy(() -> jdbcTemplate.update(
                insert,
                UUID.randomUUID(),
                project.getId(),
                1L,
                "0".repeat(64),
                "CURRENT",
                java.time.OffsetDateTime.now()
        )).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void databaseRejectsDuplicateCurrentStrategy() {
        Project project = saveProject(ProjectType.EVENT, 1);
        String insert = """
                INSERT INTO settlement_runs (
                    id, project_id, run_sequence, scope_type, scope_key, strategy,
                    source_state_fingerprint, state, generated_at, staled_at
                ) VALUES (?, ?, ?, 'PROJECT', 'PROJECT', 'FEWER_TRANSFERS', ?, ?, CURRENT_TIMESTAMP, ?)
                """;

        jdbcTemplate.update(
                insert,
                UUID.randomUUID(),
                project.getId(),
                1L,
                "0".repeat(64),
                "CURRENT",
                null
        );
        assertThatThrownBy(() -> jdbcTemplate.update(
                insert,
                UUID.randomUUID(),
                project.getId(),
                2L,
                "1".repeat(64),
                "CURRENT",
                null
        )).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void monthlySettlementUsesOnlyPaidOnMonthAndReusesEmptyAndFutureRuns() {
        Project project = saveProject(ProjectType.CONTINUOUS, 10);
        ProjectMember payer = saveMember(project, "Payer", 1);
        ProjectMember participant = saveMember(project, "Participant", 2);
        expenseService.createExpense(project.getPublicToken(),
                request(payer, List.of(participant), 101, LocalDate.of(2026, 9, 30)));
        expenseService.createExpense(project.getPublicToken(),
                request(participant, List.of(payer), 30, LocalDate.of(2026, 10, 1)));

        SettlementResponse september = settlementService.getSettlement(project.getPublicToken(),
                SettlementStrategy.FEWER_TRANSFERS, YearMonth.of(2026, 9));
        SettlementResponse understandable = settlementService.getSettlement(project.getPublicToken(),
                SettlementStrategy.UNDERSTANDABLE, YearMonth.of(2026, 9));
        SettlementResponse october = settlementService.getSettlement(project.getPublicToken(),
                SettlementStrategy.FEWER_TRANSFERS, YearMonth.of(2026, 10));
        SettlementResponse empty = settlementService.getSettlement(project.getPublicToken(),
                SettlementStrategy.FEWER_TRANSFERS, YearMonth.of(9999, 12));

        assertThat(september.scopeType()).isEqualTo(SettlementScopeType.YEAR_MONTH);
        assertThat(september.scopeKey()).isEqualTo("2026-09");
        assertThat(september.balances()).extracting(balance -> balance.exactBalance())
                .containsExactly(101L, -101L);
        assertThat(september.transfers()).singleElement().satisfies(transfer -> {
            assertThat(transfer.exactAmount()).isEqualTo(101);
            assertThat(transfer.initiallyRoundedAmount()).isEqualTo(100);
            assertThat(transfer.roundingAdjustment()).isEqualTo(1);
            assertThat(transfer.finalRoundedAmount()).isEqualTo(101);
            assertThat(transfer.status()).isEqualTo(SettlementTransferStatus.OUTSTANDING);
        });
        assertThat(understandable.balances()).isEqualTo(september.balances());
        assertThat(understandable.sourceStateFingerprint())
                .isEqualTo(september.sourceStateFingerprint());
        assertThat(october.transfers()).singleElement()
                .satisfies(transfer -> assertThat(transfer.exactAmount()).isEqualTo(30));
        assertThat(empty.balances()).isEmpty();
        assertThat(empty.transfers()).isEmpty();
        assertThat(settlementService.getSettlement(project.getPublicToken(),
                SettlementStrategy.FEWER_TRANSFERS, YearMonth.of(9999, 12)).runId())
                .isEqualTo(empty.runId());
        assertThat(expenseService.getExpenses(project.getPublicToken(), YearMonth.of(2026, 9))
                .items()).singleElement().satisfies(expense ->
                        assertThat(expense.paidOn()).isEqualTo(LocalDate.of(2026, 9, 30)));
        assertThat(expenseService.getExpenses(project.getPublicToken()).items()).hasSize(2);
    }

    @Test
    void monthlyExpenseMutationsStaleOnlyAffectedMonthsAcrossBothStrategies() {
        Project project = saveProject(ProjectType.CONTINUOUS, 1);
        ProjectMember payer = saveMember(project, "Payer", 1);
        ProjectMember participant = saveMember(project, "Participant", 2);
        ExpenseResponse expense = expenseService.createExpense(project.getPublicToken(),
                request(payer, List.of(participant), 100, LocalDate.of(2026, 9, 1)));
        YearMonth september = YearMonth.of(2026, 9);
        YearMonth october = YearMonth.of(2026, 10);
        YearMonth november = YearMonth.of(2026, 11);
        SettlementResponse septemberFewer = settlementService.getSettlement(project.getPublicToken(),
                SettlementStrategy.FEWER_TRANSFERS, september);
        SettlementResponse septemberUnderstandable = settlementService.getSettlement(project.getPublicToken(),
                SettlementStrategy.UNDERSTANDABLE, september);
        SettlementResponse octoberFewer = settlementService.getSettlement(project.getPublicToken(),
                SettlementStrategy.FEWER_TRANSFERS, october);
        SettlementResponse octoberUnderstandable = settlementService.getSettlement(project.getPublicToken(),
                SettlementStrategy.UNDERSTANDABLE, october);
        SettlementResponse novemberFewer = settlementService.getSettlement(project.getPublicToken(),
                SettlementStrategy.FEWER_TRANSFERS, november);

        expense = expenseService.updateExpense(project.getPublicToken(), expense.id(),
                updateRequest(payer, participant, 100, LocalDate.of(2026, 9, 20), expense.version()));
        assertThat(settlementRunRepository.findById(septemberFewer.runId()).orElseThrow().getState())
                .isEqualTo(SettlementRunState.CURRENT);
        assertThat(settlementService.getSettlement(project.getPublicToken(),
                SettlementStrategy.FEWER_TRANSFERS, september).runId()).isEqualTo(septemberFewer.runId());

        expense = expenseService.updateExpense(project.getPublicToken(), expense.id(),
                updateRequest(payer, participant, 120, LocalDate.of(2026, 9, 20), expense.version()));
        assertThat(settlementRunRepository.findById(septemberFewer.runId()).orElseThrow().getState())
                .isEqualTo(SettlementRunState.STALE);
        assertThat(settlementRunRepository.findById(septemberUnderstandable.runId()).orElseThrow().getState())
                .isEqualTo(SettlementRunState.STALE);
        assertThat(settlementRunRepository.findById(octoberFewer.runId()).orElseThrow().getState())
                .isEqualTo(SettlementRunState.CURRENT);
        SettlementResponse replacement = settlementService.getSettlement(project.getPublicToken(),
                SettlementStrategy.FEWER_TRANSFERS, september);
        assertThat(replacement.runId()).isNotEqualTo(septemberFewer.runId());
        assertThat(replacement.transfers()).allSatisfy(transfer ->
                assertThat(transfer.status()).isEqualTo(SettlementTransferStatus.OUTSTANDING));

        expense = expenseService.updateExpense(project.getPublicToken(), expense.id(),
                updateRequest(payer, participant, 120, LocalDate.of(2026, 10, 1), expense.version()));
        assertThat(settlementRunRepository.findById(replacement.runId()).orElseThrow().getState())
                .isEqualTo(SettlementRunState.STALE);
        assertThat(settlementRunRepository.findById(octoberFewer.runId()).orElseThrow().getState())
                .isEqualTo(SettlementRunState.STALE);
        assertThat(settlementRunRepository.findById(octoberUnderstandable.runId()).orElseThrow().getState())
                .isEqualTo(SettlementRunState.STALE);
        assertThat(settlementRunRepository.findById(novemberFewer.runId()).orElseThrow().getState())
                .isEqualTo(SettlementRunState.CURRENT);
        SettlementResponse octoberReplacement = settlementService.getSettlement(project.getPublicToken(),
                SettlementStrategy.FEWER_TRANSFERS, october);
        SettlementResponse octoberOtherStrategy = settlementService.getSettlement(project.getPublicToken(),
                SettlementStrategy.UNDERSTANDABLE, october);
        expenseService.deleteExpense(project.getPublicToken(), expense.id());
        assertThat(settlementRunRepository.findById(octoberReplacement.runId()).orElseThrow().getState())
                .isEqualTo(SettlementRunState.STALE);
        assertThat(settlementRunRepository.findById(octoberOtherStrategy.runId()).orElseThrow().getState())
                .isEqualTo(SettlementRunState.STALE);
        assertThat(settlementRunRepository.findById(novemberFewer.runId()).orElseThrow().getState())
                .isEqualTo(SettlementRunState.CURRENT);
    }

    @Test
    void monthlyCreateStalesItsOwnMonthAndPreservesOtherCurrentRuns() {
        Project project = saveProject(ProjectType.CONTINUOUS, 1);
        ProjectMember payer = saveMember(project, "Payer", 1);
        SettlementResponse september = settlementService.getSettlement(project.getPublicToken(),
                SettlementStrategy.FEWER_TRANSFERS, YearMonth.of(2026, 9));
        SettlementResponse septemberOtherStrategy = settlementService.getSettlement(
                project.getPublicToken(), SettlementStrategy.UNDERSTANDABLE, YearMonth.of(2026, 9));
        SettlementResponse october = settlementService.getSettlement(project.getPublicToken(),
                SettlementStrategy.FEWER_TRANSFERS, YearMonth.of(2026, 10));
        expenseService.createExpense(project.getPublicToken(),
                request(payer, List.of(payer), 10, LocalDate.of(2026, 9, 30)));
        assertThat(settlementRunRepository.findById(september.runId()).orElseThrow().getState())
                .isEqualTo(SettlementRunState.STALE);
        assertThat(settlementRunRepository.findById(septemberOtherStrategy.runId()).orElseThrow().getState())
                .isEqualTo(SettlementRunState.STALE);
        assertThat(settlementRunRepository.findById(october.runId()).orElseThrow().getState())
                .isEqualTo(SettlementRunState.CURRENT);
    }

    @Test
    void monthScopedExpenseListKeepsPaidDateOrderingAndEventRejectsMonth() {
        Project continuous = saveProject(ProjectType.CONTINUOUS, 1);
        ProjectMember payer = saveMember(continuous, "Payer", 1);
        expenseService.createExpense(continuous.getPublicToken(),
                request(payer, List.of(payer), 1, LocalDate.of(2026, 9, 1)));
        expenseService.createExpense(continuous.getPublicToken(),
                request(payer, List.of(payer), 2, LocalDate.of(2026, 9, 30)));
        expenseService.createExpense(continuous.getPublicToken(),
                request(payer, List.of(payer), 3, LocalDate.of(2026, 10, 1)));
        assertThat(expenseService.getExpenses(continuous.getPublicToken(), YearMonth.of(2026, 9))
                .items()).extracting(ExpenseResponse::amount).containsExactly(2L, 1L);
        assertThat(expenseService.getExpenses(continuous.getPublicToken()).items())
                .extracting(ExpenseResponse::amount).containsExactly(3L, 2L, 1L);

        Project event = saveProject(ProjectType.EVENT, 1);
        assertThatThrownBy(() -> expenseService.getExpenses(event.getPublicToken(),
                YearMonth.of(2026, 9))).isInstanceOf(SettlementScopeUnsupportedException.class);
        assertThatThrownBy(() -> settlementService.getSettlement(event.getPublicToken(),
                SettlementStrategy.FEWER_TRANSFERS, YearMonth.of(2026, 9)))
                .isInstanceOf(SettlementScopeUnsupportedException.class);
    }

    @Test
    void databaseAllowsCurrentMonthlyRunsInSeparateMonthsButRejectsDuplicate() {
        Project project = saveProject(ProjectType.CONTINUOUS, 1);
        String insert = """
                INSERT INTO settlement_runs (id, project_id, run_sequence, scope_type, scope_key,
                    strategy, source_state_fingerprint, state, generated_at)
                VALUES (?, ?, ?, 'YEAR_MONTH', ?, 'FEWER_TRANSFERS', ?, 'CURRENT', CURRENT_TIMESTAMP)
                """;
        jdbcTemplate.update(insert, UUID.randomUUID(), project.getId(), 1L,
                "2026-09", "0".repeat(64));
        jdbcTemplate.update(insert, UUID.randomUUID(), project.getId(), 2L,
                "2026-10", "1".repeat(64));
        assertThatThrownBy(() -> jdbcTemplate.update(insert, UUID.randomUUID(), project.getId(),
                3L, "2026-09", "2".repeat(64)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void databaseRejectsInvalidYearMonthScopeKey() {
        Project project = saveProject(ProjectType.CONTINUOUS, 1);
        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO settlement_runs (id, project_id, run_sequence, scope_type, scope_key,
                    strategy, source_state_fingerprint, state, generated_at)
                VALUES (?, ?, 1, 'YEAR_MONTH', '0000-01', 'FEWER_TRANSFERS', ?,
                    'CURRENT', CURRENT_TIMESTAMP)
                """, UUID.randomUUID(), project.getId(), "0".repeat(64)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void databaseRejectsProjectScopeWithMonthKey() {
        Project project = saveProject(ProjectType.EVENT, 1);
        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO settlement_runs (id, project_id, run_sequence, scope_type, scope_key,
                    strategy, source_state_fingerprint, state, generated_at)
                VALUES (?, ?, 1, 'PROJECT', '2026-09', 'FEWER_TRANSFERS', ?,
                    'CURRENT', CURRENT_TIMESTAMP)
                """, UUID.randomUUID(), project.getId(), "0".repeat(64)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private UpdateExpenseRequest updateRequest(ProjectMember payer, ProjectMember participant,
            long amount, LocalDate paidOn, long version) {
        return new UpdateExpenseRequest(payer.getId(), List.of(participant.getId()),
                BigDecimal.valueOf(amount), "Expense", ExpenseCategory.OTHER, null, paidOn, version);
    }

    private void assertNoCurrentAndAllStale(Project project, int expectedStale) {
        assertThat(settlementRunRepository.findAllByProject_IdAndState(
                project.getId(),
                SettlementRunState.CURRENT
        )).isEmpty();
        assertThat(settlementRunRepository.findAllByProject_IdAndState(
                project.getId(),
                SettlementRunState.STALE
        )).hasSize(expectedStale)
                .allSatisfy(run -> assertThat(run.getStaledAt()).isNotNull());
    }

    private void archive(Project project) {
        jdbcTemplate.update(
                """
                UPDATE projects
                SET status = 'ARCHIVED', archived_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                project.getId()
        );
        entityManager.clear();
    }

    private CreateExpenseRequest request(
            ProjectMember payer,
            List<ProjectMember> participants,
            long amount
    ) {
        return request(payer, participants, amount, LocalDate.of(2026, 9, 1));
    }

    private CreateExpenseRequest request(
            ProjectMember payer,
            List<ProjectMember> participants,
            long amount,
            LocalDate paidOn
    ) {
        return new CreateExpenseRequest(
                payer.getId(),
                participants.stream().map(ProjectMember::getId).toList(),
                BigDecimal.valueOf(amount),
                "Expense",
                ExpenseCategory.OTHER,
                null,
                paidOn
        );
    }

    private Project saveProject(ProjectType type, int roundingUnit) {
        return projectRepository.saveAndFlush(
                new Project(randomToken(), "Project", null, type, roundingUnit)
        );
    }

    private ProjectMember saveMember(Project project, String name, int displayOrder) {
        return projectMemberRepository.saveAndFlush(
                new ProjectMember(project, name, displayOrder)
        );
    }

    private static String randomToken() {
        String characters = UUID.randomUUID().toString().replace("-", "")
                + UUID.randomUUID().toString().replace("-", "");
        return characters.substring(0, 43);
    }
}
