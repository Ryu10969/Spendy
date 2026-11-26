package com.splitmate.expense.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.splitmate.expense.domain.AllocationParticipant;
import com.splitmate.expense.domain.EqualSplitAllocator;
import com.splitmate.expense.domain.Expense;
import com.splitmate.expense.domain.ExpenseAllocation;
import com.splitmate.expense.domain.ExpenseParticipant;
import com.splitmate.expense.dto.CreateExpenseRequest;
import com.splitmate.expense.dto.ExpenseListResponse;
import com.splitmate.expense.dto.ExpenseParticipantResponse;
import com.splitmate.expense.dto.ExpenseResponse;
import com.splitmate.expense.dto.UpdateExpenseRequest;
import com.splitmate.expense.repository.ExpenseParticipantRepository;
import com.splitmate.expense.repository.ExpenseRepository;
import com.splitmate.project.domain.Project;
import com.splitmate.project.domain.ProjectMember;
import com.splitmate.project.domain.ProjectStatus;
import com.splitmate.project.domain.ProjectType;
import com.splitmate.project.repository.ProjectMemberRepository;
import com.splitmate.project.repository.ProjectRepository;
import com.splitmate.project.service.MemberInactiveException;
import com.splitmate.project.service.MemberNotFoundException;
import com.splitmate.project.service.ProjectArchivedException;
import com.splitmate.project.service.ProjectNotFoundException;
import com.splitmate.settlement.domain.SettlementRunState;
import com.splitmate.settlement.domain.SettlementScopeType;
import com.splitmate.settlement.repository.SettlementRunRepository;
import com.splitmate.settlement.service.SettlementScopeUnsupportedException;

@Service
public class ExpenseService {

    private final ProjectRepository projectRepository;
    private final ProjectMemberRepository projectMemberRepository;
    private final ExpenseRepository expenseRepository;
    private final ExpenseParticipantRepository expenseParticipantRepository;
    private final SettlementRunRepository settlementRunRepository;
    private final EqualSplitAllocator equalSplitAllocator = new EqualSplitAllocator();

    public ExpenseService(
            ProjectRepository projectRepository,
            ProjectMemberRepository projectMemberRepository,
            ExpenseRepository expenseRepository,
            ExpenseParticipantRepository expenseParticipantRepository,
            SettlementRunRepository settlementRunRepository
    ) {
        this.projectRepository = projectRepository;
        this.projectMemberRepository = projectMemberRepository;
        this.expenseRepository = expenseRepository;
        this.expenseParticipantRepository = expenseParticipantRepository;
        this.settlementRunRepository = settlementRunRepository;
    }

    @Transactional(readOnly = true)
    public ExpenseListResponse getExpenses(String publicToken) {
        return getExpenses(publicToken, null);
    }

    @Transactional(readOnly = true)
    public ExpenseListResponse getExpenses(String publicToken, YearMonth month) {
        Project project = findProject(publicToken);
        if (month != null && project.getType() != ProjectType.CONTINUOUS) {
            throw new SettlementScopeUnsupportedException();
        }
        List<Expense> expenses = month == null
                ? expenseRepository.findAllByProject_IdOrderByPaidOnDescCreatedAtDescIdAsc(project.getId())
                : expenseRepository.findAllByProject_IdAndPaidOnGreaterThanEqualAndPaidOnLessThanOrderByPaidOnDescCreatedAtDescIdAsc(
                        project.getId(), month.atDay(1), month.plusMonths(1).atDay(1));
        List<ExpenseResponse> items = expenses
                .stream()
                .map(expense -> toResponse(
                        expense,
                        expenseParticipantRepository
                                .findAllByExpense_IdOrderByAllocationOrderAsc(expense.getId())
                ))
                .toList();
        return new ExpenseListResponse(items);
    }

    @Transactional
    public ExpenseResponse createExpense(String publicToken, CreateExpenseRequest request) {
        Project project = findProjectForUpdate(publicToken);
        assertProjectMutable(project);
        assertUniqueParticipants(request.participantMemberIds());
        ProjectMember payer = findActiveMember(project, request.payerMemberId());
        List<ProjectMember> participants = findActiveMembers(project, request.participantMemberIds());
        long amount = request.amount().longValueExact();
        List<ExpenseAllocation> allocations = allocate(amount, participants);

        Expense expense = expenseRepository.saveAndFlush(new Expense(
                project,
                payer,
                amount,
                request.content(),
                request.category(),
                request.note(),
                request.paidOn()
        ));
        List<ExpenseParticipant> savedParticipants = saveAllocations(
                expense,
                participants,
                allocations
        );
        markCurrentRunsStale(project, YearMonth.from(expense.getPaidOn()));
        return toResponse(expense, savedParticipants);
    }

