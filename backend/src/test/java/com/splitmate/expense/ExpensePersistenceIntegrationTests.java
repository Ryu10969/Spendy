package com.splitmate.expense;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

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

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;

@SpringBootTest
@ActiveProfiles("local")
@Transactional
@EnabledIfEnvironmentVariable(
        named = "SPLITMATE_POSTGRES_INTEGRATION_TEST",
        matches = "true",
        disabledReason = "Requires the Docker PostgreSQL integration-test environment."
)
class ExpensePersistenceIntegrationTests {

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private ProjectMemberRepository projectMemberRepository;

    @Autowired
    private ExpenseRepository expenseRepository;

    @Autowired
    private ExpenseParticipantRepository expenseParticipantRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Test
    void flywayCreatesExpenseTablesAndOnlyApprovedIndexes() {
        Integer appliedMigrationCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM flyway_schema_history WHERE version = '2' AND success",
                Integer.class
        );
        String expensesTable = jdbcTemplate.queryForObject(
                "SELECT to_regclass('public.expenses')::text",
                String.class
        );
        String participantsTable = jdbcTemplate.queryForObject(
                "SELECT to_regclass('public.expense_participants')::text",
                String.class
        );
        List<String> expenseIndexes = jdbcTemplate.queryForList(
                """
                SELECT indexname
                FROM pg_indexes
                WHERE schemaname = 'public' AND tablename = 'expenses'
                ORDER BY indexname
                """,
                String.class
        );
        List<String> participantIndexes = jdbcTemplate.queryForList(
                """
                SELECT indexname
                FROM pg_indexes
                WHERE schemaname = 'public' AND tablename = 'expense_participants'
                ORDER BY indexname
                """,
                String.class
        );

