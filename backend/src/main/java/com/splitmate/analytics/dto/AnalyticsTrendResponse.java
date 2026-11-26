package com.splitmate.analytics.dto;

import java.util.List;

public record AnalyticsTrendResponse(String startMonth, String endMonth, List<AnalyticsMonthResponse> items) {
    public AnalyticsTrendResponse {
        items = List.copyOf(items);
    }
}
