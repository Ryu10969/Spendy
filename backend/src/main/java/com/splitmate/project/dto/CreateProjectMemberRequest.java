package com.splitmate.project.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateProjectMemberRequest(
        @NotBlank(message = "Member name is required.")
        @Size(max = 100, message = "Member name must be at most 100 characters.")
        String name
) {
}
