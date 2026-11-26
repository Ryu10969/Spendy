package com.splitmate.analytics.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.YearMonth;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.env.SystemEnvironmentPropertySource;
import org.springframework.mock.web.MockServletContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

import com.splitmate.analytics.dto.AnalyticsComparisonResponse;
import com.splitmate.analytics.dto.AnalyticsTrendResponse;
import com.splitmate.analytics.dto.ProjectMonthlyAnalyticsResponse;
import com.splitmate.analytics.service.AnalyticsAmountOutOfRangeException;
import com.splitmate.analytics.service.AnalyticsCalculationException;
import com.splitmate.analytics.service.AnalyticsScopeUnsupportedException;
import com.splitmate.analytics.service.AnalyticsService;
import com.splitmate.common.error.GlobalExceptionHandler;
import com.splitmate.project.domain.ProjectCurrency;
import com.splitmate.project.service.ProjectNotFoundException;
import com.splitmate.settlement.domain.SettlementScopeType;

class AnalyticsControllerTests {

    private static final String TOKEN = "A".repeat(43);
    private static final String PATH = "/api/projects/{publicToken}/analytics";
    private static final YearMonth MONTH = YearMonth.of(2026, 10);
    private AnalyticsService service;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        service = mock(AnalyticsService.class);
        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        mvc = MockMvcBuilders.standaloneSetup(new AnalyticsController(service), new AnalyticsOverviewController(service))
                .setControllerAdvice(new GlobalExceptionHandler()).setValidator(validator).build();
    }

    @Test
    void defaultsToSixAndPreservesRequiredNullsAndEmptyArrays() throws Exception {
        when(service.getAnalytics(TOKEN, MONTH, 6)).thenReturn(new ProjectMonthlyAnalyticsResponse(
                TOKEN, SettlementScopeType.YEAR_MONTH, "2026-10", ProjectCurrency.JPY, 0, 0,
                "DISTINCT_EXPENSE_PARTICIPANTS", 0, null,
                new AnalyticsComparisonResponse("2026-09", 0L, 0L, null, "BOTH_MONTHS_EMPTY"),
                List.of(), List.of(), new AnalyticsTrendResponse("2026-05", "2026-10", List.of())));
        String json = mvc.perform(get(PATH, TOKEN).queryParam("month", "2026-10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scopeType").value("YEAR_MONTH"))
                .andExpect(jsonPath("$.scopeKey").value("2026-10"))
                .andExpect(jsonPath("$.currency").value("JPY"))
                .andExpect(jsonPath("$.categoryBreakdown").isEmpty())
                .andExpect(jsonPath("$.members").isEmpty())
                .andReturn().getResponse().getContentAsString();
        assertThat(json).contains("\"averagePerPerson\":null", "\"percentageChange\":null");
        verify(service).getAnalytics(TOKEN, MONTH, 6);
    }

    @Test
    void rejectsInvalidQueriesBeforeCallingService() throws Exception {
        mvc.perform(get(PATH, TOKEN)).andExpect(status().isBadRequest());
        for (String month : List.of("", "bad", "2026-1", "0000-01", "2026-13", "10000-01", " 2026-10")) {
            mvc.perform(get(PATH, TOKEN).queryParam("month", month))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("month"));
        }
        mvc.perform(get(PATH, TOKEN).queryParam("month", "2026-10", "2026-10"))
                .andExpect(status().isBadRequest());
        for (String trend : List.of("", "0", "25", "-1", "6.0", "1e1", "bad", "9999999999999999")) {
            mvc.perform(get(PATH, TOKEN).queryParam("month", "2026-10").queryParam("trendMonths", trend))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("trendMonths"));
        }
        mvc.perform(get(PATH, TOKEN).queryParam("month", "2026-10").queryParam("trendMonths", "6", "6"))
                .andExpect(status().isBadRequest());
        mvc.perform(get(PATH, TOKEN).queryParam("month", "2026-10").queryParam("category", "FOOD"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors[0].field").value("category"));
        mvc.perform(get(PATH, "invalid").queryParam("month", "2026-10"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors[0].field").value("publicToken"));
        verifyNoInteractions(service);
    }

    @Test
    void acceptsExplicitLimitsAndCanonicalEndpointMonths() throws Exception {
        for (String month : List.of("0001-01", "9999-12")) {
            for (int trend : List.of(1, 24)) {
                mvc.perform(get(PATH, TOKEN).queryParam("month", month).queryParam("trendMonths", String.valueOf(trend)))
                        .andExpect(status().isOk());
                verify(service).getAnalytics(TOKEN, YearMonth.parse(month), trend);
            }
        }
    }

    @Test
    void overviewAcceptsRepeatedTokensAndAnInclusive24MonthRange() throws Exception {
        var tokens = List.of(TOKEN, "b".repeat(43));
        mvc.perform(overview(tokens.toArray(String[]::new), "9998-01", "9999-12", "CONTINUOUS"))
                .andExpect(status().isOk());
        verify(service).getOverview(tokens, YearMonth.of(9998, 1), YearMonth.of(9999, 12), "CONTINUOUS");
    }

    @Test
    void overviewRejectsInvalidQueriesBeforeLookup() throws Exception {
        String[] token = {TOKEN};
        for (String[] values : List.of(new String[]{}, new String[]{TOKEN, TOKEN},
                new String[]{TOKEN + "," + "b".repeat(43)}, new String[]{"bad"},
                java.util.stream.IntStream.range(0, 21).mapToObj(index -> "%043d".formatted(index)).toArray(String[]::new))) {
            var request = get("/api/analytics").queryParam("startMonth", "2026-09")
                    .queryParam("endMonth", "2026-10").queryParam("projectType", "CONTINUOUS");
            if (values.length > 0) request.queryParam("projectToken", values);
            mvc.perform(request).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("projectToken"));
        }
        for (String start : List.of("0000-01", "2026-9", " 2026-09", "")) {
            mvc.perform(overview(token, start, "2026-10", "CONTINUOUS")).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("startMonth"));
        }
        for (String end : List.of("2026-08", "2028-09", "2026-13")) {
            mvc.perform(overview(token, "2026-09", end, "CONTINUOUS")).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("endMonth"));
        }
        for (String scalar : List.of("startMonth", "endMonth", "projectType")) {
            mvc.perform(overview(token, "2026-09", "2026-10", "CONTINUOUS").queryParam(scalar, "duplicate"))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors[0].field").value(scalar));
        }
        mvc.perform(overview(token, "2026-09", "2026-10", "event"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors[0].field").value("projectType"));
        mvc.perform(overview(token, "2026-09", "2026-10", "CONTINUOUS").queryParam("category", "FOOD"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors[0].field").value("category"));
        mvc.perform(overview(token, "2026-09", "2026-10", "CONTINUOUS").content("{}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors[0].field").value("body"));
        verifyNoInteractions(service);
    }

    private static final String ANALYTICS_FLAG = "spendingmate.local.analytics-overview-enabled";
    private static final String HOME_FLAG = "spendingmate.local.home-overview-enabled";
    private static final String HOME_PATH = "/api/local/home/monthly-overview";

    @Test
    void bothLocalRoutesFailClosedWithoutEveryRequiredSetting() throws Exception {
        var flags = Map.<String, Object>of(ANALYTICS_FLAG, "true", HOME_FLAG, "true");
        var enabled = Map.<String, Object>of(ANALYTICS_FLAG, "true", HOME_FLAG, "true", "server.address", "127.0.0.1");

        assertLocalRoutes(Map.of(), false, false);
        assertLocalRoutes(enabled, false, false); // The configured default profile is local.
        assertLocalRoutes(enabled, false, false, "test");
        assertLocalRoutes(enabled, false, false, "production");
        assertLocalRoutes(enabled, false, false, "local", "production");
        assertLocalRoutes(flags, false, false, "local");
        for (String address : List.of("0.0.0.0", "192.0.2.10", "::1", "localhost")) {
            assertLocalRoutes(Map.of(ANALYTICS_FLAG, "true", HOME_FLAG, "true", "server.address", address),
                    false, false, "local");
        }
        assertLocalRoutes(Map.of("server.address", "127.0.0.1"), false, false, "local");
        assertLocalRoutes(Map.of(ANALYTICS_FLAG, "false", HOME_FLAG, "false", "server.address", "127.0.0.1"),
                false, false, "local");
        assertLocalRoutes(Map.of(ANALYTICS_FLAG, "true", "server.address", "127.0.0.1"), true, false, "local");
        assertLocalRoutes(Map.of(HOME_FLAG, "true", "server.address", "127.0.0.1"), false, true, "local");
        assertLocalRoutes(enabled, true, true, "local");
        assertLocalRoutes(Map.of("SERVER_ADDRESS", "127.0.0.1", "SPRING_PROFILES_ACTIVE", "local",
                "SPENDINGMATE_LOCAL_ANALYTICS_OVERVIEW_ENABLED", "true", "SPENDINGMATE_LOCAL_HOME_OVERVIEW_ENABLED", "true"),
                true, true);
    }

    private void assertLocalRoutes(Map<String, Object> properties, boolean analytics, boolean home, String... profiles)
            throws Exception {
        try (var context = new AnnotationConfigWebApplicationContext()) {
            context.setServletContext(new MockServletContext());
            var environment = context.getEnvironment();
            environment.getPropertySources().remove(StandardEnvironment.SYSTEM_PROPERTIES_PROPERTY_SOURCE_NAME);
            environment.getPropertySources().remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
            environment.getPropertySources().addFirst(new SystemEnvironmentPropertySource("test-settings", properties));
            environment.setActiveProfiles(profiles);
            new ConfigDataApplicationContextInitializer().initialize(context);
            assertThat(environment.getDefaultProfiles()).containsExactly("local");
            context.addBeanFactoryPostProcessor(factory -> factory.registerSingleton("analyticsService", service));
            context.register(TestWebMvc.class, AnalyticsOverviewController.class, LocalHomeOverviewController.class);
            context.refresh();

            assertThat(context.getBeansOfType(AnalyticsOverviewController.class)).hasSize(analytics ? 1 : 0);
            assertThat(context.getBeansOfType(LocalHomeOverviewController.class)).hasSize(home ? 1 : 0);
            var http = MockMvcBuilders.webAppContextSetup(context).build();
            http.perform(overview(new String[]{TOKEN}, "2026-10", "2026-10", "CONTINUOUS"))
                    .andExpect(status().is(analytics ? 200 : 404));
            http.perform(get(HOME_PATH).queryParam("month", "2026-10"))
                    .andExpect(status().is(home ? 200 : 404));
        }
    }

    @EnableWebMvc
    static class TestWebMvc {
    }

    @Test
    void localHomeValidatesMonthAndRejectsScopeParametersBeforeReading() throws Exception {
        var local = MockMvcBuilders.standaloneSetup(new LocalHomeOverviewController(service))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
        String path = "/api/local/home/monthly-overview";
        for (var request : List.of(get(path), get(path).queryParam("month", "2026-1"),
                get(path).queryParam("month", "2026-10", "2026-10"),
                get(path).queryParam("month", "2026-10").queryParam("projectToken", TOKEN))) {
            local.perform(request).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        }
        verifyNoInteractions(service);
        local.perform(get(path).queryParam("month", "2026-10"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"));
        verify(service).getLocalHomeOverview(MONTH);
    }

    private MockHttpServletRequestBuilder overview(String[] tokens, String start, String end, String type) {
        return get("/api/analytics").queryParam("projectToken", tokens)
                .queryParam("startMonth", start).queryParam("endMonth", end).queryParam("projectType", type);
    }

    @Test
    void mapsWholeResponseErrorsToExistingSafeShape() throws Exception {
        List<RuntimeException> exceptions = List.of(new ProjectNotFoundException(),
                new AnalyticsScopeUnsupportedException(), new AnalyticsCalculationException(),
                new AnalyticsAmountOutOfRangeException(), new IllegalStateException("internal SQL details"));
        List<String> codes = List.of("PROJECT_NOT_FOUND", "ANALYTICS_SCOPE_UNSUPPORTED",
                "ANALYTICS_CALCULATION_INVALID", "ANALYTICS_AMOUNT_OUT_OF_RANGE", "INTERNAL_ERROR");
        for (int i = 0; i < exceptions.size(); i++) {
            doThrow(exceptions.get(i)).when(service).getAnalytics(TOKEN, MONTH, 6);
            String json = mvc.perform(get(PATH, TOKEN).queryParam("month", "2026-10"))
                    .andExpect(status().is(i == 0 ? 404 : i == 4 ? 500 : 409))
                    .andExpect(jsonPath("$.code").value(codes.get(i)))
                    .andExpect(jsonPath("$.fieldErrors").isEmpty())
                    .andExpect(jsonPath("$.timestamp").isString())
                    .andExpect(jsonPath("$.totalExpense").doesNotExist())
                    .andReturn().getResponse().getContentAsString();
            assertThat(json).doesNotContain("internal SQL details");
        }
    }
}
