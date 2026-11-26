package com.splitmate.analytics.controller;

import java.time.YearMonth;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpHeaders;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.splitmate.analytics.dto.AnalyticsOverviewResponse;
import com.splitmate.analytics.service.AnalyticsService;
import com.splitmate.expense.service.ExpenseValidationException;
import com.splitmate.expense.service.MonthQuery;

import jakarta.servlet.http.HttpServletRequest;

@RestController
@LocalLoopbackOnly
@ConditionalOnProperty(name = "spendingmate.local.analytics-overview-enabled", havingValue = "true")
@RequestMapping("/api/analytics")
public class AnalyticsOverviewController {

    private static final Set<String> FIELDS = Set.of("projectToken", "startMonth", "endMonth", "projectType");
    private static final Set<String> PROJECT_TYPES = Set.of("CONTINUOUS", "EVENT", "ALL");
    private final AnalyticsService analyticsService;

    public AnalyticsOverviewController(AnalyticsService analyticsService) {
        this.analyticsService = analyticsService;
    }

    @GetMapping
    public AnalyticsOverviewResponse getOverview(@RequestParam MultiValueMap<String, String> query,
                                                 HttpServletRequest request) {
        if (request.getContentLengthLong() > 0 || request.getHeader(HttpHeaders.TRANSFER_ENCODING) != null) {
            throw new ExpenseValidationException("body", "Analytics requests must not have a body.");
        }
        for (String field : query.keySet()) {
            if (!FIELDS.contains(field)) {
                throw new ExpenseValidationException(field, "Unsupported query parameter.");
            }
        }
        List<String> tokens = query.get("projectToken");
        if (tokens == null || tokens.isEmpty() || tokens.size() > 20
                || new HashSet<>(tokens).size() != tokens.size()
                || tokens.stream().anyMatch(token -> token == null || !token.matches("[A-Za-z0-9_-]{43}"))) {
            throw new ExpenseValidationException("projectToken", "Select 1 to 20 unique public tokens.");
        }
        YearMonth start = requiredMonth(query, "startMonth");
        YearMonth end = requiredMonth(query, "endMonth");
        if (end.isBefore(start) || end.isAfter(start.plusMonths(23))) {
            throw new ExpenseValidationException("endMonth", "Range must be ordered and at most 24 months.");
        }
        List<String> types = query.get("projectType");
        if (types == null || types.size() != 1 || types.getFirst() == null || !PROJECT_TYPES.contains(types.getFirst())) {
            throw new ExpenseValidationException("projectType", "Project type must be one of CONTINUOUS, EVENT or ALL.");
        }
        return analyticsService.getOverview(tokens, start, end, types.getFirst());
    }

    private YearMonth requiredMonth(MultiValueMap<String, String> query, String field) {
        YearMonth month = MonthQuery.parse(query.get(field), field);
        if (month == null) {
            throw new ExpenseValidationException(field, "Month is required for Analytics.");
        }
        return month;
    }
}
