package com.splitmate.expense;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.splitmate.expense.domain.ExpenseCategory;
import com.splitmate.expense.dto.CreateExpenseRequest;
import com.splitmate.expense.dto.ExpenseResponse;
import com.splitmate.expense.dto.UpdateExpenseRequest;
import com.splitmate.expense.repository.ExpenseParticipantRepository;
import com.splitmate.expense.repository.ExpenseRepository;
import com.splitmate.expense.service.ExpenseNotFoundException;
import com.splitmate.expense.service.ExpenseService;
import com.splitmate.expense.service.ExpenseValidationException;
import com.splitmate.expense.service.ExpenseVersionConflictException;
import com.splitmate.project.domain.Project;
import com.splitmate.project.domain.ProjectMember;
import com.splitmate.project.domain.ProjectType;
import com.splitmate.project.repository.ProjectMemberRepository;
import com.splitmate.project.repository.ProjectRepository;
import com.splitmate.project.service.MemberInactiveException;
import com.splitmate.project.service.MemberNotFoundException;
import com.splitmate.project.service.ProjectArchivedException;
import com.splitmate.project.service.ProjectNotFoundException;
import com.splitmate.project.service.ProjectService;

import jakarta.persistence.EntityManager;

@SpringBootTest
@ActiveProfiles("local")
@Transactional
@EnabledIfEnvironmentVariable(
        named = "SPLITMATE_POSTGRES_INTEGRATION_TEST",
        matches = "true",
        disabledReason = "Requires the Docker PostgreSQL integration-test environment."
)
class ExpenseCrudIntegrationTests {

    @Autowired
    private ExpenseService expenseService;

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private ProjectMemberRepository projectMemberRepository;

    @Autowired
    private ProjectService projectService;

    @Autowired
    private ExpenseRepository expenseRepository;

    @Autowired
    private ExpenseParticipantRepository expenseParticipantRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EntityManager entityManager;

    @Test
    void listsEmptyExpensesAndRejectsMissingProject() {
        Project project = saveProject();

        assertThat(expenseService.getExpenses(project.getPublicToken()).items()).isEmpty();
        assertThatThrownBy(() -> expenseService.getExpenses("Z".repeat(43)))
                .isInstanceOf(ProjectNotFoundException.class);
    }

    @Test
    void listsExpensesInApprovedOrderAndParticipantsByPersistedAllocationOrder() {
        Project project = saveProject();
        ProjectMember memberOne = saveMember(project, "One", 1);
        ProjectMember memberTwo = saveMember(project, "Two", 2);
        UUID firstId = uuid("00000000-0000-0000-0000-000000000001");
        UUID secondId = uuid("00000000-0000-0000-0000-000000000002");
        UUID olderId = uuid("00000000-0000-0000-0000-000000000003");
        UUID newestDateId = uuid("00000000-0000-0000-0000-000000000004");
        Instant tieTimestamp = Instant.parse("2026-08-25T12:00:00Z");

        insertExpense(olderId, project, memberOne, LocalDate.of(2026, 8, 25),
                Instant.parse("2026-08-25T11:00:00Z"));
        insertExpense(secondId, project, memberOne, LocalDate.of(2026, 8, 25), tieTimestamp);
        insertExpense(firstId, project, memberOne, LocalDate.of(2026, 8, 25), tieTimestamp);
        insertExpense(newestDateId, project, memberOne, LocalDate.of(2026, 8, 26),
                Instant.parse("2026-08-24T12:00:00Z"));
        insertParticipant(firstId, memberTwo.getId(), 50, 2);
        insertParticipant(firstId, memberOne.getId(), 50, 1);
        insertParticipant(secondId, memberOne.getId(), 100, 1);
        insertParticipant(olderId, memberOne.getId(), 100, 1);
        insertParticipant(newestDateId, memberOne.getId(), 100, 1);
        entityManager.clear();

        List<ExpenseResponse> items = expenseService.getExpenses(project.getPublicToken()).items();

        assertThat(items)
                .extracting(ExpenseResponse::id)
                .containsExactly(newestDateId, firstId, secondId, olderId);
        assertThat(items.get(1).participants())
                .extracting(
                        participant -> participant.memberId(),
                        participant -> participant.allocationOrder()
                )
                .containsExactly(tuple(memberOne.getId(), 1), tuple(memberTwo.getId(), 2));
    }

