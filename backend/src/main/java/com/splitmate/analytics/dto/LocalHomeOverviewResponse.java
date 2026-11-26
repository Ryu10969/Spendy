package com.splitmate.analytics.dto;

// Development-only response. The authorized Home API has a separate contract gate.
public record LocalHomeOverviewResponse(
        String month, long projectCount, Period selected, Period previous, Comparisons comparison
) {
    public record Period(
            long totalExpense, long continuousExpense, long eventExpense, long eventProjectCount,
            Contribution contribution
    ) {
    }

    public record Contribution(String continuousPercentage, String eventPercentage) {
    }

    public record Comparisons(
            AnalyticsComparisonResponse total, AnalyticsComparisonResponse continuous, AnalyticsComparisonResponse event
    ) {
    }
}
