package com.splitmate.expense.service;

public class ExpenseValidationException extends RuntimeException {

    private final String field;

    public ExpenseValidationException(String field, String message) {
        super(message);
        this.field = field;
    }

    public String getField() {
        return field;
    }
}
