package com.splitmate.analytics.dto;

import java.util.List;

import com.splitmate.project.domain.ProjectCurrency;
import com.splitmate.settlement.domain.SettlementScopeType;

public record ProjectMonthlyAnalyticsResponse(
        String publicToken,
        SettlementScopeType scopeType,
        String scopeKey,
        ProjectCurrency currency,
        long totalExpense,
        long expenseCount,
        String averageBasis,
        long participantCount,
        Long averagePerPerson,
        AnalyticsComparisonResponse previousMonthComparison,
        List<AnalyticsCategoryResponse> categoryBreakdown,
        List<AnalyticsMemberResponse> members,
        AnalyticsTrendResponse monthlyTrend
) {
    public ProjectMonthlyAnalyticsResponse {
        categoryBreakdown = List.copyOf(categoryBreakdown);
        members = List.copyOf(members);
    }
}
