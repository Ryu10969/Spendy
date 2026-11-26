package com.splitmate.analytics.dto;

import java.util.List;

import com.splitmate.project.domain.ProjectCurrency;
import com.splitmate.project.domain.ProjectType;

public record AnalyticsOverviewResponse(
        ProjectType projectType,
        String eventInclusion,
        ProjectCurrency currency,
        Period period,
        List<String> includedProjectTokens,
        List<ExcludedProject> excludedProjects,
        long totalExpense,
        long expenseCount,
        EndMonthComparison endMonthComparison,
        List<AnalyticsCategoryResponse> categoryBreakdown,
        List<AnalyticsMonthResponse> monthlyTrend,
        List<ProjectSpending> projectComparison
) {
    public record Period(String startMonth, String endMonth) {}

    public record ExcludedProject(String publicToken, ProjectType projectType, String reason) {}

    public record EndMonthComparison(String month, long totalExpense, String previousMonth,
                                     Long previousTotalExpense, Long difference, String percentageChange,
                                     String comparisonState) {}

    public record ProjectSpending(String publicToken, String name, long totalExpense, long expenseCount) {}
}
