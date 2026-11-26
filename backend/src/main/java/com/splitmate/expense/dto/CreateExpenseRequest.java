package com.splitmate.expense.dto;

import static com.splitmate.expense.dto.ExpenseRequestConstraints.MAX_AMOUNT_YEN;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.splitmate.expense.domain.ExpenseCategory;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateExpenseRequest(
        @NotNull(message = "Payer member ID is required.")
        UUID payerMemberId,

        @NotEmpty(message = "At least one participant is required.")
        List<@NotNull(message = "Participant member ID is required.") UUID> participantMemberIds,

        @NotNull(message = "Amount is required.")
        @DecimalMin(value = "1", message = "Amount must be greater than zero.")
        @DecimalMax(
                value = MAX_AMOUNT_YEN,
                message = "Amount exceeds the JavaScript safe integer JPY range."
        )
        @Digits(integer = 19, fraction = 0, message = "Amount must be an integer.")
        BigDecimal amount,

        @NotBlank(message = "Content is required.")
        @Size(max = 100, message = "Content must be at most 100 characters.")
        String content,

        ExpenseCategory category,

        @Size(max = 1000, message = "Note must be at most 1000 characters.")
        String note,

        @NotNull(message = "Payment date is required.")
        LocalDate paidOn
) {
}
