package com.splitmate.project.dto;

import java.util.List;

import com.splitmate.project.domain.ProjectType;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateProjectRequest(
        @NotBlank(message = "Project name is required.")
        @Size(max = 100, message = "Project name must be at most 100 characters.")
        String name,

        @Size(max = 1000, message = "Description must be at most 1000 characters.")
        String description,

        @NotNull(message = "Project type is required.")
        ProjectType type,

        @NotNull(message = "Rounding unit is required.")
        @RoundingUnit
        Integer roundingUnit,

        @NotEmpty(message = "At least one member is required.")
        List<@Valid @NotNull(message = "Member is required.") CreateProjectMemberRequest> members
) {
}
