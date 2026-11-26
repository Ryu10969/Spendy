package com.splitmate.expense.service;

public class ExpenseNotFoundException extends RuntimeException {

    public ExpenseNotFoundException() {
        super("Expense was not found.");
    }
}
