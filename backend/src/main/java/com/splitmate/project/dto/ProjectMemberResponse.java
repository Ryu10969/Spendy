package com.splitmate.project.dto;

import java.util.UUID;

public record ProjectMemberResponse(
        UUID id,
        String name,
        int displayOrder,
        boolean active
) {
}
