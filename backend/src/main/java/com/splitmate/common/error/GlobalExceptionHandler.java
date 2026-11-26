package com.splitmate.common.error;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.method.ParameterErrors;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import com.splitmate.expense.service.ExpenseNotFoundException;
import com.splitmate.analytics.service.AnalyticsAmountOutOfRangeException;
import com.splitmate.analytics.service.AnalyticsCalculationException;
import com.splitmate.analytics.service.AnalyticsScopeUnsupportedException;
import com.splitmate.expense.service.ExpenseValidationException;
import com.splitmate.expense.service.ExpenseVersionConflictException;
import com.splitmate.project.service.EventArchiveUnsupportedException;
import com.splitmate.project.service.MemberDisplayOrderConflictException;
import com.splitmate.project.service.MemberInactiveException;
import com.splitmate.project.service.MemberNotFoundException;
import com.splitmate.project.service.ProjectArchivedException;
import com.splitmate.project.service.ProjectNotFoundException;
import com.splitmate.project.service.ProjectPublicTokenConflictException;
import com.splitmate.settlement.service.SettlementCalculationException;
import com.splitmate.settlement.service.SettlementRunUnavailableException;
import com.splitmate.settlement.service.SettlementScopeUnsupportedException;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import tools.jackson.databind.exc.InvalidFormatException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiErrorResponse> handleValidation(MethodArgumentNotValidException exception) {
        List<ApiErrorResponse.FieldError> fieldErrors = exception.getBindingResult()
                .getFieldErrors()
                .stream()
                .map(error -> new ApiErrorResponse.FieldError(
                        error.getField(),
                        Objects.requireNonNullElse(error.getDefaultMessage(), "Invalid value.")
                ))
                .toList();

        return response(
                HttpStatus.BAD_REQUEST,
                "VALIDATION_ERROR",
                "Request validation failed.",
                fieldErrors
        );
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiErrorResponse> handleUnreadableMessage(
            HttpMessageNotReadableException exception
    ) {
        InvalidFormatException invalidFormat = findInvalidFormat(exception);
        if (invalidFormat != null && invalidFormat.getTargetType() == UUID.class) {
            String field = invalidFormat.getPath().stream()
                    .map(reference -> reference.getPropertyName())
                    .filter(Objects::nonNull)
                    .findFirst()
                    .orElse("request");
            return response(
                    HttpStatus.BAD_REQUEST,
                    "VALIDATION_ERROR",
                    "Request validation failed.",
                    List.of(new ApiErrorResponse.FieldError(field, "Invalid UUID value."))
            );
        }
        return response(
                HttpStatus.BAD_REQUEST,
                "MALFORMED_REQUEST",
                "Request body is malformed.",
                List.of()
        );
    }

    private InvalidFormatException findInvalidFormat(Throwable exception) {
        Throwable cause = exception;
        while (cause != null) {
            if (cause instanceof InvalidFormatException invalidFormat) {
                return invalidFormat;
            }
            cause = cause.getCause();
        }
        return null;
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiErrorResponse> handleConstraintViolation(
            ConstraintViolationException exception
    ) {
        List<ApiErrorResponse.FieldError> fieldErrors = exception.getConstraintViolations()
                .stream()
                .map(violation -> new ApiErrorResponse.FieldError(
                        fieldName(violation),
                        violation.getMessage()
                ))
                .toList();

        return response(
                HttpStatus.BAD_REQUEST,
                "VALIDATION_ERROR",
                "Request validation failed.",
                fieldErrors
        );
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    public ResponseEntity<ApiErrorResponse> handleMethodValidation(
            HandlerMethodValidationException exception
    ) {
        List<ApiErrorResponse.FieldError> fieldErrors = exception.getParameterValidationResults()
                .stream()
                .flatMap(result -> {
                    if (result instanceof ParameterErrors errors) {
                        return errors.getFieldErrors()
                                .stream()
                                .map(error -> new ApiErrorResponse.FieldError(
                                        error.getField(),
                                        Objects.requireNonNullElse(
                                                error.getDefaultMessage(),
                                                "Invalid value."
                                        )
                                ));
                    }
                    return result.getResolvableErrors()
                            .stream()
                            .map(error -> new ApiErrorResponse.FieldError(
                                    Objects.requireNonNullElse(
                                            result.getMethodParameter().getParameterName(),
                                            "request"
                                    ),
                                    Objects.requireNonNullElse(
                                            error.getDefaultMessage(),
                                            "Invalid value."
                                    )
                            ));
                })
                .toList();

        return response(
                HttpStatus.BAD_REQUEST,
                "VALIDATION_ERROR",
                "Request validation failed.",
                fieldErrors
        );
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiErrorResponse> handleTypeMismatch(
            MethodArgumentTypeMismatchException exception
    ) {
        return response(
                HttpStatus.BAD_REQUEST,
                "VALIDATION_ERROR",
                "Request validation failed.",
                List.of(new ApiErrorResponse.FieldError(exception.getName(), "Invalid value."))
        );
    }

    @ExceptionHandler(ProjectNotFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleProjectNotFound() {
        return response(
                HttpStatus.NOT_FOUND,
                "PROJECT_NOT_FOUND",
                "Project was not found.",
                List.of()
        );
    }

    @ExceptionHandler(ProjectPublicTokenConflictException.class)
    public ResponseEntity<ApiErrorResponse> handleProjectPublicTokenConflict() {
        return response(
                HttpStatus.CONFLICT,
                "PROJECT_PUBLIC_TOKEN_CONFLICT",
                "A project public token conflict occurred.",
                List.of()
        );
    }

    @ExceptionHandler(MemberNotFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleMemberNotFound() {
        return response(
                HttpStatus.NOT_FOUND,
                "MEMBER_NOT_FOUND",
                "Member was not found.",
                List.of()
        );
    }

    @ExceptionHandler(ProjectArchivedException.class)
    public ResponseEntity<ApiErrorResponse> handleProjectArchived() {
        return response(
                HttpStatus.CONFLICT,
                "PROJECT_ARCHIVED",
                "Archived projects cannot be modified.",
                List.of()
        );
    }

    @ExceptionHandler(EventArchiveUnsupportedException.class)
    public ResponseEntity<ApiErrorResponse> handleEventArchiveUnsupported() {
        return response(
                HttpStatus.CONFLICT,
                "EVENT_ARCHIVE_UNSUPPORTED",
                "Event archive is not supported for this project.",
                List.of()
        );
    }

    @ExceptionHandler(MemberInactiveException.class)
    public ResponseEntity<ApiErrorResponse> handleMemberInactive() {
        return response(
                HttpStatus.CONFLICT,
                "MEMBER_INACTIVE",
                "Inactive members cannot be modified.",
                List.of()
        );
    }

    @ExceptionHandler(ExpenseValidationException.class)
    public ResponseEntity<ApiErrorResponse> handleExpenseValidation(
            ExpenseValidationException exception
    ) {
        return response(
                HttpStatus.BAD_REQUEST,
                "VALIDATION_ERROR",
                "Request validation failed.",
                List.of(new ApiErrorResponse.FieldError(
                        exception.getField(),
                        exception.getMessage()
                ))
        );
    }

    @ExceptionHandler(ExpenseNotFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleExpenseNotFound() {
        return response(
                HttpStatus.NOT_FOUND,
                "EXPENSE_NOT_FOUND",
                "Expense was not found.",
                List.of()
        );
    }

    @ExceptionHandler(ExpenseVersionConflictException.class)
    public ResponseEntity<ApiErrorResponse> handleExpenseVersionConflict() {
        return response(
                HttpStatus.CONFLICT,
                "EXPENSE_VERSION_CONFLICT",
                "The expense was modified by another request.",
                List.of()
        );
    }

    @ExceptionHandler(MemberDisplayOrderConflictException.class)
    public ResponseEntity<ApiErrorResponse> handleMemberDisplayOrderConflict() {
        return response(
                HttpStatus.CONFLICT,
                "MEMBER_DISPLAY_ORDER_CONFLICT",
                "A project member display-order conflict occurred.",
                List.of()
        );
    }

    @ExceptionHandler(SettlementScopeUnsupportedException.class)
    public ResponseEntity<ApiErrorResponse> handleSettlementScopeUnsupported() {
        return response(
                HttpStatus.CONFLICT,
                "SETTLEMENT_SCOPE_UNSUPPORTED",
                "Settlement scope is not supported for this project.",
                List.of()
        );
    }

    @ExceptionHandler(AnalyticsScopeUnsupportedException.class)
    public ResponseEntity<ApiErrorResponse> handleAnalyticsScopeUnsupported() {
        return response(HttpStatus.CONFLICT, "ANALYTICS_SCOPE_UNSUPPORTED",
                "Analytics scope is not supported for this project.", List.of());
    }

    @ExceptionHandler(AnalyticsCalculationException.class)
    public ResponseEntity<ApiErrorResponse> handleAnalyticsCalculationInvalid() {
        return response(HttpStatus.CONFLICT, "ANALYTICS_CALCULATION_INVALID",
                "Analytics inputs violate a calculation invariant.", List.of());
    }

    @ExceptionHandler(AnalyticsAmountOutOfRangeException.class)
    public ResponseEntity<ApiErrorResponse> handleAnalyticsAmountOutOfRange() {
        return response(HttpStatus.CONFLICT, "ANALYTICS_AMOUNT_OUT_OF_RANGE",
                "Analytics amounts or counts exceed the exact supported range.", List.of());
    }

    @ExceptionHandler(SettlementCalculationException.class)
    public ResponseEntity<ApiErrorResponse> handleSettlementCalculationInvalid() {
        return response(
                HttpStatus.CONFLICT,
                "SETTLEMENT_CALCULATION_INVALID",
                "Settlement inputs violate a calculation invariant.",
                List.of()
        );
    }

    @ExceptionHandler(SettlementRunUnavailableException.class)
    public ResponseEntity<ApiErrorResponse> handleSettlementRunUnavailable() {
        return response(
                HttpStatus.CONFLICT,
                "SETTLEMENT_RUN_UNAVAILABLE",
                "A current settlement run is unavailable.",
                List.of()
        );
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleMissingResource() {
        return response(
                HttpStatus.NOT_FOUND,
                "NOT_FOUND",
                "The requested resource was not found.",
                List.of()
        );
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorResponse> handleUnexpected(Exception exception) {
        log.error("Unexpected backend failure", exception);
        return response(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "An unexpected server error occurred.",
                List.of()
        );
    }

    private ResponseEntity<ApiErrorResponse> response(
            HttpStatus status,
            String code,
            String message,
            List<ApiErrorResponse.FieldError> fieldErrors
    ) {
        return ResponseEntity.status(status)
                .body(new ApiErrorResponse(code, message, fieldErrors, Instant.now()));
    }

    private String fieldName(ConstraintViolation<?> violation) {
        String fieldName = "request";
        for (var node : violation.getPropertyPath()) {
            if (node.getName() != null) {
                fieldName = node.getName();
            }
        }
        return fieldName;
    }
}
