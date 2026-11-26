package com.splitmate.settlement.service;

import java.time.Instant;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.splitmate.expense.domain.ExpenseParticipant;
import com.splitmate.expense.service.ExpenseValidationException;
import com.splitmate.expense.repository.ExpenseParticipantRepository;
import com.splitmate.expense.repository.ExpenseRepository;
import com.splitmate.project.domain.Project;
import com.splitmate.project.domain.ProjectMember;
import com.splitmate.project.domain.ProjectStatus;
import com.splitmate.project.domain.ProjectType;
import com.splitmate.project.repository.ProjectRepository;
import com.splitmate.project.service.ProjectNotFoundException;
import com.splitmate.settlement.domain.SettlementBalance;
import com.splitmate.settlement.domain.SettlementCalculation;
import com.splitmate.settlement.domain.SettlementCalculation.Expense;
import com.splitmate.settlement.domain.SettlementCalculation.Member;
import com.splitmate.settlement.domain.SettlementCalculation.Participant;
import com.splitmate.settlement.domain.SettlementCalculator;
import com.splitmate.settlement.domain.SettlementFingerprint;
import com.splitmate.settlement.domain.SettlementRun;
import com.splitmate.settlement.domain.SettlementRunState;
import com.splitmate.settlement.domain.SettlementScopeType;
import com.splitmate.settlement.domain.SettlementStrategy;
import com.splitmate.settlement.domain.SettlementTransfer;
import com.splitmate.settlement.dto.SettlementBalanceResponse;
import com.splitmate.settlement.dto.SettlementResponse;
import com.splitmate.settlement.dto.SettlementTransferExplanationResponse;
import com.splitmate.settlement.dto.SettlementTransferResponse;
import com.splitmate.settlement.repository.SettlementBalanceRepository;
import com.splitmate.settlement.repository.SettlementRunRepository;
import com.splitmate.settlement.repository.SettlementTransferRepository;

@Service
public class SettlementService {

    private final ProjectRepository projectRepository;
    private final ExpenseRepository expenseRepository;
    private final ExpenseParticipantRepository expenseParticipantRepository;
    private final SettlementRunRepository settlementRunRepository;
    private final SettlementBalanceRepository settlementBalanceRepository;
    private final SettlementTransferRepository settlementTransferRepository;
    private final SettlementCalculator settlementCalculator = new SettlementCalculator();
    private final SettlementFingerprint settlementFingerprint = new SettlementFingerprint();

    public SettlementService(
            ProjectRepository projectRepository,
            ExpenseRepository expenseRepository,
            ExpenseParticipantRepository expenseParticipantRepository,
            SettlementRunRepository settlementRunRepository,
            SettlementBalanceRepository settlementBalanceRepository,
            SettlementTransferRepository settlementTransferRepository
    ) {
        this.projectRepository = projectRepository;
        this.expenseRepository = expenseRepository;
        this.expenseParticipantRepository = expenseParticipantRepository;
        this.settlementRunRepository = settlementRunRepository;
        this.settlementBalanceRepository = settlementBalanceRepository;
        this.settlementTransferRepository = settlementTransferRepository;
    }

    @Transactional
    public SettlementResponse getSettlement(String publicToken, SettlementStrategy strategy) {
        return getSettlement(publicToken, strategy, null);
    }

