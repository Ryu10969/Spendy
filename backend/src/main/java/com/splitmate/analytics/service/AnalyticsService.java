package com.splitmate.analytics.service;

import java.time.YearMonth;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import com.splitmate.analytics.dto.AnalyticsOverviewResponse;
import com.splitmate.analytics.dto.LocalHomeOverviewResponse;
import com.splitmate.analytics.dto.ProjectMonthlyAnalyticsResponse;
import com.splitmate.expense.domain.Expense;
import com.splitmate.expense.domain.ExpenseParticipant;
import com.splitmate.expense.repository.ExpenseParticipantRepository;
import com.splitmate.expense.repository.ExpenseRepository;
import com.splitmate.project.domain.Project;
import com.splitmate.project.domain.ProjectMember;
import com.splitmate.project.domain.ProjectType;
import com.splitmate.project.repository.ProjectRepository;
import com.splitmate.project.service.ProjectNotFoundException;

@Service
public class AnalyticsService {

    private final ProjectRepository projectRepository;
    private final ExpenseRepository expenseRepository;
    private final ExpenseParticipantRepository participantRepository;
    private final AnalyticsCalculator calculator = new AnalyticsCalculator();

    public AnalyticsService(ProjectRepository projectRepository, ExpenseRepository expenseRepository,
                            ExpenseParticipantRepository participantRepository) {
        this.projectRepository = projectRepository;
        this.expenseRepository = expenseRepository;
        this.participantRepository = participantRepository;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public ProjectMonthlyAnalyticsResponse getAnalytics(String publicToken, YearMonth month, int trendMonths) {
        Project project = projectRepository.findByPublicTokenAndDeletedAtIsNull(publicToken)
                .orElseThrow(ProjectNotFoundException::new);
        if (project.getType() != ProjectType.CONTINUOUS) {
            throw new AnalyticsScopeUnsupportedException();
        }
        YearMonth start = AnalyticsCalculator.trendStart(month, trendMonths);
        if (!month.equals(YearMonth.of(1, 1)) && month.minusMonths(1).isBefore(start)) {
            start = month.minusMonths(1);
        }
        return calculator.calculate(project.getId(), publicToken, month, trendMonths, inputs(
                expenseRepository.findByProject_IdAndPaidOnBetween(project.getId(), start.atDay(1), month.atEndOfMonth()),
                participantRepository.findByExpense_Project_IdAndExpense_PaidOnBetween(
                        project.getId(), start.atDay(1), month.atEndOfMonth())));
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public AnalyticsOverviewResponse getOverview(List<String> publicTokens, YearMonth start, YearMonth end, String projectType) {
        var projects = projectRepository.findByPublicTokenInAndDeletedAtIsNull(publicTokens).stream()
                .sorted(Comparator.comparing(Project::getPublicToken)).toList();
        if (projects.size() != publicTokens.size()) {
            throw new ProjectNotFoundException();
        }
        if (!ProjectType.CONTINUOUS.name().equals(projectType)) {
            throw new AnalyticsScopeUnsupportedException();
        }
        List<UUID> includedIds = projects.stream().filter(project -> project.getType() == ProjectType.CONTINUOUS)
                .map(Project::getId).toList();
        YearMonth readStart = start.equals(end) && !start.equals(YearMonth.of(1, 1)) ? start.minusMonths(1) : start;
        var expenses = includedIds.isEmpty() ? List.<AnalyticsCalculator.Expense>of() : inputs(
                expenseRepository.findByProject_IdInAndPaidOnBetween(includedIds, readStart.atDay(1), end.atEndOfMonth()),
                participantRepository.findByExpense_Project_IdInAndExpense_PaidOnBetween(
                        includedIds, readStart.atDay(1), end.atEndOfMonth()));
        var selected = projects.stream().map(project -> new AnalyticsCalculator.SelectedProject(
                project.getId(), project.getPublicToken(), project.getName(), project.getType())).toList();
        return calculator.calculateOverview(selected, start, end, expenses);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public LocalHomeOverviewResponse getLocalHomeOverview(YearMonth month) {
        YearMonth previous = month.getYear() == 1 && month.getMonthValue() == 1 ? null : month.minusMonths(1);
        var start = (previous == null ? month : previous).atDay(1);
        var end = month.atEndOfMonth();
        long projectCount = projectRepository.countByDeletedAtIsNull();
        var expenses = expenseRepository.findByProject_DeletedAtIsNullAndPaidOnBetween(start, end);
        var participants = participantRepository.findByExpense_Project_DeletedAtIsNullAndExpense_PaidOnBetween(start, end);
        Map<UUID, ProjectType> types = new HashMap<>();
        for (Expense expense : expenses) {
            Project project = expense.getProject();
            types.put(project.getId(), project.getType());
        }
        return calculator.calculateLocalHome(month, previous, projectCount, types, inputs(expenses, participants));
    }

    private List<AnalyticsCalculator.Expense> inputs(List<Expense> expenses, List<ExpenseParticipant> rows) {
        Map<UUID, List<ExpenseParticipant>> participants = rows.stream()
                .collect(Collectors.groupingBy(participant -> participant.getExpense().getId()));
        return expenses.stream()
                .map(expense -> new AnalyticsCalculator.Expense(
                        expense.getId(), expense.getProject().getId(), member(expense.getPayerMember()),
                        expense.getAmount(), expense.getCategory(), expense.getPaidOn(),
                        participants.getOrDefault(expense.getId(), List.of()).stream()
                                .map(participant -> new AnalyticsCalculator.Participant(
                                        member(participant.getMember()), participant.getAllocatedShare(),
                                        participant.getAllocationOrder())).toList()))
                .toList();
    }

    private AnalyticsCalculator.Member member(ProjectMember member) {
        return new AnalyticsCalculator.Member(member.getId(), member.getProject().getId(),
                member.getName(), member.getDisplayOrder(), member.isActive());
    }
}