        assertThat(appliedMigrationCount).isEqualTo(1);
        assertThat(expensesTable).isEqualTo("expenses");
        assertThat(participantsTable).isEqualTo("expense_participants");
        assertThat(expenseIndexes).containsExactly("idx_expenses_project_id", "pk_expenses");
        assertThat(participantIndexes).containsExactly(
                "pk_expense_participants",
                "uq_expense_participants_expense_allocation_order",
                "uq_expense_participants_expense_member"
        );
    }

    @Test
    void savesExpenseAndHistoricalParticipantAllocations() {
        Project project = saveProject();
        ProjectMember payer = saveMember(project, "Payer", 1);
        ProjectMember participantOne = saveMember(project, "One", 2);
        ProjectMember participantTwo = saveMember(project, "Two", 3);
        Expense expense = expenseRepository.saveAndFlush(new Expense(
                project,
                payer,
                1_001,
                "Dinner",
                ExpenseCategory.FOOD,
                "Shared meal",
                LocalDate.of(2026, 8, 25)
        ));
        expenseParticipantRepository.save(new ExpenseParticipant(expense, participantTwo, 500, 2));
        expenseParticipantRepository.save(new ExpenseParticipant(expense, participantOne, 501, 1));
        expenseParticipantRepository.flush();

        Expense found = expenseRepository.findById(expense.getId()).orElseThrow();
        List<ExpenseParticipant> participants =
                expenseParticipantRepository.findAllByExpense_IdOrderByAllocationOrderAsc(expense.getId());

        assertThat(found.getId()).isNotNull();
        assertThat(found.getProject().getId()).isEqualTo(project.getId());
        assertThat(found.getPayerMember().getId()).isEqualTo(payer.getId());
        assertThat(found.getAmount()).isEqualTo(1_001);
        assertThat(found.getContent()).isEqualTo("Dinner");
        assertThat(found.getCategory()).isEqualTo(ExpenseCategory.FOOD);
        assertThat(found.getNote()).isEqualTo("Shared meal");
        assertThat(found.getPaidOn()).isEqualTo(LocalDate.of(2026, 8, 25));
        assertThat(found.getVersion()).isZero();
        assertThat(found.getCreatedAt()).isNotNull();
        assertThat(found.getUpdatedAt()).isNotNull();
        assertThat(participants)
                .extracting(ExpenseParticipant::getAllocatedShare)
                .containsExactly(501L, 500L);
        assertThat(participants)
                .extracting(ExpenseParticipant::getAllocationOrder)
                .containsExactly(1, 2);
        assertThat(participants)
                .extracting(participant -> participant.getMember().getId())
                .containsExactly(participantOne.getId(), participantTwo.getId());
        assertThat(participants).allSatisfy(participant -> assertThat(participant.getId()).isNotNull());
    }

    @Test
    void persistsNullableCategoryAndNote() {
        Project project = saveProject();
        ProjectMember payer = saveMember(project, "Payer", 1);

        Expense expense = expenseRepository.saveAndFlush(new Expense(
                project,
                payer,
                100,
                "Uncategorized",
                null,
                null,
                LocalDate.of(2026, 8, 25)
        ));

        assertThat(expense.getCategory()).isNull();
        assertThat(expense.getNote()).isNull();
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void forceIncrementUsesExpenseOptimisticLockVersion() {
        TransactionTemplate transactionTemplate = new TransactionTemplate(transactionManager);
        UUID[] persistedIds = transactionTemplate.execute(status -> {
            Project project = saveProject();
            ProjectMember payer = saveMember(project, "Payer", 1);
            Expense expense = expenseRepository.saveAndFlush(new Expense(
                    project,
                    payer,
                    100,
                    "Versioned",
                    null,
                    null,
                    LocalDate.of(2026, 8, 25)
            ));

            return new UUID[]{project.getId(), payer.getId(), expense.getId()};
        });

        transactionTemplate.executeWithoutResult(status -> entityManager.lock(
                expenseRepository.findById(persistedIds[2]).orElseThrow(),
                LockModeType.OPTIMISTIC_FORCE_INCREMENT
        ));

        long persistedVersion = transactionTemplate.execute(status -> {
            Expense expense = expenseRepository.findById(persistedIds[2]).orElseThrow();
            long version = expense.getVersion();
            expenseRepository.delete(expense);
            expenseRepository.flush();
            projectMemberRepository.deleteById(persistedIds[1]);
            projectMemberRepository.flush();
            projectRepository.deleteById(persistedIds[0]);
            projectRepository.flush();
            return version;
        });

        assertThat(persistedVersion).isEqualTo(1);
    }

    @Test
    void rejectsExpenseWithMissingProject() {
        Project project = saveProject();
        ProjectMember payer = saveMember(project, "Payer", 1);

        assertThatThrownBy(() -> insertExpense(UUID.randomUUID(), payer.getId(), 100, "FOOD"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejectsExpenseWithMissingPayer() {
        Project project = saveProject();

        assertThatThrownBy(() -> insertExpense(project.getId(), UUID.randomUUID(), 100, "FOOD"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void ordinaryForeignKeysPermitCrossProjectReferencesForTransactionalValidation() {
        Project expenseProject = saveProject();
        Project payerProject = projectRepository.saveAndFlush(
                new Project("B".repeat(43), "Other", null, ProjectType.EVENT, 1)
        );
        ProjectMember otherProjectMember = saveMember(payerProject, "Other member", 1);

        UUID expenseId = insertExpense(expenseProject.getId(), otherProjectMember.getId(), 100, "OTHER");
        insertParticipant(expenseId, otherProjectMember.getId(), 100, 1);

        assertThat(expenseRepository.findById(expenseId)).isPresent();
    }

    @Test
    void rejectsInvalidExpenseValues() {
        Project project = saveProject();
        ProjectMember payer = saveMember(project, "Payer", 1);

        assertThatThrownBy(() -> insertExpense(project.getId(), payer.getId(), 0, "FOOD"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejectsBlankExpenseContent() {
        Project project = saveProject();
        ProjectMember payer = saveMember(project, "Payer", 1);

        assertThatThrownBy(() -> jdbcTemplate.update(
                expenseInsertSql(),
                UUID.randomUUID(),
                project.getId(),
                payer.getId(),
                100L,
                "\t\n",
                "FOOD"
        )).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejectsExpenseContentOverApprovedLimit() {
        Project project = saveProject();
        ProjectMember payer = saveMember(project, "Payer", 1);

        assertThatThrownBy(() -> expenseRepository.saveAndFlush(new Expense(
                project,
                payer,
                100,
                "C".repeat(101),
                null,
                null,
                LocalDate.of(2026, 8, 25)
        ))).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejectsExpenseNoteOverApprovedLimit() {
        Project project = saveProject();
        ProjectMember payer = saveMember(project, "Payer", 1);

        assertThatThrownBy(() -> expenseRepository.saveAndFlush(new Expense(
                project,
                payer,
                100,
                "Expense",
                null,
                "N".repeat(1_001),
                LocalDate.of(2026, 8, 25)
        ))).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejectsUnapprovedExpenseCategory() {
        Project project = saveProject();
        ProjectMember payer = saveMember(project, "Payer", 1);

        assertThatThrownBy(() -> insertExpense(project.getId(), payer.getId(), 100, "HOUSING"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejectsParticipantWithMissingExpense() {
        Project project = saveProject();
        ProjectMember member = saveMember(project, "Member", 1);

        assertThatThrownBy(() -> insertParticipant(
                UUID.randomUUID(),
                member.getId(),
                100,
                1
        )).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejectsParticipantWithMissingMember() {
        Project project = saveProject();
        ProjectMember payer = saveMember(project, "Payer", 1);
        Expense expense = expenseRepository.saveAndFlush(new Expense(
                project,
                payer,
                100,
                "Expense",
                null,
                null,
                LocalDate.of(2026, 8, 25)
        ));

        assertThatThrownBy(() -> insertParticipant(
                expense.getId(),
                UUID.randomUUID(),
                100,
                1
        )).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejectsNegativeAllocatedShare() {
        Project project = saveProject();
        ProjectMember member = saveMember(project, "Member", 1);
        Expense expense = expenseRepository.saveAndFlush(new Expense(
                project,
                member,
                100,
                "Expense",
                null,
                null,
                LocalDate.of(2026, 8, 25)
        ));

        assertThatThrownBy(() -> insertParticipant(expense.getId(), member.getId(), -1, 1))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejectsAllocationOrderBelowOne() {
        Project project = saveProject();
        ProjectMember member = saveMember(project, "Member", 1);
        Expense expense = expenseRepository.saveAndFlush(new Expense(
                project,
                member,
                100,
                "Expense",
                null,
                null,
                LocalDate.of(2026, 8, 25)
        ));

        assertThatThrownBy(() -> insertParticipant(expense.getId(), member.getId(), 100, 0))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejectsDuplicateParticipantMember() {
        Project project = saveProject();
        ProjectMember member = saveMember(project, "Member", 1);
        Expense expense = expenseRepository.saveAndFlush(new Expense(
                project,
                member,
                100,
                "Expense",
                null,
                null,
                LocalDate.of(2026, 8, 25)
        ));
        insertParticipant(expense.getId(), member.getId(), 50, 1);

        assertThatThrownBy(() -> insertParticipant(expense.getId(), member.getId(), 50, 2))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejectsDuplicateAllocationOrder() {
        Project project = saveProject();
        ProjectMember first = saveMember(project, "First", 1);
        ProjectMember second = saveMember(project, "Second", 2);
        Expense expense = expenseRepository.saveAndFlush(new Expense(
                project,
                first,
                100,
                "Expense",
                null,
                null,
                LocalDate.of(2026, 8, 25)
        ));
        insertParticipant(expense.getId(), first.getId(), 50, 1);

        assertThatThrownBy(() -> insertParticipant(expense.getId(), second.getId(), 50, 1))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void expenseDeletionRequiresParticipantsToBeRemovedFirst() {
        Project project = saveProject();
        ProjectMember member = saveMember(project, "Member", 1);
        Expense expense = expenseRepository.saveAndFlush(new Expense(
                project,
                member,
                100,
                "Expense",
                null,
                null,
                LocalDate.of(2026, 8, 25)
        ));
        expenseParticipantRepository.saveAndFlush(
                new ExpenseParticipant(expense, member, 100, 1)
        );

        assertThatThrownBy(() -> jdbcTemplate.update(
                "DELETE FROM expenses WHERE id = ?",
                expense.getId()
        )).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void deletesParticipantsBeforeDeletingExpense() {
        Project project = saveProject();
        ProjectMember member = saveMember(project, "Member", 1);
        Expense expense = expenseRepository.saveAndFlush(new Expense(
                project,
                member,
                100,
                "Expense",
                null,
                null,
                LocalDate.of(2026, 8, 25)
        ));
        ExpenseParticipant participant = expenseParticipantRepository.saveAndFlush(
                new ExpenseParticipant(expense, member, 100, 1)
        );

        expenseParticipantRepository.delete(participant);
        expenseParticipantRepository.flush();
        expenseRepository.delete(expense);
        expenseRepository.flush();

        assertThat(expenseRepository.findById(expense.getId())).isEmpty();
    }

    private Project saveProject() {
        return projectRepository.saveAndFlush(
                new Project(randomToken(), "Project", null, ProjectType.EVENT, 1)
        );
    }

    private ProjectMember saveMember(Project project, String name, int displayOrder) {
        return projectMemberRepository.saveAndFlush(
                new ProjectMember(project, name, displayOrder)
        );
    }

    private UUID insertExpense(
            UUID projectId,
            UUID payerMemberId,
            long amount,
            String category
    ) {
        UUID expenseId = UUID.randomUUID();
        jdbcTemplate.update(
                expenseInsertSql(),
                expenseId,
                projectId,
                payerMemberId,
                amount,
                "Expense",
                category
        );
        return expenseId;
    }

    private String expenseInsertSql() {
        return """
                INSERT INTO expenses (
                    id,
                    project_id,
                    payer_member_id,
                    amount,
                    content,
                    category,
                    paid_on,
                    version,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_DATE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """;
    }

    private void insertParticipant(
            UUID expenseId,
            UUID memberId,
            long allocatedShare,
            int allocationOrder
    ) {
        jdbcTemplate.update(
                """
                INSERT INTO expense_participants (
                    id,
                    expense_id,
                    member_id,
                    allocated_share,
                    allocation_order
                )
                VALUES (?, ?, ?, ?, ?)
                """,
                UUID.randomUUID(),
                expenseId,
                memberId,
                allocatedShare,
                allocationOrder
        );
    }

    private static String randomToken() {
        String tokenCharacters = UUID.randomUUID().toString().replace("-", "")
                + UUID.randomUUID().toString().replace("-", "");
        return tokenCharacters.substring(0, 43);
    }
}
