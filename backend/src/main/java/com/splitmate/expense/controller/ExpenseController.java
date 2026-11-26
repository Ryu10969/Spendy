package com.splitmate.expense.controller;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.splitmate.expense.dto.CreateExpenseRequest;
import com.splitmate.expense.dto.ExpenseListResponse;
import com.splitmate.expense.dto.ExpenseResponse;
import com.splitmate.expense.dto.UpdateExpenseRequest;
import com.splitmate.expense.service.ExpenseService;
import com.splitmate.expense.service.MonthQuery;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;

@RestController
@RequestMapping("/api/projects/{publicToken}/expenses")
public class ExpenseController {

    private final ExpenseService expenseService;

    public ExpenseController(ExpenseService expenseService) {
        this.expenseService = expenseService;
    }

    @GetMapping
    public ExpenseListResponse getExpenses(
            @PathVariable
            @Pattern(
                    regexp = "[A-Za-z0-9_-]{43}",
                    message = "Public token must be a 43-character Base64url value."
            )
            String publicToken,
            @RequestParam(name = "month", required = false) List<String> month
    ) {
        var selectedMonth = MonthQuery.parse(month);
        return selectedMonth == null
                ? expenseService.getExpenses(publicToken)
                : expenseService.getExpenses(publicToken, selectedMonth);
    }

    @PostMapping
    public ResponseEntity<ExpenseResponse> createExpense(
            @PathVariable
            @Pattern(
                    regexp = "[A-Za-z0-9_-]{43}",
                    message = "Public token must be a 43-character Base64url value."
            )
            String publicToken,
            @Valid @RequestBody CreateExpenseRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(expenseService.createExpense(publicToken, request));
    }

    @PatchMapping("/{expenseId}")
    public ExpenseResponse updateExpense(
            @PathVariable
            @Pattern(
                    regexp = "[A-Za-z0-9_-]{43}",
                    message = "Public token must be a 43-character Base64url value."
            )
            String publicToken,
            @PathVariable UUID expenseId,
            @Valid @RequestBody UpdateExpenseRequest request
    ) {
        return expenseService.updateExpense(publicToken, expenseId, request);
    }

    @DeleteMapping("/{expenseId}")
    public ResponseEntity<Void> deleteExpense(
            @PathVariable
            @Pattern(
                    regexp = "[A-Za-z0-9_-]{43}",
                    message = "Public token must be a 43-character Base64url value."
            )
            String publicToken,
            @PathVariable UUID expenseId
    ) {
        expenseService.deleteExpense(publicToken, expenseId);
        return ResponseEntity.noContent().build();
    }
}
