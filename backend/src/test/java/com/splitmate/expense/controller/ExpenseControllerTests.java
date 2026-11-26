package com.splitmate.expense.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;

import com.splitmate.common.error.GlobalExceptionHandler;
import com.splitmate.expense.domain.ExpenseCategory;
import com.splitmate.expense.dto.CreateExpenseRequest;
import com.splitmate.expense.dto.ExpenseListResponse;
import com.splitmate.expense.dto.ExpenseParticipantResponse;
import com.splitmate.expense.dto.ExpenseRequestConstraints;
import com.splitmate.expense.dto.ExpenseResponse;
import com.splitmate.expense.dto.UpdateExpenseRequest;
import com.splitmate.expense.service.ExpenseNotFoundException;
import com.splitmate.expense.service.ExpenseService;
import com.splitmate.expense.service.ExpenseValidationException;
import com.splitmate.expense.service.ExpenseVersionConflictException;
import com.splitmate.project.service.MemberInactiveException;
import com.splitmate.project.service.MemberNotFoundException;
import com.splitmate.project.service.ProjectArchivedException;
import com.splitmate.project.service.ProjectNotFoundException;

class ExpenseControllerTests {

    private static final String PUBLIC_TOKEN = "A".repeat(43);
    private static final UUID EXPENSE_ID =
            UUID.fromString("a2c7cc58-0cf6-4d42-9326-b9901496fe23");
    private static final UUID PAYER_ID =
            UUID.fromString("4ae57cf6-0617-4f43-a865-d02a90f4805d");
    private static final UUID PARTICIPANT_ID =
            UUID.fromString("19d49076-8b07-4ef4-aa16-27c877fcefb1");
    private static final String MAX_AMOUNT_YEN = ExpenseRequestConstraints.MAX_AMOUNT_YEN;
    private static final String ABOVE_MAX_AMOUNT_YEN = "9007199254740992";

    private MockMvc mockMvc;
    private ExpenseService expenseService;

    @BeforeEach
    void setUp() {
        expenseService = mock(ExpenseService.class);
        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        mockMvc = MockMvcBuilders
                .standaloneSetup(new ExpenseController(expenseService))
                .setControllerAdvice(new GlobalExceptionHandler())
                .setValidator(validator)
                .build();
    }