    @Test
    void createsExpenseWithExactRemainderAllocationAndPayerOutsideParticipants() {
        Project project = saveProject();
        ProjectMember payer = saveMember(project, "Payer", 4);
        ProjectMember first = saveMember(project, "First", 1);
        ProjectMember second = saveMember(project, "Second", 2);
        ProjectMember third = saveMember(project, "Third", 3);

        ExpenseResponse response = expenseService.createExpense(
                project.getPublicToken(),
                createRequest(payer, List.of(third, first, second), 1_000)
        );

        assertThat(response.payerMemberId()).isEqualTo(payer.getId());
        assertThat(response.participants())
                .extracting(
                        participant -> participant.memberId(),
                        participant -> participant.allocatedShare(),
                        participant -> participant.allocationOrder()
                )
                .containsExactly(
                        tuple(first.getId(), 334L, 1),
                        tuple(second.getId(), 333L, 2),
                        tuple(third.getId(), 333L, 3)
                );
        assertThat(response.participants())
                .extracting(participant -> participant.memberId())
                .doesNotContain(payer.getId());
        assertThat(expenseParticipantRepository
                .findAllByExpense_IdOrderByAllocationOrderAsc(response.id()))
                .extracting(participant -> participant.getAllocatedShare())
                .containsExactly(334L, 333L, 333L);
    }

    @Test
    void rejectsDuplicateMissingForeignAndInactiveMembersWithoutCreatingExpense() {
        long initialExpenseCount = expenseRepository.count();
        Project project = saveProject();
        ProjectMember payer = saveMember(project, "Payer", 1);
        ProjectMember participant = saveMember(project, "Participant", 2);
        Project foreignProject = saveProject();
        ProjectMember foreignMember = saveMember(foreignProject, "Foreign", 1);

        assertThatThrownBy(() -> expenseService.createExpense(
                project.getPublicToken(),
                createRequest(payer, List.of(participant, participant), 100)
        )).isInstanceOf(ExpenseValidationException.class);
        assertThatThrownBy(() -> expenseService.createExpense(
                project.getPublicToken(),
                request(payer.getId(), List.of(UUID.randomUUID()), 100)
        )).isInstanceOf(MemberNotFoundException.class);
        assertThatThrownBy(() -> expenseService.createExpense(
                project.getPublicToken(),
                request(foreignMember.getId(), List.of(participant.getId()), 100)
        )).isInstanceOf(MemberNotFoundException.class);

        jdbcTemplate.update(
                "UPDATE project_members SET active = FALSE WHERE id = ?",
                participant.getId()
        );
        entityManager.clear();
        assertThatThrownBy(() -> expenseService.createExpense(
                project.getPublicToken(),
                request(payer.getId(), List.of(participant.getId()), 100)
        )).isInstanceOf(MemberInactiveException.class);
        jdbcTemplate.update(
                "UPDATE project_members SET active = FALSE WHERE id = ?",
                payer.getId()
        );
        entityManager.clear();
        assertThatThrownBy(() -> expenseService.createExpense(
                project.getPublicToken(),
                request(payer.getId(), List.of(foreignMember.getId()), 100)
        )).isInstanceOf(MemberInactiveException.class);
        assertThat(expenseRepository.count()).isEqualTo(initialExpenseCount);
    }

