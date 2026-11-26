package com.splitmate.project.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.hibernate.exception.ConstraintViolationException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

import com.splitmate.project.domain.Project;
import com.splitmate.project.domain.ProjectCurrency;
import com.splitmate.project.domain.ProjectMember;
import com.splitmate.project.domain.ProjectStatus;
import com.splitmate.project.domain.ProjectType;
import com.splitmate.project.dto.CreateProjectMemberRequest;
import com.splitmate.project.dto.CreateProjectRequest;
import com.splitmate.project.dto.ProjectResponse;
import com.splitmate.project.dto.RenameProjectMemberRequest;
import com.splitmate.project.repository.ProjectMemberRepository;
import com.splitmate.project.repository.ProjectRepository;

@ExtendWith(MockitoExtension.class)
class ProjectServiceTests {

    private static final String PUBLIC_TOKEN = "A".repeat(43);

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private ProjectMemberRepository projectMemberRepository;

    @Mock
    private PublicTokenGenerator publicTokenGenerator;

    private ProjectService projectService;

    @BeforeEach
    void setUp() {
        projectService = new ProjectService(
                projectRepository,
                projectMemberRepository,
                publicTokenGenerator
        );
    }

    @Test
    void returnsEmptyListWhenNoProjectsArePersisted() {
        when(projectRepository.findAllByDeletedAtIsNullOrderByUpdatedAtDescCreatedAtDescIdAsc())
                .thenReturn(List.of());

        assertThat(projectService.getProjects()).isEmpty();
        verifyNoInteractions(projectMemberRepository);
    }

    @Test
    void createsProjectAndInitialMembersInInputOrder() {
        when(publicTokenGenerator.generate()).thenReturn(PUBLIC_TOKEN);
        when(projectRepository.saveAndFlush(any(Project.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(projectMemberRepository.saveAll(anyList()))
                .thenAnswer(invocation -> invocation.getArgument(0));
        CreateProjectRequest request = new CreateProjectRequest(
                "沖縄旅行",
                "3泊4日の旅行",
                ProjectType.EVENT,
                10,
                List.of(
                        new CreateProjectMemberRequest("  さくら  "),
                        new CreateProjectMemberRequest("太郎")
                )
        );

        ProjectResponse response = projectService.createProject(request);

        ArgumentCaptor<Project> projectCaptor = ArgumentCaptor.forClass(Project.class);
        verify(projectRepository).saveAndFlush(projectCaptor.capture());
        Project savedProject = projectCaptor.getValue();
        assertThat(savedProject.getPublicToken()).isEqualTo(PUBLIC_TOKEN);
        assertThat(savedProject.getCurrency()).isEqualTo(ProjectCurrency.JPY);
        assertThat(savedProject.getStatus()).isEqualTo(ProjectStatus.ACTIVE);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ProjectMember>> membersCaptor = ArgumentCaptor.forClass(List.class);
        verify(projectMemberRepository).saveAll(membersCaptor.capture());
        assertThat(membersCaptor.getValue())
                .extracting(ProjectMember::getName, ProjectMember::getDisplayOrder)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("さくら", 1),
                        org.assertj.core.groups.Tuple.tuple("太郎", 2)
                );
        assertThat(membersCaptor.getValue())
                .allSatisfy(member -> assertThat(member.getProject()).isSameAs(savedProject));

        assertThat(response.publicToken()).isEqualTo(PUBLIC_TOKEN);
        assertThat(response.currency()).isEqualTo(ProjectCurrency.JPY);
        assertThat(response.status()).isEqualTo(ProjectStatus.ACTIVE);
        assertThat(response.members())
                .extracting(member -> member.name(), member -> member.displayOrder())
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("さくら", 1),
                        org.assertj.core.groups.Tuple.tuple("太郎", 2)
                );
    }

    @Test
    void convertsOnlyPublicTokenUniqueConstraintToProjectConflict() {
        DataIntegrityViolationException databaseException = databaseException(
                "uq_projects_public_token"
        );
        when(publicTokenGenerator.generate()).thenReturn(PUBLIC_TOKEN);
        when(projectRepository.saveAndFlush(any(Project.class))).thenThrow(databaseException);

        assertThatThrownBy(() -> projectService.createProject(validRequest()))
                .isInstanceOf(ProjectPublicTokenConflictException.class)
                .hasMessage("A project public token conflict occurred.")
                .hasMessageNotContaining(PUBLIC_TOKEN)
                .hasNoCause();
        verifyNoInteractions(projectMemberRepository);
    }

    @Test
    void doesNotConvertOtherDataIntegrityViolationToPublicTokenConflict() {
        DataIntegrityViolationException databaseException = databaseException(
                "chk_projects_name_not_blank"
        );
        when(publicTokenGenerator.generate()).thenReturn(PUBLIC_TOKEN);
        when(projectRepository.saveAndFlush(any(Project.class))).thenThrow(databaseException);

        assertThatThrownBy(() -> projectService.createProject(validRequest()))
                .isSameAs(databaseException);
        verifyNoInteractions(projectMemberRepository);
    }

    @Test
    void getsProjectAndReturnsMembersInDisplayOrder() {
        Project project = new Project(
                PUBLIC_TOKEN,
                "共同生活費",
                null,
                ProjectType.CONTINUOUS,
                100
        );
        when(projectRepository.findByPublicTokenAndDeletedAtIsNull(PUBLIC_TOKEN)).thenReturn(Optional.of(project));
        when(projectMemberRepository.findAllByProject_IdOrderByDisplayOrderAsc(project.getId()))
                .thenReturn(List.of(
                        new ProjectMember(project, "太郎", 1),
                        new ProjectMember(project, "さくら", 2)
                ));

        ProjectResponse response = projectService.getProject(PUBLIC_TOKEN);

        assertThat(response.members())
                .extracting(member -> member.name(), member -> member.displayOrder())
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("太郎", 1),
                        org.assertj.core.groups.Tuple.tuple("さくら", 2)
                );
    }

