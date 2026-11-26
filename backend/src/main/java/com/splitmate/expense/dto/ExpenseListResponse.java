package com.splitmate.expense.dto;

import java.util.List;

public record ExpenseListResponse(List<ExpenseResponse> items) {
}
