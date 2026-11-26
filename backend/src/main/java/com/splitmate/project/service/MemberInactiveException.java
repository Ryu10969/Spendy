package com.splitmate.project.service;

public class MemberInactiveException extends RuntimeException {

    public MemberInactiveException() {
        super("Inactive members cannot be modified.");
    }
}