    @Test
    void throwsProjectNotFoundWhenPublicTokenDoesNotExist() {
        when(projectRepository.findByPublicTokenAndDeletedAtIsNull(PUBLIC_TOKEN)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> projectService.getProject(PUBLIC_TOKEN))
                .isInstanceOf(ProjectNotFoundException.class)
                .hasMessage("Project was not found.");
    }

    @Test
    void addsTrimmedActiveMemberAfterMaximumDisplayOrder() {
        Project project = project();
        when(projectRepository.findForUpdateByPublicTokenAndDeletedAtIsNull(PUBLIC_TOKEN)).thenReturn(Optional.of(project));
        when(projectMemberRepository.findMaximumDisplayOrderByProjectId(project.getId()))
                .thenReturn(Optional.of(4));
        when(projectMemberRepository.saveAndFlush(any(ProjectMember.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        var response = projectService.addMember(
                PUBLIC_TOKEN,
                new CreateProjectMemberRequest("  Alice  ")
        );

        ArgumentCaptor<ProjectMember> memberCaptor = ArgumentCaptor.forClass(ProjectMember.class);
        verify(projectMemberRepository).saveAndFlush(memberCaptor.capture());
        ProjectMember savedMember = memberCaptor.getValue();
        assertThat(savedMember.getName()).isEqualTo("Alice");
        assertThat(savedMember.getDisplayOrder()).isEqualTo(5);
        assertThat(savedMember.isActive()).isTrue();
        assertThat(response.name()).isEqualTo("Alice");
        assertThat(response.displayOrder()).isEqualTo(5);
        assertThat(response.active()).isTrue();
    }

    @Test
    void usesDisplayOrderOneWhenProjectHasNoMembers() {
        Project project = project();
        when(projectRepository.findForUpdateByPublicTokenAndDeletedAtIsNull(PUBLIC_TOKEN)).thenReturn(Optional.of(project));
        when(projectMemberRepository.findMaximumDisplayOrderByProjectId(project.getId()))
                .thenReturn(Optional.empty());
        when(projectMemberRepository.saveAndFlush(any(ProjectMember.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        var response = projectService.addMember(
                PUBLIC_TOKEN,
                new CreateProjectMemberRequest("Alice")
        );

        assertThat(response.displayOrder()).isEqualTo(1);
    }

    @Test
    void rejectsMemberAdditionWhenProjectDoesNotExist() {
        when(projectRepository.findForUpdateByPublicTokenAndDeletedAtIsNull(PUBLIC_TOKEN)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> projectService.addMember(
                PUBLIC_TOKEN,
                new CreateProjectMemberRequest("Alice")
        )).isInstanceOf(ProjectNotFoundException.class);

        verifyNoInteractions(projectMemberRepository);
    }

    @Test
    void rejectsMemberAdditionWhenProjectIsArchived() {
        Project project = mock(Project.class);
        when(project.getStatus()).thenReturn(ProjectStatus.ARCHIVED);
        when(projectRepository.findForUpdateByPublicTokenAndDeletedAtIsNull(PUBLIC_TOKEN)).thenReturn(Optional.of(project));

        assertThatThrownBy(() -> projectService.addMember(
                PUBLIC_TOKEN,
                new CreateProjectMemberRequest("Alice")
        )).isInstanceOf(ProjectArchivedException.class);

        verifyNoInteractions(projectMemberRepository);
    }

    @Test
    void convertsOnlyMemberDisplayOrderUniqueConstraintToConflict() {
        Project project = project();
        when(projectRepository.findForUpdateByPublicTokenAndDeletedAtIsNull(PUBLIC_TOKEN)).thenReturn(Optional.of(project));
        when(projectMemberRepository.findMaximumDisplayOrderByProjectId(project.getId()))
                .thenReturn(Optional.of(1));
        when(projectMemberRepository.saveAndFlush(any(ProjectMember.class)))
                .thenThrow(databaseException("uq_project_members_project_display_order"));

        assertThatThrownBy(() -> projectService.addMember(
                PUBLIC_TOKEN,
                new CreateProjectMemberRequest("Alice")
        )).isInstanceOf(MemberDisplayOrderConflictException.class)
                .hasMessageNotContaining(PUBLIC_TOKEN)
                .hasNoCause();
    }

    @Test
    void doesNotConvertOtherMemberDataIntegrityViolationToDisplayOrderConflict() {
        Project project = project();
        DataIntegrityViolationException databaseException =
                databaseException("chk_project_members_name_not_blank");
        when(projectRepository.findForUpdateByPublicTokenAndDeletedAtIsNull(PUBLIC_TOKEN)).thenReturn(Optional.of(project));
        when(projectMemberRepository.findMaximumDisplayOrderByProjectId(project.getId()))
                .thenReturn(Optional.of(1));
        when(projectMemberRepository.saveAndFlush(any(ProjectMember.class)))
                .thenThrow(databaseException);

        assertThatThrownBy(() -> projectService.addMember(
                PUBLIC_TOKEN,
                new CreateProjectMemberRequest("Alice")
        )).isSameAs(databaseException);
    }

    @Test
    void renamesMemberWithoutChangingOrderOrActiveState() {
        Project project = project();
        UUID memberId = UUID.randomUUID();
        ProjectMember member = new ProjectMember(project, "Alice", 3);
        when(projectRepository.findForUpdateByPublicTokenAndDeletedAtIsNull(PUBLIC_TOKEN)).thenReturn(Optional.of(project));
        when(projectMemberRepository.findByIdAndProject_Id(memberId, project.getId()))
                .thenReturn(Optional.of(member));
        when(projectMemberRepository.saveAndFlush(member)).thenReturn(member);

        var response = projectService.renameMember(
                PUBLIC_TOKEN,
                memberId,
                new RenameProjectMemberRequest("  Alice Smith  ")
        );

        assertThat(member.getName()).isEqualTo("Alice Smith");
        assertThat(member.getDisplayOrder()).isEqualTo(3);
        assertThat(member.isActive()).isTrue();
        assertThat(response.name()).isEqualTo("Alice Smith");
        assertThat(response.displayOrder()).isEqualTo(3);
        assertThat(response.active()).isTrue();
    }

    @Test
    void rejectsRenameWhenMemberIsNotInAddressedProject() {
        Project project = project();
        UUID memberId = UUID.randomUUID();
        when(projectRepository.findForUpdateByPublicTokenAndDeletedAtIsNull(PUBLIC_TOKEN)).thenReturn(Optional.of(project));
        when(projectMemberRepository.findByIdAndProject_Id(memberId, project.getId()))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> projectService.renameMember(
                PUBLIC_TOKEN,
                memberId,
                new RenameProjectMemberRequest("Alice Smith")
        )).isInstanceOf(MemberNotFoundException.class);
    }

    @Test
    void rejectsRenameWhenProjectDoesNotExist() {
        when(projectRepository.findForUpdateByPublicTokenAndDeletedAtIsNull(PUBLIC_TOKEN)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> projectService.renameMember(
                PUBLIC_TOKEN,
                UUID.randomUUID(),
                new RenameProjectMemberRequest("Alice Smith")
        )).isInstanceOf(ProjectNotFoundException.class);

        verifyNoInteractions(projectMemberRepository);
    }

    @Test
    void rejectsRenameWhenMemberIsInactive() {
        Project project = project();
        UUID memberId = UUID.randomUUID();
        ProjectMember member = mock(ProjectMember.class);
        when(member.isActive()).thenReturn(false);
        when(projectRepository.findForUpdateByPublicTokenAndDeletedAtIsNull(PUBLIC_TOKEN)).thenReturn(Optional.of(project));
        when(projectMemberRepository.findByIdAndProject_Id(memberId, project.getId()))
                .thenReturn(Optional.of(member));

        assertThatThrownBy(() -> projectService.renameMember(
                PUBLIC_TOKEN,
                memberId,
                new RenameProjectMemberRequest("Alice Smith")
        )).isInstanceOf(MemberInactiveException.class);
    }

    @Test
    void rejectsRenameWhenProjectIsArchivedBeforeMemberLookup() {
        Project project = mock(Project.class);
        when(project.getStatus()).thenReturn(ProjectStatus.ARCHIVED);
        when(projectRepository.findForUpdateByPublicTokenAndDeletedAtIsNull(PUBLIC_TOKEN)).thenReturn(Optional.of(project));

        assertThatThrownBy(() -> projectService.renameMember(
                PUBLIC_TOKEN,
                UUID.randomUUID(),
                new RenameProjectMemberRequest("Alice Smith")
        )).isInstanceOf(ProjectArchivedException.class);

        verifyNoInteractions(projectMemberRepository);
    }

    @Test
    void archivesActiveEventProjectUsingPessimisticLookup() {
        Project project = project();
        when(projectRepository.findForUpdateByPublicTokenAndDeletedAtIsNull(PUBLIC_TOKEN))
                .thenReturn(Optional.of(project));
        when(projectRepository.saveAndFlush(project)).thenReturn(project);
        when(projectMemberRepository.findAllByProject_IdOrderByDisplayOrderAsc(project.getId()))
                .thenReturn(List.of(new ProjectMember(project, "さくら", 1)));

        ProjectResponse response = projectService.archiveProject(PUBLIC_TOKEN);

        verify(projectRepository).findForUpdateByPublicTokenAndDeletedAtIsNull(PUBLIC_TOKEN);
        verify(projectRepository).saveAndFlush(project);
        assertThat(project.getStatus()).isEqualTo(ProjectStatus.ARCHIVED);
        assertThat(project.getArchivedAt()).isNotNull();
        assertThat(response.status()).isEqualTo(ProjectStatus.ARCHIVED);
        assertThat(response.archivedAt()).isEqualTo(project.getArchivedAt());
        assertThat(response.members()).singleElement()
                .extracting(member -> member.name())
                .isEqualTo("さくら");
    }

    @Test
    void rejectsArchiveWhenProjectDoesNotExist() {
        when(projectRepository.findForUpdateByPublicTokenAndDeletedAtIsNull(PUBLIC_TOKEN)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> projectService.archiveProject(PUBLIC_TOKEN))
                .isInstanceOf(ProjectNotFoundException.class);

        verify(projectRepository).findForUpdateByPublicTokenAndDeletedAtIsNull(PUBLIC_TOKEN);
        verifyNoInteractions(projectMemberRepository);
    }

    @Test
    void rejectsArchiveWhenProjectIsContinuous() {
        Project project = new Project(
                PUBLIC_TOKEN,
                "共同生活費",
                null,
                ProjectType.CONTINUOUS,
                100
        );
        when(projectRepository.findForUpdateByPublicTokenAndDeletedAtIsNull(PUBLIC_TOKEN))
                .thenReturn(Optional.of(project));

        assertThatThrownBy(() -> projectService.archiveProject(PUBLIC_TOKEN))
                .isInstanceOf(EventArchiveUnsupportedException.class)
                .hasMessage("Event archive is not supported for this project.");

        assertThat(project.getStatus()).isEqualTo(ProjectStatus.ACTIVE);
        assertThat(project.getArchivedAt()).isNull();
        verifyNoInteractions(projectMemberRepository);
    }

    @Test
    void rejectsArchiveWhenProjectIsAlreadyArchived() {
        Project project = mock(Project.class);
        when(project.getType()).thenReturn(ProjectType.EVENT);
        when(project.getStatus()).thenReturn(ProjectStatus.ARCHIVED);
        when(projectRepository.findForUpdateByPublicTokenAndDeletedAtIsNull(PUBLIC_TOKEN))
                .thenReturn(Optional.of(project));

        assertThatThrownBy(() -> projectService.archiveProject(PUBLIC_TOKEN))
                .isInstanceOf(ProjectArchivedException.class);

        verify(project, org.mockito.Mockito.never()).archive(any());
        verifyNoInteractions(projectMemberRepository);
    }

    @Test
    void softDeletesActiveEventAndContinuousAndArchivedEventWithProjectLock() {
        for (ProjectType type : List.of(ProjectType.EVENT, ProjectType.CONTINUOUS)) {
            Project project = new Project(PUBLIC_TOKEN, "Project", null, type, 1);
            when(projectRepository.findForUpdateByPublicTokenAndDeletedAtIsNull(PUBLIC_TOKEN))
                    .thenReturn(Optional.of(project));
            when(projectRepository.saveAndFlush(project)).thenReturn(project);

            projectService.deleteProject(PUBLIC_TOKEN);

            assertThat(project.getDeletedAt()).isNotNull();
            assertThat(project.getStatus()).isEqualTo(ProjectStatus.ACTIVE);
        }
        Project archived = project();
        archived.archive(java.time.Instant.now());
        when(projectRepository.findForUpdateByPublicTokenAndDeletedAtIsNull(PUBLIC_TOKEN))
                .thenReturn(Optional.of(archived));
        when(projectRepository.saveAndFlush(archived)).thenReturn(archived);

        projectService.deleteProject(PUBLIC_TOKEN);

        assertThat(archived.getDeletedAt()).isNotNull();
        assertThat(archived.getStatus()).isEqualTo(ProjectStatus.ARCHIVED);
        verify(projectRepository, org.mockito.Mockito.times(3))
                .findForUpdateByPublicTokenAndDeletedAtIsNull(PUBLIC_TOKEN);
        verifyNoInteractions(projectMemberRepository);
    }

    @Test
    void repeatedOrMissingProjectDeletionReturnsNotFound() {
        when(projectRepository.findForUpdateByPublicTokenAndDeletedAtIsNull(PUBLIC_TOKEN))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> projectService.deleteProject(PUBLIC_TOKEN))
                .isInstanceOf(ProjectNotFoundException.class);
        verifyNoInteractions(projectMemberRepository);
    }

    private Project project() {
        return new Project(
                PUBLIC_TOKEN,
                "Project",
                null,
                ProjectType.EVENT,
                1
        );
    }

    private CreateProjectRequest validRequest() {
        return new CreateProjectRequest(
                "Project",
                null,
                ProjectType.EVENT,
                1,
                List.of(new CreateProjectMemberRequest("Member"))
        );
    }

    private DataIntegrityViolationException databaseException(String constraintName) {
        SQLException sqlException = new SQLException("Unsafe detail: " + PUBLIC_TOKEN);
        ConstraintViolationException constraintViolation = new ConstraintViolationException(
                "Unsafe detail: " + PUBLIC_TOKEN,
                sqlException,
                constraintName
        );
        return new DataIntegrityViolationException(
                "Unsafe detail: " + PUBLIC_TOKEN,
                constraintViolation
        );
    }
}
