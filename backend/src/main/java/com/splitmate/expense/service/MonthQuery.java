package com.splitmate.expense.service;

import java.time.YearMonth;
import java.util.List;

public final class MonthQuery {

    private MonthQuery() {
    }

    public static YearMonth parse(List<String> values) {
        return parse(values, "month");
    }

    public static YearMonth parse(List<String> values, String field) {
        if (values == null) {
            return null;
        }
        if (values.size() != 1 || values.getFirst() == null
                || !values.getFirst().matches("(?!0000)[0-9]{4}-(0[1-9]|1[0-2])")) {
            throw new ExpenseValidationException(field, "Month must be one canonical YYYY-MM value.");
        }
        return YearMonth.parse(values.getFirst());
    }
}
