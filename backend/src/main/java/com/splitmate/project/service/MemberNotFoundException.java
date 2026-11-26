package com.splitmate.project.service;

public class MemberNotFoundException extends RuntimeException {

    public MemberNotFoundException() {
        super("Member was not found.");
    }
}
