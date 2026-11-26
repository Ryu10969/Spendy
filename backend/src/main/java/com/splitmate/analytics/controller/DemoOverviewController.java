package com.splitmate.analytics.controller;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.splitmate.analytics.dto.AnalyticsOverviewResponse;
import com.splitmate.analytics.dto.LocalHomeOverviewResponse;
import com.splitmate.analytics.service.AnalyticsService;
import jakarta.servlet.http.HttpServletRequest;

@RestController
@Profile("demo & !local & !production")
@ConditionalOnProperty(name = "spendingmate.demo.overviews-enabled", havingValue = "true")
class DemoOverviewController {
    private final AnalyticsOverviewController analytics;
    private final LocalHomeOverviewController home;

    DemoOverviewController(AnalyticsService service) {
        analytics = new AnalyticsOverviewController(service);
        home = new LocalHomeOverviewController(service);
    }

    @GetMapping("/api/demo/analytics")
    AnalyticsOverviewResponse analytics(@RequestParam MultiValueMap<String, String> query, HttpServletRequest request) {
        return analytics.getOverview(query, request);
    }

    @GetMapping("/api/demo/home/monthly-overview")
    ResponseEntity<LocalHomeOverviewResponse> home(@RequestParam MultiValueMap<String, String> query) {
        return home.getOverview(query);
    }
}