    @Transactional
    public ExpenseResponse updateExpense(
            String publicToken,
            UUID expenseId,
            UpdateExpenseRequest request
    ) {
        Project project = findProjectForUpdate(publicToken);
        assertProjectMutable(project);
        Expense expense = findExpense(project, expenseId);
        if (expense.getVersion() != request.version()) {
            throw new ExpenseVersionConflictException();
        }
        LocalDate previousPaidOn = expense.getPaidOn();
        UUID previousPayerId = expense.getPayerMember().getId();

        assertUniqueParticipants(request.participantMemberIds());
        ProjectMember payer = findActiveMember(project, request.payerMemberId());
        List<ProjectMember> participants = findActiveMembers(project, request.participantMemberIds());
        long amount = request.amount().longValueExact();
        List<ExpenseParticipant> existingParticipants =
                expenseParticipantRepository.findAllByExpense_IdOrderByAllocationOrderAsc(expenseId);
        boolean allocationChanged = allocationChanged(
                expense,
                existingParticipants,
                amount,
                request.participantMemberIds()
        );
        boolean expenseFieldsChanged = expenseFieldsChanged(expense, request, amount);

        try {
            if (allocationChanged && !expenseFieldsChanged) {
                expense.markAllocationsChanged();
            }
            expense.update(
                    payer,
                    amount,
                    request.content(),
                    request.category(),
                    request.note(),
                    request.paidOn()
            );
            expenseRepository.saveAndFlush(expense);
        } catch (ObjectOptimisticLockingFailureException exception) {
            throw new ExpenseVersionConflictException();
        }

        List<ExpenseParticipant> responseParticipants = existingParticipants;
        if (allocationChanged) {
            List<ExpenseAllocation> allocations = allocate(amount, participants);
            expenseParticipantRepository.deleteAllByExpense_Id(expenseId);
            expenseParticipantRepository.flush();
            responseParticipants = saveAllocations(expense, participants, allocations);
        }
        YearMonth previousMonth = project.getType() == ProjectType.CONTINUOUS
                ? YearMonth.from(previousPaidOn) : null;
        YearMonth nextMonth = project.getType() == ProjectType.CONTINUOUS
                ? YearMonth.from(expense.getPaidOn()) : null;
        if (project.getType() == ProjectType.EVENT) {
            markCurrentRunsStale(project, null);
        } else if (!previousMonth.equals(nextMonth)) {
            markCurrentRunsStale(project, previousMonth);
            markCurrentRunsStale(project, nextMonth);
        } else if (allocationChanged || !previousPayerId.equals(expense.getPayerMember().getId())) {
            markCurrentRunsStale(project, nextMonth);
        }
        return toResponse(expense, responseParticipants);
    }

    @Transactional
    public void deleteExpense(String publicToken, UUID expenseId) {
        Project project = findProjectForUpdate(publicToken);
        assertProjectMutable(project);
        Expense expense = findExpense(project, expenseId);
        YearMonth previousMonth = YearMonth.from(expense.getPaidOn());
        expenseParticipantRepository.deleteAllByExpense_Id(expenseId);
        expenseParticipantRepository.flush();
        expenseRepository.delete(expense);
        expenseRepository.flush();
        markCurrentRunsStale(project, previousMonth);
    }

    private Project findProject(String publicToken) {
        return projectRepository.findByPublicTokenAndDeletedAtIsNull(publicToken)
                .orElseThrow(ProjectNotFoundException::new);
    }

    private Project findProjectForUpdate(String publicToken) {
        return projectRepository.findForUpdateByPublicTokenAndDeletedAtIsNull(publicToken)
                .orElseThrow(ProjectNotFoundException::new);
    }

