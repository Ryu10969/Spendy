package com.splitmate.project.service;

public class ProjectNotFoundException extends RuntimeException {

    public ProjectNotFoundException() {
        super("Project was not found.");
    }
}
