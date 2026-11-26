package com.splitmate.project.dto;

import java.util.List;

public record ProjectPageResponse(
        List<ProjectResponse> items,
        int page,
        int size,
        long totalElements,
        int totalPages
) {
    public ProjectPageResponse {
        items = List.copyOf(items);
    }
}