    @Transactional
    public SettlementResponse getSettlement(
            String publicToken, SettlementStrategy strategy, YearMonth month) {
        Project project = projectRepository.findForUpdateByPublicTokenAndDeletedAtIsNull(publicToken)
                .orElseThrow(ProjectNotFoundException::new);
        if (project.getType() == ProjectType.EVENT && month != null) {
            throw new SettlementScopeUnsupportedException();
        }
        if (project.getType() == ProjectType.CONTINUOUS && month == null) {
            throw new ExpenseValidationException("month", "Month is required for Continuous Settlement.");
        }
        SettlementScopeType scopeType = month == null
                ? SettlementScopeType.PROJECT : SettlementScopeType.YEAR_MONTH;
        String scopeKey = month == null ? "PROJECT" : month.toString();

        SettlementInputs settlementInputs;
        String fingerprint;
        try {
            settlementInputs = readInputs(project, month);
            fingerprint = settlementFingerprint.calculate(
                    project.getRoundingUnit(),
                    settlementInputs.expenses(),
                    month == null ? null : scopeKey
            );
        } catch (ArithmeticException | IllegalArgumentException exception) {
            throw new SettlementCalculationException(exception);
        }

        List<SettlementRun> currentRuns = month == null
                ? settlementRunRepository.findAllByProject_IdAndState(
                        project.getId(), SettlementRunState.CURRENT)
                : settlementRunRepository.findAllByProject_IdAndScopeTypeAndScopeKeyAndState(
                        project.getId(), scopeType, scopeKey, SettlementRunState.CURRENT);
        SettlementRun requestedCurrent = currentRuns.stream()
                .filter(run -> run.getStrategy() == strategy)
                .findFirst()
                .orElse(null);
        if (requestedCurrent != null
                && requestedCurrent.getSourceStateFingerprint().equals(fingerprint)) {
            return toResponse(requestedCurrent);
        }
        if (project.getStatus() == ProjectStatus.ARCHIVED) {
            throw new SettlementRunUnavailableException();
        }

        boolean sourceChanged = currentRuns.stream()
                .anyMatch(run -> !run.getSourceStateFingerprint().equals(fingerprint));
        if (sourceChanged) {
            markStale(currentRuns, Instant.now());
        }

        SettlementCalculation calculation;
        try {
            calculation = settlementCalculator.calculate(
                    settlementInputs.expenses(),
                    strategy,
                    project.getRoundingUnit()
            );
        } catch (ArithmeticException | IllegalArgumentException exception) {
            throw new SettlementCalculationException(exception);
        }
        return persist(project, scopeType, scopeKey, strategy, fingerprint,
                calculation, settlementInputs.membersById());
    }

    private SettlementInputs readInputs(Project project, YearMonth month) {
        List<com.splitmate.expense.domain.Expense> expenses =
                month == null ? expenseRepository.findAllByProject_Id(project.getId())
                        : expenseRepository.findAllByProject_IdAndPaidOnGreaterThanEqualAndPaidOnLessThan(
                                project.getId(), month.atDay(1), month.plusMonths(1).atDay(1));
        Map<UUID, List<ExpenseParticipant>> participantsByExpense = new HashMap<>();
        for (com.splitmate.expense.domain.Expense expense : expenses) {
            participantsByExpense.put(
                    expense.getId(),
                    expenseParticipantRepository
                            .findAllByExpense_IdOrderByAllocationOrderAsc(expense.getId())
            );
        }

        List<SettlementCalculation.Expense> inputs = new ArrayList<>(expenses.size());
        Map<UUID, ProjectMember> membersById = new HashMap<>();
        for (com.splitmate.expense.domain.Expense expense : expenses) {
            assertSameProject(project, expense);
            membersById.put(expense.getPayerMember().getId(), expense.getPayerMember());
            List<Participant> participants = participantsByExpense.get(expense.getId()).stream()
                    .map(participant -> {
                        if (!participant.getExpense().getId().equals(expense.getId())) {
                            throw new IllegalArgumentException("Participant expense is inconsistent.");
                        }
                        assertSameProject(project, participant.getMember());
                        membersById.put(participant.getMember().getId(), participant.getMember());
                        return new Participant(
                                member(participant.getMember()),
                                participant.getAllocatedShare(),
                                participant.getAllocationOrder()
                        );
                    })
                    .toList();
            inputs.add(new Expense(
                    expense.getId(),
                    member(expense.getPayerMember()),
                    expense.getAmount(),
                    participants
            ));
        }
        return new SettlementInputs(List.copyOf(inputs), Map.copyOf(membersById));
    }

    private void assertSameProject(Project project, com.splitmate.expense.domain.Expense expense) {
        if (!expense.getProject().getId().equals(project.getId())) {
            throw new IllegalArgumentException("Expense belongs to another project.");
        }
        assertSameProject(project, expense.getPayerMember());
    }

    private void assertSameProject(Project project, ProjectMember member) {
        if (!member.getProject().getId().equals(project.getId())) {
            throw new IllegalArgumentException("Member belongs to another project.");
        }
    }

    private Member member(ProjectMember member) {
        return new Member(member.getId(), member.getDisplayOrder());
    }

    private void markStale(List<SettlementRun> runs, Instant staledAt) {
        runs.forEach(run -> run.markStale(staledAt));
        settlementRunRepository.saveAllAndFlush(runs);
    }