    @Test
    void listsExpensesWithContractFields() throws Exception {
        when(expenseService.getExpenses(PUBLIC_TOKEN))
                .thenReturn(new ExpenseListResponse(List.of(expenseResponse())));

        mockMvc.perform(get("/api/projects/{publicToken}/expenses", PUBLIC_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(EXPENSE_ID.toString()))
                .andExpect(jsonPath("$.items[0].payerMemberId").value(PAYER_ID.toString()))
                .andExpect(jsonPath("$.items[0].amount").value(1_001))
                .andExpect(jsonPath("$.items[0].category").value("FOOD"))
                .andExpect(jsonPath("$.items[0].version").value(0))
                .andExpect(jsonPath("$.items[0].participants[0].memberId")
                        .value(PARTICIPANT_ID.toString()))
                .andExpect(jsonPath("$.items[0].participants[0].allocatedShare").value(1_001))
                .andExpect(jsonPath("$.items[0].participants[0].allocationOrder").value(1));
    }

    @Test
    void listsEmptyExpenses() throws Exception {
        when(expenseService.getExpenses(PUBLIC_TOKEN))
                .thenReturn(new ExpenseListResponse(List.of()));

        mockMvc.perform(get("/api/projects/{publicToken}/expenses", PUBLIC_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty());
    }

    @Test
    void filtersByCanonicalMonthAndRejectsInvalidCardinality() throws Exception {
        when(expenseService.getExpenses(PUBLIC_TOKEN, YearMonth.of(2026, 9)))
                .thenReturn(new ExpenseListResponse(List.of(expenseResponse())));
        mockMvc.perform(get("/api/projects/{publicToken}/expenses", PUBLIC_TOKEN)
                        .queryParam("month", "2026-09"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(EXPENSE_ID.toString()));
        for (String invalid : List.of("", "bad", "0000-01", "2026-9")) {
            mockMvc.perform(get("/api/projects/{publicToken}/expenses", PUBLIC_TOKEN)
                            .queryParam("month", invalid))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        }
        mockMvc.perform(get("/api/projects/{publicToken}/expenses", PUBLIC_TOKEN)
                        .queryParam("month", "2026-09", "2026-09"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void createsExpenseAndReturns201() throws Exception {
        when(expenseService.createExpense(anyString(), any(CreateExpenseRequest.class)))
                .thenReturn(expenseResponse());

        mockMvc.perform(post("/api/projects/{publicToken}/expenses", PUBLIC_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validCreateJson()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(EXPENSE_ID.toString()))
                .andExpect(jsonPath("$.note").value("Shared meal"));
    }

    @Test
    void updatesCompleteExpenseStateAndReturns200() throws Exception {
        ExpenseResponse cleared = new ExpenseResponse(
                EXPENSE_ID,
                PAYER_ID,
                1_001,
                "Dinner",
                null,
                null,
                LocalDate.of(2026, 8, 25),
                1,
                expenseResponse().participants(),
                expenseResponse().createdAt(),
                expenseResponse().updatedAt()
        );
        when(expenseService.updateExpense(
                anyString(),
                any(UUID.class),
                any(UpdateExpenseRequest.class)
        )).thenReturn(cleared);

        mockMvc.perform(patch(
                        "/api/projects/{publicToken}/expenses/{expenseId}",
                        PUBLIC_TOKEN,
                        EXPENSE_ID
                )
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validUpdateJson()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.category").doesNotExist())
                .andExpect(jsonPath("$.note").doesNotExist())
                .andExpect(jsonPath("$.version").value(1));
    }

    @Test
    void deletesExpenseAndReturns204WithoutBody() throws Exception {
        mockMvc.perform(delete(
                        "/api/projects/{publicToken}/expenses/{expenseId}",
                        PUBLIC_TOKEN,
                        EXPENSE_ID
                ))
                .andExpect(status().isNoContent())
                .andExpect(content().string(""));
    }

    @Test
    void rejectsInvalidCreateFieldsWithoutCallingService() throws Exception {
        mockMvc.perform(post("/api/projects/{publicToken}/expenses", PUBLIC_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "payerMemberId": null,
                                  "participantMemberIds": [],
                                  "amount": 0,
                                  "content": " ",
                                  "category": null,
                                  "note": "%s",
                                  "paidOn": null
                                }
                                """.formatted("N".repeat(1_001))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors").isArray());

        verifyNoInteractions(expenseService);
    }

    @Test
    void rejectsDecimalAmountWithoutCallingService() throws Exception {
        mockMvc.perform(post("/api/projects/{publicToken}/expenses", PUBLIC_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validCreateJson().replace("\"amount\": 1001", "\"amount\": 1.5")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("amount"));

        verifyNoInteractions(expenseService);
    }

    @Test
    void acceptsMaximumSafeIntegerAmountForCreate() throws Exception {
        when(expenseService.createExpense(anyString(), any(CreateExpenseRequest.class)))
                .thenReturn(expenseResponse());

        mockMvc.perform(post("/api/projects/{publicToken}/expenses", PUBLIC_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(withAmount(validCreateJson(), MAX_AMOUNT_YEN)))
                .andExpect(status().isCreated());
    }

    @Test
    void rejectsAmountAboveMaximumSafeIntegerForCreateWithoutCallingService() throws Exception {
        mockMvc.perform(post("/api/projects/{publicToken}/expenses", PUBLIC_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(withAmount(validCreateJson(), ABOVE_MAX_AMOUNT_YEN)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("amount"));

        verifyNoInteractions(expenseService);
    }

    @Test
    void acceptsMaximumSafeIntegerAmountForUpdate() throws Exception {
        when(expenseService.updateExpense(
                anyString(),
                any(UUID.class),
                any(UpdateExpenseRequest.class)
        )).thenReturn(expenseResponse());

        mockMvc.perform(patch(
                        "/api/projects/{publicToken}/expenses/{expenseId}",
                        PUBLIC_TOKEN,
                        EXPENSE_ID
                )
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(withAmount(validUpdateJson(), MAX_AMOUNT_YEN)))
                .andExpect(status().isOk());
    }

    @Test
    void rejectsAmountAboveMaximumSafeIntegerForUpdateWithoutCallingService() throws Exception {
        mockMvc.perform(patch(
                        "/api/projects/{publicToken}/expenses/{expenseId}",
                        PUBLIC_TOKEN,
                        EXPENSE_ID
                )
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(withAmount(validUpdateJson(), ABOVE_MAX_AMOUNT_YEN)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("amount"));

        verifyNoInteractions(expenseService);
    }

    @Test
    void rejectsMissingVersionOnUpdate() throws Exception {
        mockMvc.perform(patch(
                        "/api/projects/{publicToken}/expenses/{expenseId}",
                        PUBLIC_TOKEN,
                        EXPENSE_ID
                )
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validUpdateJson().replace("\"version\": 0", "\"version\": null")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("version"));

        verifyNoInteractions(expenseService);
    }

    @Test
    void rejectsInvalidExpenseUuid() throws Exception {
        mockMvc.perform(delete(
                        "/api/projects/{publicToken}/expenses/{expenseId}",
                        PUBLIC_TOKEN,
                        "not-a-uuid"
                ))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("expenseId"));

        verifyNoInteractions(expenseService);
    }

    @Test
    void rejectsInvalidRequestMemberUuidAsValidationError() throws Exception {
        mockMvc.perform(post("/api/projects/{publicToken}/expenses", PUBLIC_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validCreateJson().replace(PAYER_ID.toString(), "not-a-uuid")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("payerMemberId"));

        verifyNoInteractions(expenseService);
    }

    @Test
    void preservesMalformedJsonHandling() throws Exception {
        mockMvc.perform(post("/api/projects/{publicToken}/expenses", PUBLIC_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));

        verifyNoInteractions(expenseService);
    }

    @Test
    void mapsApprovedExpenseBusinessErrors() throws Exception {
        assertCreateError(new ProjectNotFoundException(), "PROJECT_NOT_FOUND", 404);
        assertCreateError(new ProjectArchivedException(), "PROJECT_ARCHIVED", 409);
        assertCreateError(new MemberNotFoundException(), "MEMBER_NOT_FOUND", 404);
        assertCreateError(new MemberInactiveException(), "MEMBER_INACTIVE", 409);
        assertCreateError(
                new ExpenseValidationException(
                        "participantMemberIds",
                        "Participant member IDs must be unique."
                ),
                "VALIDATION_ERROR",
                400
        );
    }

    @Test
    void mapsExpenseNotFoundAndVersionConflict() throws Exception {
        assertUpdateError(new ExpenseNotFoundException(), "EXPENSE_NOT_FOUND", 404);
        assertUpdateError(
                new ExpenseVersionConflictException(),
                "EXPENSE_VERSION_CONFLICT",
                409
        );
    }

    private void assertCreateError(
            RuntimeException exception,
            String code,
            int statusCode
    ) throws Exception {
        when(expenseService.createExpense(anyString(), any(CreateExpenseRequest.class)))
                .thenThrow(exception);

        mockMvc.perform(post("/api/projects/{publicToken}/expenses", PUBLIC_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validCreateJson()))
                .andExpect(status().is(statusCode))
                .andExpect(jsonPath("$.code").value(code));
    }

    private void assertUpdateError(
            RuntimeException exception,
            String code,
            int statusCode
    ) throws Exception {
        when(expenseService.updateExpense(
                anyString(),
                any(UUID.class),
                any(UpdateExpenseRequest.class)
        )).thenThrow(exception);

        mockMvc.perform(patch(
                        "/api/projects/{publicToken}/expenses/{expenseId}",
                        PUBLIC_TOKEN,
                        EXPENSE_ID
                )
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validUpdateJson()))
                .andExpect(status().is(statusCode))
                .andExpect(jsonPath("$.code").value(code));
    }

    private String validCreateJson() {
        return """
                {
                  "payerMemberId": "%s",
                  "participantMemberIds": ["%s"],
                  "amount": 1001,
                  "content": "Dinner",
                  "category": "FOOD",
                  "note": "Shared meal",
                  "paidOn": "2026-08-25"
                }
                """.formatted(PAYER_ID, PARTICIPANT_ID);
    }

    private String validUpdateJson() {
        return """
                {
                  "payerMemberId": "%s",
                  "participantMemberIds": ["%s"],
                  "amount": 1001,
                  "content": "Dinner",
                  "category": null,
                  "note": null,
                  "paidOn": "2026-08-25",
                  "version": 0
                }
                """.formatted(PAYER_ID, PARTICIPANT_ID);
    }

    private String withAmount(String requestJson, String amount) {
        return requestJson.replace("\"amount\": 1001", "\"amount\": " + amount);
    }

    private ExpenseResponse expenseResponse() {
        Instant timestamp = Instant.parse("2026-08-25T12:00:00Z");
        return new ExpenseResponse(
                EXPENSE_ID,
                PAYER_ID,
                1_001,
                "Dinner",
                ExpenseCategory.FOOD,
                "Shared meal",
                LocalDate.of(2026, 8, 25),
                0,
                List.of(new ExpenseParticipantResponse(PARTICIPANT_ID, 1_001, 1)),
                timestamp,
                timestamp
        );
    }
}
