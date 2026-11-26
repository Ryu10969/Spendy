package com.splitmate.analytics.dto;

import com.splitmate.expense.domain.ExpenseCategory;

public record AnalyticsCategoryResponse(ExpenseCategory category, long totalExpense, long expenseCount) {
}
