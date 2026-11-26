package com.splitmate.expense.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

import com.splitmate.expense.domain.Expense;
import com.splitmate.expense.domain.ExpenseParticipant;
import com.splitmate.expense.dto.UpdateExpenseRequest;
import com.splitmate.expense.repository.ExpenseParticipantRepository;
import com.splitmate.expense.repository.ExpenseRepository;
import com.splitmate.project.domain.Project;
import com.splitmate.project.domain.ProjectMember;
import com.splitmate.project.domain.ProjectStatus;
import com.splitmate.project.repository.ProjectMemberRepository;
import com.splitmate.project.repository.ProjectRepository;
import com.splitmate.settlement.repository.SettlementRunRepository;

@ExtendWith(MockitoExtension.class)
class ExpenseServiceTests {

    private static final String PUBLIC_TOKEN = "A".repeat(43);

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private ProjectMemberRepository projectMemberRepository;

    @Mock
    private ExpenseRepository expenseRepository;

    @Mock
    private ExpenseParticipantRepository expenseParticipantRepository;

    @Mock
    private SettlementRunRepository settlementRunRepository;

    private ExpenseService expenseService;

    @BeforeEach
    void setUp() {
        expenseService = new ExpenseService(
                projectRepository,
                projectMemberRepository,
                expenseRepository,
                expenseParticipantRepository,
                settlementRunRepository
        );
    }

    @Test
    void rejectsExplicitlyStaleVersionBeforeMemberOrParticipantAccess() {
        UUID projectId = UUID.randomUUID();
        UUID expenseId = UUID.randomUUID();
        Project project = project(projectId);
        Expense expense = mock(Expense.class);
        when(expense.getVersion()).thenReturn(2L);
        when(projectRepository.findForUpdateByPublicTokenAndDeletedAtIsNull(PUBLIC_TOKEN))
                .thenReturn(Optional.of(project));
        when(expenseRepository.findByIdAndProject_Id(expenseId, projectId))
                .thenReturn(Optional.of(expense));

        assertThatThrownBy(() -> expenseService.updateExpense(
                PUBLIC_TOKEN,
                expenseId,
                updateRequest(UUID.randomUUID(), UUID.randomUUID(), 1)
        )).isInstanceOf(ExpenseVersionConflictException.class);

        verifyNoInteractions(
                projectMemberRepository,
                expenseParticipantRepository,
                settlementRunRepository
        );
    }

    @Test
    void convertsJpaOptimisticLockFailureToExpenseVersionConflict() {
        UUID projectId = UUID.randomUUID();
        UUID expenseId = UUID.randomUUID();
        UUID payerId = UUID.randomUUID();
        UUID participantId = UUID.randomUUID();
        Project project = project(projectId);
        Expense expense = mock(Expense.class);
        ProjectMember payer = mock(ProjectMember.class);
        ProjectMember participant = mock(ProjectMember.class);
        ExpenseParticipant existingParticipant = mock(ExpenseParticipant.class);

        when(expense.getVersion()).thenReturn(0L);
        when(expense.getAmount()).thenReturn(100L);
        when(expense.getPayerMember()).thenReturn(payer);
        when(payer.getId()).thenReturn(payerId);
        when(payer.isActive()).thenReturn(true);
        when(participant.getId()).thenReturn(participantId);
        when(participant.isActive()).thenReturn(true);
        when(projectRepository.findForUpdateByPublicTokenAndDeletedAtIsNull(PUBLIC_TOKEN))
                .thenReturn(Optional.of(project));
        when(expenseRepository.findByIdAndProject_Id(expenseId, projectId))
                .thenReturn(Optional.of(expense));
        when(projectMemberRepository.findByIdAndProject_Id(payerId, projectId))
                .thenReturn(Optional.of(payer));
        when(projectMemberRepository.findByIdAndProject_Id(participantId, projectId))
                .thenReturn(Optional.of(participant));
        when(existingParticipant.getMember()).thenReturn(participant);
        when(expenseParticipantRepository.findAllByExpense_IdOrderByAllocationOrderAsc(expenseId))
                .thenReturn(List.of(existingParticipant));
        when(expenseRepository.saveAndFlush(expense))
                .thenThrow(new ObjectOptimisticLockingFailureException(Expense.class, expenseId));

        assertThatThrownBy(() -> expenseService.updateExpense(
                PUBLIC_TOKEN,
                expenseId,
                updateRequest(payerId, participantId, 0)
        )).isInstanceOf(ExpenseVersionConflictException.class)
                .hasNoCause();
    }

    private Project project(UUID projectId) {
        Project project = mock(Project.class);
        when(project.getId()).thenReturn(projectId);
        when(project.getStatus()).thenReturn(ProjectStatus.ACTIVE);
        return project;
    }

    private UpdateExpenseRequest updateRequest(
            UUID payerId,
            UUID participantId,
            long version
    ) {
        return new UpdateExpenseRequest(
                payerId,
                List.of(participantId),
                BigDecimal.valueOf(100),
                "Updated",
                null,
                null,
                LocalDate.of(2026, 8, 26),
                version
        );
    }
}
