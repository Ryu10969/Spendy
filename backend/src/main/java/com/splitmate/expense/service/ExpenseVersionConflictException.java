package com.splitmate.expense.service;

public class ExpenseVersionConflictException extends RuntimeException {

    public ExpenseVersionConflictException() {
        super("The expense was modified by another request.");
    }
}