    private void markCurrentRunsStale(Project project, YearMonth month) {
        var currentRuns = project.getType() == ProjectType.EVENT
                ? settlementRunRepository.findAllByProject_IdAndState(
                        project.getId(), SettlementRunState.CURRENT)
                : settlementRunRepository.findAllByProject_IdAndScopeTypeAndScopeKeyAndState(
                        project.getId(), SettlementScopeType.YEAR_MONTH, month.toString(), SettlementRunState.CURRENT);
        Instant staledAt = Instant.now();
        currentRuns.forEach(run -> run.markStale(staledAt));
        settlementRunRepository.saveAllAndFlush(currentRuns);
    }

    private Expense findExpense(Project project, UUID expenseId) {
        return expenseRepository.findByIdAndProject_Id(expenseId, project.getId())
                .orElseThrow(ExpenseNotFoundException::new);
    }

    private void assertProjectMutable(Project project) {
        if (project.getStatus() == ProjectStatus.ARCHIVED) {
            throw new ProjectArchivedException();
        }
    }

    private void assertUniqueParticipants(List<UUID> participantMemberIds) {
        if (new HashSet<>(participantMemberIds).size() != participantMemberIds.size()) {
            throw new ExpenseValidationException(
                    "participantMemberIds",
                    "Participant member IDs must be unique."
            );
        }
    }

    private ProjectMember findActiveMember(Project project, UUID memberId) {
        ProjectMember member = projectMemberRepository
                .findByIdAndProject_Id(memberId, project.getId())
                .orElseThrow(MemberNotFoundException::new);
        if (!member.isActive()) {
            throw new MemberInactiveException();
        }
        return member;
    }

    private List<ProjectMember> findActiveMembers(Project project, List<UUID> memberIds) {
        return memberIds.stream()
                .map(memberId -> findActiveMember(project, memberId))
                .toList();
    }

    private List<ExpenseAllocation> allocate(long amount, List<ProjectMember> participants) {
        return equalSplitAllocator.allocate(
                amount,
                participants.stream()
                        .map(member -> new AllocationParticipant(
                                member.getId(),
                                member.getDisplayOrder()
                        ))
                        .toList()
        );
    }

    private List<ExpenseParticipant> saveAllocations(
            Expense expense,
            List<ProjectMember> participants,
            List<ExpenseAllocation> allocations
    ) {
        var membersById = participants.stream()
                .collect(Collectors.toMap(ProjectMember::getId, Function.identity()));
        List<ExpenseParticipant> participantEntities = allocations.stream()
                .map(allocation -> new ExpenseParticipant(
                        expense,
                        membersById.get(allocation.memberId()),
                        allocation.allocatedShare(),
                        allocation.allocationOrder()
                ))
                .toList();
        return expenseParticipantRepository.saveAllAndFlush(participantEntities);
    }

    private boolean allocationChanged(
            Expense expense,
            List<ExpenseParticipant> existingParticipants,
            long amount,
            List<UUID> requestedParticipantIds
    ) {
        if (expense.getAmount() != amount) {
            return true;
        }
        Set<UUID> existingIds = existingParticipants.stream()
                .map(participant -> participant.getMember().getId())
                .collect(Collectors.toSet());
        return !existingIds.equals(Set.copyOf(requestedParticipantIds));
    }

    private boolean expenseFieldsChanged(
            Expense expense,
            UpdateExpenseRequest request,
            long amount
    ) {
        return !expense.getPayerMember().getId().equals(request.payerMemberId())
                || expense.getAmount() != amount
                || !Objects.equals(expense.getContent(), request.content())
                || expense.getCategory() != request.category()
                || !Objects.equals(expense.getNote(), request.note())
                || !Objects.equals(expense.getPaidOn(), request.paidOn());
    }

    private ExpenseResponse toResponse(
            Expense expense,
            List<ExpenseParticipant> participants
    ) {
        List<ExpenseParticipantResponse> participantResponses = participants.stream()
                .sorted(java.util.Comparator.comparingInt(ExpenseParticipant::getAllocationOrder))
                .map(participant -> new ExpenseParticipantResponse(
                        participant.getMember().getId(),
                        participant.getAllocatedShare(),
                        participant.getAllocationOrder()
                ))
                .toList();
        return new ExpenseResponse(
                expense.getId(),
                expense.getPayerMember().getId(),
                expense.getAmount(),
                expense.getContent(),
                expense.getCategory(),
                expense.getNote(),
                expense.getPaidOn(),
                expense.getVersion(),
                participantResponses,
                expense.getCreatedAt(),
                expense.getUpdatedAt()
        );
    }
}
