package com.splitmate.project.service;

public class ProjectArchivedException extends RuntimeException {

    public ProjectArchivedException() {
        super("Archived projects cannot be modified.");
    }
}
