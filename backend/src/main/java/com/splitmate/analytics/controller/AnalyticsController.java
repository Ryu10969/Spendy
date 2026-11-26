package com.splitmate.analytics.controller;

import java.time.YearMonth;
import java.util.List;
import java.util.Set;

import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.splitmate.analytics.dto.ProjectMonthlyAnalyticsResponse;
import com.splitmate.analytics.service.AnalyticsService;
import com.splitmate.expense.service.ExpenseValidationException;
import com.splitmate.expense.service.MonthQuery;

import jakarta.validation.constraints.Pattern;

@RestController
@RequestMapping("/api/projects/{publicToken}/analytics")
public class AnalyticsController {

    private final AnalyticsService analyticsService;

    public AnalyticsController(AnalyticsService analyticsService) {
        this.analyticsService = analyticsService;
    }

    @GetMapping
    public ProjectMonthlyAnalyticsResponse getAnalytics(
            @PathVariable
            @Pattern(regexp = "[A-Za-z0-9_-]{43}",
                    message = "Public token must be a 43-character Base64url value.")
            String publicToken,
            @RequestParam MultiValueMap<String, String> query
    ) {
        for (String key : query.keySet()) {
            if (!Set.of("month", "trendMonths").contains(key)) {
                throw new ExpenseValidationException(key, "Unsupported query parameter.");
            }
        }
        YearMonth month = MonthQuery.parse(query.get("month"));
        if (month == null) {
            throw new ExpenseValidationException("month", "Month is required for Analytics.");
        }
        List<String> values = query.get("trendMonths");
        int trendMonths = 6;
        if (values != null) {
            if (values.size() != 1 || values.getFirst() == null) {
                throw new ExpenseValidationException("trendMonths", "Trend months must be one integer from 1 to 24.");
            }
            try {
                trendMonths = Integer.parseInt(values.getFirst());
            } catch (NumberFormatException exception) {
                throw new ExpenseValidationException("trendMonths", "Trend months must be one integer from 1 to 24.");
            }
            if (trendMonths < 1 || trendMonths > 24) {
                throw new ExpenseValidationException("trendMonths", "Trend months must be one integer from 1 to 24.");
            }
        }
        return analyticsService.getAnalytics(publicToken, month, trendMonths);
    }
}
