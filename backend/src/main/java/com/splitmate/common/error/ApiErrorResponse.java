package com.splitmate.common.error;

import java.time.Instant;
import java.util.List;

public record ApiErrorResponse(
        String code,
        String message,
        List<FieldError> fieldErrors,
        Instant timestamp
) {
    public ApiErrorResponse {
        fieldErrors = List.copyOf(fieldErrors);
    }

    public record FieldError(String field, String message) {
    }
}
