package com.splitmate.analytics.controller;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.splitmate.analytics.dto.LocalHomeOverviewResponse;
import com.splitmate.analytics.service.AnalyticsService;
import com.splitmate.expense.service.ExpenseValidationException;
import com.splitmate.expense.service.MonthQuery;

@RestController
@LocalLoopbackOnly
@ConditionalOnProperty(name = "spendingmate.local.home-overview-enabled", havingValue = "true")
public class LocalHomeOverviewController {

    private final AnalyticsService analyticsService;

    public LocalHomeOverviewController(AnalyticsService analyticsService) {
        this.analyticsService = analyticsService;
    }

    @GetMapping("/api/local/home/monthly-overview")
    public ResponseEntity<LocalHomeOverviewResponse> getOverview(@RequestParam MultiValueMap<String, String> query) {
        for (String field : query.keySet()) {
            if (!field.equals("month")) {
                throw new ExpenseValidationException(field, "Unsupported query parameter.");
            }
        }
        var month = MonthQuery.parse(query.get("month"));
        if (month == null) {
            throw new ExpenseValidationException("month", "Month is required for the local Home overview.");
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(analyticsService.getLocalHomeOverview(month));
    }
}
