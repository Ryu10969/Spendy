package com.splitmate.analytics.dto;

public record AnalyticsComparisonResponse(
        String previousMonth,
        Long previousTotalExpense,
        Long difference,
        String percentageChange,
        String comparisonState
) {
}