    @Test
    void updatesFullStateReplacesAllocationsClearsNullableFieldsAndIncrementsVersion() {
        Project project = saveProject();
        ProjectMember originalPayer = saveMember(project, "Original payer", 4);
        ProjectMember newPayer = saveMember(project, "New payer", 3);
        ProjectMember first = saveMember(project, "First", 1);
        ProjectMember second = saveMember(project, "Second", 2);
        ExpenseResponse created = expenseService.createExpense(
                project.getPublicToken(),
                createRequest(originalPayer, List.of(first, second), 100)
        );

        ExpenseResponse updated = expenseService.updateExpense(
                project.getPublicToken(),
                created.id(),
                new UpdateExpenseRequest(
                        newPayer.getId(),
                        List.of(newPayer.getId(), first.getId()),
                        BigDecimal.valueOf(5),
                        "Updated",
                        null,
                        null,
                        LocalDate.of(2026, 8, 26),
                        created.version()
                )
        );

        assertThat(updated.payerMemberId()).isEqualTo(newPayer.getId());
        assertThat(updated.amount()).isEqualTo(5);
        assertThat(updated.content()).isEqualTo("Updated");
        assertThat(updated.category()).isNull();
        assertThat(updated.note()).isNull();
        assertThat(updated.paidOn()).isEqualTo(LocalDate.of(2026, 8, 26));
        assertThat(updated.version()).isEqualTo(created.version() + 1);
        assertThat(updated.participants())
                .extracting(
                        participant -> participant.memberId(),
                        participant -> participant.allocatedShare(),
                        participant -> participant.allocationOrder()
                )
                .containsExactly(
                        tuple(first.getId(), 3L, 1),
                        tuple(newPayer.getId(), 2L, 2)
                );
        assertThat(expenseParticipantRepository
                .findAllByExpense_IdOrderByAllocationOrderAsc(created.id()))
                .hasSize(2);
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void participantOnlyUpdateIncrementsVersionAndRejectsStaleFollowUp() {
        Project project = saveProject();
        ProjectMember payer = saveMember(project, "Payer", 1);
        ProjectMember originalParticipant = saveMember(project, "Original", 2);
        ProjectMember replacementOne = saveMember(project, "Replacement one", 3);
        ProjectMember replacementTwo = saveMember(project, "Replacement two", 4);
        ExpenseResponse created = null;

        try {
            created = expenseService.createExpense(
                    project.getPublicToken(),
                    createRequest(payer, List.of(originalParticipant), 100)
            );
            long initialVersion = created.version();
            UpdateExpenseRequest participantOnlyRequest = new UpdateExpenseRequest(
                    payer.getId(),
                    List.of(replacementTwo.getId(), replacementOne.getId()),
                    BigDecimal.valueOf(100),
                    "Dinner",
                    ExpenseCategory.FOOD,
                    "Shared meal",
                    LocalDate.of(2026, 8, 25),
                    initialVersion
            );

            ExpenseResponse updated = expenseService.updateExpense(
                    project.getPublicToken(),
                    created.id(),
                    participantOnlyRequest
            );

            assertThat(updated.version()).isEqualTo(initialVersion + 1);
            assertThat(updated.participants())
                    .extracting(
                            participant -> participant.memberId(),
                            participant -> participant.allocatedShare(),
                            participant -> participant.allocationOrder()
                    )
                    .containsExactly(
                            tuple(replacementOne.getId(), 50L, 1),
                            tuple(replacementTwo.getId(), 50L, 2)
                    );
            assertThat(expenseRepository.findById(created.id()).orElseThrow().getVersion())
                    .isEqualTo(initialVersion + 1);
            assertThat(expenseParticipantRepository
                    .findAllByExpense_IdOrderByAllocationOrderAsc(created.id()))
                    .extracting(
                            participant -> participant.getMember().getId(),
                            participant -> participant.getAllocatedShare(),
                            participant -> participant.getAllocationOrder()
                    )
                    .containsExactly(
                            tuple(replacementOne.getId(), 50L, 1),
                            tuple(replacementTwo.getId(), 50L, 2)
                    );

            UpdateExpenseRequest staleRequest = new UpdateExpenseRequest(
                    payer.getId(),
                    List.of(originalParticipant.getId()),
                    BigDecimal.valueOf(100),
                    "Dinner",
                    ExpenseCategory.FOOD,
                    "Shared meal",
                    LocalDate.of(2026, 8, 25),
                    initialVersion
            );
            UUID expenseId = created.id();
            assertThatThrownBy(() -> expenseService.updateExpense(
                    project.getPublicToken(),
                    expenseId,
                    staleRequest
            )).isInstanceOf(ExpenseVersionConflictException.class);

            assertThat(expenseRepository.findById(created.id()).orElseThrow().getVersion())
                    .isEqualTo(initialVersion + 1);
            assertThat(expenseParticipantRepository
                    .findAllByExpense_IdOrderByAllocationOrderAsc(created.id()))
                    .extracting(
                            participant -> participant.getMember().getId(),
                            participant -> participant.getAllocatedShare(),
                            participant -> participant.getAllocationOrder()
                    )
                    .containsExactly(
                            tuple(replacementOne.getId(), 50L, 1),
                            tuple(replacementTwo.getId(), 50L, 2)
                    );
        } finally {
            if (created != null && expenseRepository.existsById(created.id())) {
                expenseService.deleteExpense(project.getPublicToken(), created.id());
            }
            projectMemberRepository.deleteAllById(List.of(
                    payer.getId(),
                    originalParticipant.getId(),
                    replacementOne.getId(),
                    replacementTwo.getId()
            ));
            projectRepository.deleteById(project.getId());
        }
    }

    @Test
    void rejectsStaleVersionBeforeMutationAndPreservesPersistedState() {
        Project project = saveProject();
        ProjectMember payer = saveMember(project, "Payer", 1);
        ProjectMember participant = saveMember(project, "Participant", 2);
        ExpenseResponse created = expenseService.createExpense(
                project.getPublicToken(),
                createRequest(payer, List.of(participant), 100)
        );

        assertThatThrownBy(() -> expenseService.updateExpense(
                project.getPublicToken(),
                created.id(),
                new UpdateExpenseRequest(
                        payer.getId(),
                        List.of(participant.getId()),
                        BigDecimal.valueOf(200),
                        "Should not persist",
                        null,
                        null,
                        LocalDate.of(2026, 8, 26),
                        created.version() + 1
                )
        )).isInstanceOf(ExpenseVersionConflictException.class);

        assertThat(expenseRepository.findById(created.id()).orElseThrow().getAmount()).isEqualTo(100);
        assertThat(expenseParticipantRepository
                .findAllByExpense_IdOrderByAllocationOrderAsc(created.id()))
                .singleElement()
                .satisfies(allocation -> assertThat(allocation.getAllocatedShare()).isEqualTo(100));
    }

    @Test
    void scopesExpenseAndMemberLookupsToAddressedProject() {
        Project project = saveProject();
        ProjectMember payer = saveMember(project, "Payer", 1);
        ProjectMember participant = saveMember(project, "Participant", 2);
        ExpenseResponse expense = expenseService.createExpense(
                project.getPublicToken(),
                createRequest(payer, List.of(participant), 100)
        );
        Project foreignProject = saveProject();
        ProjectMember foreignMember = saveMember(foreignProject, "Foreign", 1);

        assertThatThrownBy(() -> expenseService.updateExpense(
                foreignProject.getPublicToken(),
                expense.id(),
                updateRequest(foreignMember, List.of(foreignMember), 100, 0)
        )).isInstanceOf(ExpenseNotFoundException.class);
        assertThatThrownBy(() -> expenseService.updateExpense(
                project.getPublicToken(),
                expense.id(),
                updateRequest(payer, List.of(foreignMember), 100, expense.version())
        )).isInstanceOf(MemberNotFoundException.class);
        assertThat(expenseRepository.findById(expense.id()).orElseThrow().getAmount()).isEqualTo(100);
        assertThatThrownBy(() -> expenseService.updateExpense(
                project.getPublicToken(),
                UUID.randomUUID(),
                updateRequest(payer, List.of(participant), 100, 0)
        )).isInstanceOf(ExpenseNotFoundException.class);

        jdbcTemplate.update(
                "UPDATE project_members SET active = FALSE WHERE id = ?",
                participant.getId()
        );
        entityManager.clear();
        assertThatThrownBy(() -> expenseService.updateExpense(
                project.getPublicToken(),
                expense.id(),
                updateRequest(payer, List.of(participant), 200, expense.version())
        )).isInstanceOf(MemberInactiveException.class);
        assertThat(expenseRepository.findById(expense.id()).orElseThrow().getAmount()).isEqualTo(100);
        assertThatThrownBy(() -> expenseService.deleteExpense(
                foreignProject.getPublicToken(),
                expense.id()
        )).isInstanceOf(ExpenseNotFoundException.class);
    }

    @Test
    void archivedProjectRejectsCreateUpdateAndDelete() {
        Project project = saveProject();
        ProjectMember payer = saveMember(project, "Payer", 1);
        ProjectMember participant = saveMember(project, "Participant", 2);
        ExpenseResponse expense = expenseService.createExpense(
                project.getPublicToken(),
                createRequest(payer, List.of(participant), 100)
        );
        jdbcTemplate.update(
                """
                UPDATE projects
                SET status = 'ARCHIVED', archived_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                project.getId()
        );
        entityManager.clear();

        assertThatThrownBy(() -> expenseService.createExpense(
                project.getPublicToken(),
                createRequest(payer, List.of(participant), 100)
        )).isInstanceOf(ProjectArchivedException.class);
        assertThatThrownBy(() -> expenseService.updateExpense(
                project.getPublicToken(),
                expense.id(),
                updateRequest(payer, List.of(participant), 100, expense.version())
        )).isInstanceOf(ProjectArchivedException.class);
        assertThatThrownBy(() -> expenseService.deleteExpense(
                project.getPublicToken(),
                expense.id()
        )).isInstanceOf(ProjectArchivedException.class);
        assertThat(expenseRepository.findById(expense.id())).isPresent();
    }

    @Test
    void archiveEndpointLeavesExpenseMutationsRejected() {
        Project project = saveProject();
        ProjectMember payer = saveMember(project, "Payer", 1);
        ProjectMember participant = saveMember(project, "Participant", 2);
        ExpenseResponse expense = expenseService.createExpense(
                project.getPublicToken(),
                createRequest(payer, List.of(participant), 100)
        );
        projectService.archiveProject(project.getPublicToken());
        entityManager.clear();

        assertThatThrownBy(() -> expenseService.createExpense(
                project.getPublicToken(),
                createRequest(payer, List.of(participant), 100)
        )).isInstanceOf(ProjectArchivedException.class);
        assertThatThrownBy(() -> expenseService.updateExpense(
                project.getPublicToken(),
                expense.id(),
                updateRequest(payer, List.of(participant), 100, expense.version())
        )).isInstanceOf(ProjectArchivedException.class);
        assertThatThrownBy(() -> expenseService.deleteExpense(
                project.getPublicToken(),
                expense.id()
        )).isInstanceOf(ProjectArchivedException.class);
        assertThat(expenseRepository.findById(expense.id())).isPresent();
        assertThat(expenseService.getExpenses(project.getPublicToken()).items())
                .extracting(ExpenseResponse::id)
                .containsExactly(expense.id());
    }

    @Test
    void deletesParticipantsBeforeExpenseAndRejectsMissingExpense() {
        Project project = saveProject();
        ProjectMember payer = saveMember(project, "Payer", 1);
        ProjectMember participant = saveMember(project, "Participant", 2);
        ExpenseResponse expense = expenseService.createExpense(
                project.getPublicToken(),
                createRequest(payer, List.of(participant), 100)
        );

        expenseService.deleteExpense(project.getPublicToken(), expense.id());

        assertThat(expenseParticipantRepository
                .findAllByExpense_IdOrderByAllocationOrderAsc(expense.id())).isEmpty();
        assertThat(expenseRepository.findById(expense.id())).isEmpty();
        assertThatThrownBy(() -> expenseService.deleteExpense(
                project.getPublicToken(),
                UUID.randomUUID()
        )).isInstanceOf(ExpenseNotFoundException.class);
    }

    private CreateExpenseRequest createRequest(
            ProjectMember payer,
            List<ProjectMember> participants,
            long amount
    ) {
        return request(
                payer.getId(),
                participants.stream().map(ProjectMember::getId).toList(),
                amount
        );
    }

    private CreateExpenseRequest request(
            UUID payerId,
            List<UUID> participantIds,
            long amount
    ) {
        return new CreateExpenseRequest(
                payerId,
                participantIds,
                BigDecimal.valueOf(amount),
                "Dinner",
                ExpenseCategory.FOOD,
                "Shared meal",
                LocalDate.of(2026, 8, 25)
        );
    }

    private UpdateExpenseRequest updateRequest(
            ProjectMember payer,
            List<ProjectMember> participants,
            long amount,
            long version
    ) {
        return new UpdateExpenseRequest(
                payer.getId(),
                participants.stream().map(ProjectMember::getId).toList(),
                BigDecimal.valueOf(amount),
                "Updated",
                ExpenseCategory.OTHER,
                "Updated note",
                LocalDate.of(2026, 8, 26),
                version
        );
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

    private void insertExpense(
            UUID id,
            Project project,
            ProjectMember payer,
            LocalDate paidOn,
            Instant createdAt
    ) {
        jdbcTemplate.update(
                """
                INSERT INTO expenses (
                    id, project_id, payer_member_id, amount, content, category,
                    paid_on, version, created_at, updated_at
                )
                VALUES (?, ?, ?, 100, 'Expense', 'OTHER', ?, 0, ?, ?)
                """,
                id,
                project.getId(),
                payer.getId(),
                paidOn,
                createdAt.atOffset(ZoneOffset.UTC),
                createdAt.atOffset(ZoneOffset.UTC)
        );
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
                    id, expense_id, member_id, allocated_share, allocation_order
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

    private static UUID uuid(String value) {
        return UUID.fromString(value);
    }

    private static String randomToken() {
        String tokenCharacters = UUID.randomUUID().toString().replace("-", "")
                + UUID.randomUUID().toString().replace("-", "");
        return tokenCharacters.substring(0, 43);
    }
}
