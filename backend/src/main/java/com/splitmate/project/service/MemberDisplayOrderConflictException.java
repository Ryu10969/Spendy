package com.splitmate.project.service;

public class MemberDisplayOrderConflictException extends RuntimeException {

    public MemberDisplayOrderConflictException() {
        super("A project member display-order conflict occurred.");
    }
}
