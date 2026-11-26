package com.splitmate.analytics.service;

public class AnalyticsCalculationException extends RuntimeException {
    public AnalyticsCalculationException() {
        super("Analytics inputs violate a calculation invariant.");
    }
}
