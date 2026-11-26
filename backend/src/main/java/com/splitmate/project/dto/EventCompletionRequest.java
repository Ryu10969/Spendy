package com.splitmate.project.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;

public record EventCompletionRequest(
        @NotNull(message = "Confirmation is required.")
        @AssertTrue(message = "Confirmation must be true.")
        Boolean confirmed
) {
}
