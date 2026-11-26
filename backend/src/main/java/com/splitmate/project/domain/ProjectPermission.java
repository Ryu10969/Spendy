package com.splitmate.project.domain;

/** Project-scoped operations from ADR-0008 §8; not API or persistence values. */
public enum ProjectPermission {
    READ_PROJECT,
    READ_MEMBERS,
    READ_EXPENSES,
    CREATE_EXPENSE,
    UPDATE_EXPENSE,
    DELETE_EXPENSE,
    VIEW_SETTLEMENT,
    VIEW_DETAIL_ANALYTICS,
    CHANGE_SETTINGS,
    MANAGE_MEMBERS,
    ARCHIVE_PROJECT,
    DELETE_PROJECT,
    MANAGE_SHARING
}
