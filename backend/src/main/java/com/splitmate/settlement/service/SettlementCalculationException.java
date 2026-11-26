package com.splitmate.settlement.service;

public class SettlementCalculationException extends RuntimeException {

    public SettlementCalculationException(Throwable cause) {
        super("Settlement inputs violate a calculation invariant.", cause);
    }
}
