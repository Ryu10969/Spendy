package com.splitmate.project.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

class ProjectAccessLevelTests {

    @ParameterizedTest
    @EnumSource(ProjectPermission.class)
    void noAccessDeniesEveryProjectOperation(ProjectPermission permission) {
        assertThat(ProjectAccessLevel.NONE.allows(permission)).isFalse();
    }

    @ParameterizedTest
    @EnumSource(ProjectPermission.class)
    void administratorPassesRoleCheckForEveryProjectOperation(ProjectPermission permission) {
        assertThat(ProjectAccessLevel.ADMINISTRATOR.allows(permission)).isTrue();
    }

    @ParameterizedTest
    @EnumSource(value = ProjectPermission.class, names = {
            "READ_PROJECT", "READ_MEMBERS", "READ_EXPENSES",
            "CREATE_EXPENSE", "UPDATE_EXPENSE", "DELETE_EXPENSE",
            "VIEW_SETTLEMENT", "VIEW_DETAIL_ANALYTICS"
    })
    void sharedEditorCanReadTargetAndEditAllItsExpenses(ProjectPermission permission) {
        assertThat(ProjectAccessLevel.SHARED_EDITOR.allows(permission)).isTrue();
    }

    @ParameterizedTest
    @EnumSource(value = ProjectPermission.class, names = {
            "CHANGE_SETTINGS", "MANAGE_MEMBERS", "ARCHIVE_PROJECT",
            "DELETE_PROJECT", "MANAGE_SHARING"
    })
    void sharedEditorCannotPerformAdministratorOperations(ProjectPermission permission) {
        assertThat(ProjectAccessLevel.SHARED_EDITOR.allows(permission)).isFalse();
    }

    @ParameterizedTest
    @EnumSource(ProjectAccessLevel.class)
    void missingPermissionIsDenied(ProjectAccessLevel accessLevel) {
        assertThat(accessLevel.allows(null)).isFalse();
    }
}
