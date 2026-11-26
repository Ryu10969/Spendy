package com.splitmate.project.dto;

import java.time.Instant;
import java.util.List;

import com.splitmate.project.domain.ProjectCurrency;
import com.splitmate.project.domain.ProjectStatus;
import com.splitmate.project.domain.ProjectType;

public record ProjectResponse(
        String publicToken,
        String name,
        String description,
        ProjectType type,
        ProjectCurrency currency,
        int roundingUnit,
        ProjectStatus status,
        List<ProjectMemberResponse> members,
        Instant createdAt,
        Instant updatedAt,
        Instant archivedAt
) {
    public ProjectResponse {
        members = List.copyOf(members);
    }
}
