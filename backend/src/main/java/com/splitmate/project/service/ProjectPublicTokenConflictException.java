package com.splitmate.project.service;

public class ProjectPublicTokenConflictException extends RuntimeException {

    public ProjectPublicTokenConflictException() {
        super("A project public token conflict occurred.");
    }
}
