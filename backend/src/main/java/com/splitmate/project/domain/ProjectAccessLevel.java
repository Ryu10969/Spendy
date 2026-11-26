package com.splitmate.project.domain;

/**
 * Role-only permission matrix from ADR-0008 §8, not proof of authorization.
 * A future service must derive this level for the target Project from freshly
 * validated credentials and relationships, never from client role flags,
 * a publicToken alone or a member ID.
 * Transient and saved sharing have the same Project editor permissions, but
 * their credential, registration and source-grant checks remain separate.
 * Lifecycle and operation-specific domain checks must also succeed.
 */
public enum ProjectAccessLevel {
    NONE,
    SHARED_EDITOR,
    ADMINISTRATOR;

    public boolean allows(ProjectPermission permission) {
        if (permission == null) {
            return false;
        }
        return switch (permission) {
            case READ_PROJECT, READ_MEMBERS, READ_EXPENSES,
                    CREATE_EXPENSE, UPDATE_EXPENSE, DELETE_EXPENSE,
                    VIEW_SETTLEMENT, VIEW_DETAIL_ANALYTICS ->
                    this == ADMINISTRATOR || this == SHARED_EDITOR;
            case CHANGE_SETTINGS, MANAGE_MEMBERS, ARCHIVE_PROJECT,
                    DELETE_PROJECT, MANAGE_SHARING -> this == ADMINISTRATOR;
        };
    }
}
