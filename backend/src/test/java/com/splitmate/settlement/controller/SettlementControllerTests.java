package com.splitmate.settlement.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;

import com.splitmate.common.error.GlobalExceptionHandler;
import com.splitmate.project.service.ProjectNotFoundException;
import com.splitmate.settlement.domain.SettlementExplanationKind;
import com.splitmate.settlement.domain.SettlementRunState;
import com.splitmate.settlement.domain.SettlementScopeType;
import com.splitmate.settlement.domain.SettlementStrategy;
import com.splitmate.settlement.domain.SettlementTransferStatus;
import com.splitmate.settlement.dto.SettlementBalanceResponse;
import com.splitmate.settlement.dto.SettlementResponse;
import com.splitmate.settlement.dto.SettlementTransferExplanationResponse;
import com.splitmate.settlement.dto.SettlementTransferResponse;
import com.splitmate.settlement.service.SettlementCalculationException;
import com.splitmate.settlement.service.SettlementRunUnavailableException;
import com.splitmate.settlement.service.SettlementScopeUnsupportedException;
import com.splitmate.settlement.service.SettlementService;

class SettlementControllerTests {

    private static final String PUBLIC_TOKEN = "A".repeat(43);
    private SettlementService settlementService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        settlementService = mock(SettlementService.class);
        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        mockMvc = MockMvcBuilders
                .standaloneSetup(new SettlementController(settlementService))
                .setControllerAdvice(new GlobalExceptionHandler())
                .setValidator(validator)
                .build();
    }

    @Test
    void defaultsToFewerTransfersAndReturnsExactContractFields() throws Exception {
        when(settlementService.getSettlement(PUBLIC_TOKEN, SettlementStrategy.FEWER_TRANSFERS))
                .thenReturn(response());

        mockMvc.perform(get("/api/projects/{publicToken}/settlements", PUBLIC_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sourceStateFingerprint").value("a".repeat(64)))
                .andExpect(jsonPath("$.scopeType").value("PROJECT"))
                .andExpect(jsonPath("$.scopeKey").doesNotExist())
                .andExpect(jsonPath("$.strategy").value("FEWER_TRANSFERS"))
                .andExpect(jsonPath("$.state").value("CURRENT"))
                .andExpect(jsonPath("$.balances[0].roundingDifference").value(0))
                .andExpect(jsonPath("$.transfers[0].transferOrder").value(1))
                .andExpect(jsonPath("$.transfers[0].initiallyRoundedAmount").value(100))
                .andExpect(jsonPath("$.transfers[0].roundingAdjustment").value(1))
                .andExpect(jsonPath("$.transfers[0].explanation.kind")
                        .value("NET_BALANCE_MATCH"))
                .andExpect(jsonPath("$.transfers[0].explanation.fromExactBalanceBefore")
                        .value(-101));

        verify(settlementService)
                .getSettlement(PUBLIC_TOKEN, SettlementStrategy.FEWER_TRANSFERS);
    }

    @Test
    void selectsUnderstandableStrategy() throws Exception {
        SettlementResponse understandable = new SettlementResponse(
                response().runId(),
                response().sourceStateFingerprint(),
                SettlementScopeType.PROJECT,
                SettlementStrategy.UNDERSTANDABLE,
                SettlementRunState.CURRENT,
                response().generatedAt(),
                List.of(),
                List.of()
        );
        when(settlementService.getSettlement(PUBLIC_TOKEN, SettlementStrategy.UNDERSTANDABLE))
                .thenReturn(understandable);

        mockMvc.perform(get("/api/projects/{publicToken}/settlements", PUBLIC_TOKEN)
                        .queryParam("strategy", "UNDERSTANDABLE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.strategy").value("UNDERSTANDABLE"));
    }

    @Test
    void validatesAndTransportsCanonicalMonth() throws Exception {
        YearMonth month = YearMonth.of(9999, 12);
        SettlementResponse monthly = new SettlementResponse(
                response().runId(), response().sourceStateFingerprint(),
                SettlementScopeType.YEAR_MONTH, month.toString(),
                SettlementStrategy.FEWER_TRANSFERS, SettlementRunState.CURRENT,
                response().generatedAt(), List.of(), List.of());
        when(settlementService.getSettlement(PUBLIC_TOKEN,
                SettlementStrategy.FEWER_TRANSFERS, month)).thenReturn(monthly);

        mockMvc.perform(get("/api/projects/{publicToken}/settlements", PUBLIC_TOKEN)
                        .queryParam("month", "9999-12"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scopeType").value("YEAR_MONTH"))
                .andExpect(jsonPath("$.scopeKey").value("9999-12"));
        mockMvc.perform(get("/api/projects/{publicToken}/settlements", PUBLIC_TOKEN))
                .andExpect(status().isOk());
    }

    @Test
    void rejectsMalformedOrDuplicateMonthBeforeService() throws Exception {
        for (String month : List.of("", "2026-9", "0000-01", "2026-13", "bad")) {
            mockMvc.perform(get("/api/projects/{publicToken}/settlements", PUBLIC_TOKEN)
                            .queryParam("month", month))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        }
        mockMvc.perform(get("/api/projects/{publicToken}/settlements", PUBLIC_TOKEN)
                        .queryParam("month", "2026-09", "2026-10"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        verifyNoInteractions(settlementService);
    }

    @Test
    void rejectsInvalidPublicTokenWithoutCallingService() throws Exception {
        mockMvc.perform(get("/api/projects/{publicToken}/settlements", "invalid-token"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("publicToken"));

        verifyNoInteractions(settlementService);
    }

    @Test
    void rejectsMalformedOrEmptyStrategyAsValidationError() throws Exception {
        mockMvc.perform(get("/api/projects/{publicToken}/settlements", PUBLIC_TOKEN)
                        .queryParam("strategy", "fewer"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("strategy"));
        mockMvc.perform(get("/api/projects/{publicToken}/settlements", PUBLIC_TOKEN)
                        .queryParam("strategy", ""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

        verifyNoInteractions(settlementService);
    }

    @Test
    void mapsSettlementErrors() throws Exception {
        assertError(new ProjectNotFoundException(), "PROJECT_NOT_FOUND", 404);
        assertError(
                new SettlementScopeUnsupportedException(),
                "SETTLEMENT_SCOPE_UNSUPPORTED",
                409
        );
        assertError(
                new SettlementCalculationException(new IllegalArgumentException()),
                "SETTLEMENT_CALCULATION_INVALID",
                409
        );
        assertError(
                new SettlementRunUnavailableException(),
                "SETTLEMENT_RUN_UNAVAILABLE",
                409
        );
    }

    private void assertError(RuntimeException exception, String code, int statusCode)
            throws Exception {
        when(settlementService.getSettlement(anyString(), any(SettlementStrategy.class)))
                .thenThrow(exception);
        mockMvc.perform(get("/api/projects/{publicToken}/settlements", PUBLIC_TOKEN))
                .andExpect(status().is(statusCode))
                .andExpect(jsonPath("$.code").value(code));
    }

    private SettlementResponse response() {
        UUID payer = UUID.fromString("00000000-0000-0000-0000-000000000001");
        UUID recipient = UUID.fromString("00000000-0000-0000-0000-000000000002");
        return new SettlementResponse(
                UUID.fromString("00000000-0000-0000-0000-000000000003"),
                "a".repeat(64),
                SettlementScopeType.PROJECT,
                SettlementStrategy.FEWER_TRANSFERS,
                SettlementRunState.CURRENT,
                Instant.parse("2026-09-01T00:00:00Z"),
                List.of(new SettlementBalanceResponse(payer, 0, 101, -101, -101, 0)),
                List.of(new SettlementTransferResponse(
                        UUID.fromString("00000000-0000-0000-0000-000000000004"),
                        1,
                        payer,
                        recipient,
                        101,
                        100,
                        101,
                        1,
                        SettlementTransferStatus.OUTSTANDING,
                        null,
                        new SettlementTransferExplanationResponse(
                                SettlementExplanationKind.NET_BALANCE_MATCH,
                                -101,
                                101
                        )
                ))
        );
    }
}
