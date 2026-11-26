package com.splitmate.settlement.service;

public class SettlementRunUnavailableException extends RuntimeException {

    public SettlementRunUnavailableException() {
        super("A current settlement run is unavailable.");
    }
}