    private SettlementResponse persist(
            Project project,
            SettlementScopeType scopeType,
            String scopeKey,
            SettlementStrategy strategy,
            String fingerprint,
            SettlementCalculation calculation,
            Map<UUID, ProjectMember> membersById
    ) {
        long previousSequence = settlementRunRepository
                .findFirstByProject_IdOrderByRunSequenceDesc(project.getId())
                .map(SettlementRun::getRunSequence)
                .orElse(0L);
        long nextSequence;
        try {
            nextSequence = Math.addExact(previousSequence, 1);
        } catch (ArithmeticException exception) {
            throw new SettlementCalculationException(exception);
        }
        SettlementRun run = settlementRunRepository.saveAndFlush(new SettlementRun(
                project,
                nextSequence,
                scopeType,
                scopeKey,
                strategy,
                fingerprint,
                Instant.now()
        ));

        List<SettlementBalance> balances = calculation.balances().stream()
                .map(balance -> new SettlementBalance(
                        run,
                        membersById.get(balance.member().id()),
                        balance.paidAmount(),
                        balance.burdenAmount(),
                        balance.exactBalance(),
                        balance.roundedTransferNet(),
                        balance.roundingDifference()
                ))
                .toList();
        settlementBalanceRepository.saveAllAndFlush(balances);

        List<SettlementTransfer> transfers = calculation.transfers().stream()
                .map(transfer -> new SettlementTransfer(
                        run,
                        transfer.transferOrder(),
                        membersById.get(transfer.fromMemberId()),
                        membersById.get(transfer.toMemberId()),
                        transfer.exactAmount(),
                        transfer.initiallyRoundedAmount(),
                        transfer.finalRoundedAmount(),
                        transfer.roundingAdjustment(),
                        transfer.fromExactBalanceBefore(),
                        transfer.toExactBalanceBefore()
                ))
                .toList();
        settlementTransferRepository.saveAllAndFlush(transfers);
        return toResponse(run, balances, transfers);
    }

    private SettlementResponse toResponse(SettlementRun run) {
        List<SettlementBalance> balances =
                settlementBalanceRepository.findAllBySettlementRun_Id(run.getId());
        List<SettlementTransfer> transfers = settlementTransferRepository
                .findAllBySettlementRun_IdOrderByTransferOrderAsc(run.getId());
        return toResponse(run, balances, transfers);
    }

    private SettlementResponse toResponse(
            SettlementRun run,
            List<SettlementBalance> balances,
            List<SettlementTransfer> transfers
    ) {
        Comparator<SettlementBalance> balanceOrder = Comparator
                .comparingInt((SettlementBalance balance) ->
                        balance.getMember().getDisplayOrder())
                .thenComparing(
                        balance -> balance.getMember().getId(),
                        SettlementCalculator.UUID_ORDER
                );
        List<SettlementBalanceResponse> balanceResponses = balances.stream()
                .sorted(balanceOrder)
                .map(balance -> new SettlementBalanceResponse(
                        balance.getMember().getId(),
                        balance.getPaidAmount(),
                        balance.getBurdenAmount(),
                        balance.getExactBalance(),
                        balance.getRoundedTransferNet(),
                        balance.getRoundingDifference()
                ))
                .toList();
        List<SettlementTransferResponse> transferResponses = transfers.stream()
                .sorted(Comparator.comparingInt(SettlementTransfer::getTransferOrder))
                .map(transfer -> new SettlementTransferResponse(
                        transfer.getId(),
                        transfer.getTransferOrder(),
                        transfer.getFromMember().getId(),
                        transfer.getToMember().getId(),
                        transfer.getExactAmount(),
                        transfer.getInitiallyRoundedAmount(),
                        transfer.getFinalRoundedAmount(),
                        transfer.getRoundingAdjustment(),
                        transfer.getStatus(),
                        transfer.getCompletedAt(),
                        new SettlementTransferExplanationResponse(
                                transfer.getExplanationKind(),
                                transfer.getFromExactBalanceBefore(),
                                transfer.getToExactBalanceBefore()
                        )
                ))
                .toList();
        return new SettlementResponse(
                run.getId(),
                run.getSourceStateFingerprint(),
                run.getScopeType(),
                run.getScopeType() == SettlementScopeType.YEAR_MONTH ? run.getScopeKey() : null,
                run.getStrategy(),
                run.getState(),
                run.getGeneratedAt(),
                balanceResponses,
                transferResponses
        );
    }

    private record SettlementInputs(
            List<SettlementCalculation.Expense> expenses,
            Map<UUID, ProjectMember> membersById
    ) {
    }
}
