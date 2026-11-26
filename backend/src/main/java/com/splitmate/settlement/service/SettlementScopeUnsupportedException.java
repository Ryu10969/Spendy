package com.splitmate.settlement.service;

public class SettlementScopeUnsupportedException extends RuntimeException {

    public SettlementScopeUnsupportedException() {
        super("Settlement scope is not supported for this project.");
    }
}
