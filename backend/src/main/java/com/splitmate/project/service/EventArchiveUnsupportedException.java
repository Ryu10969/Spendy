package com.splitmate.project.service;

public class EventArchiveUnsupportedException extends RuntimeException {

    public EventArchiveUnsupportedException() {
        super("Event archive is not supported for this project.");
    }
}
