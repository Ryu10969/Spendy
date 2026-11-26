package com.splitmate.analytics.dto;

import java.util.UUID;

public record AnalyticsMemberResponse(
        UUID memberId,
        String name,
        int displayOrder,
        boolean active,
        long paidAmount,
        long burdenAmount,
        long exactBalance
) {
}
