package com.splitmate.project.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.splitmate.project.domain.Project;
import com.splitmate.project.domain.ProjectMember;
import com.splitmate.project.domain.ProjectStatus;
import com.splitmate.project.domain.ProjectType;
import com.splitmate.project.dto.CreateProjectMemberRequest;
import com.splitmate.project.dto.CreateProjectRequest;
import com.splitmate.project.dto.ProjectMemberResponse;
import com.splitmate.project.dto.ProjectPageResponse;
import com.splitmate.project.dto.ProjectResponse;
import com.splitmate.project.dto.RenameProjectMemberRequest;
import com.splitmate.project.repository.ProjectMemberRepository;
import com.splitmate.project.repository.ProjectRepository;

@Service
public class ProjectService {

    private static final String PUBLIC_TOKEN_UNIQUE_CONSTRAINT = "uq_projects_public_token";
    private static final String MEMBER_DISPLAY_ORDER_UNIQUE_CONSTRAINT =
            "uq_project_members_project_display_order";
    private static final Sort PROJECT_ORDER = Sort.by(
            Sort.Order.desc("updatedAt"), Sort.Order.desc("createdAt"), Sort.Order.asc("id"));

    private final ProjectRepository projectRepository;
    private final ProjectMemberRepository projectMemberRepository;
    private final PublicTokenGenerator publicTokenGenerator;

    public ProjectService(
            ProjectRepository projectRepository,
            ProjectMemberRepository projectMemberRepository,
            PublicTokenGenerator publicTokenGenerator
    ) {
        this.projectRepository = projectRepository;
        this.projectMemberRepository = projectMemberRepository;
        this.publicTokenGenerator = publicTokenGenerator;
    }

    @Transactional(readOnly = true)
    public List<ProjectResponse> getProjects() {
        return projectRepository.findAllByDeletedAtIsNullOrderByUpdatedAtDescCreatedAtDescIdAsc().stream()
                .map(project -> toResponse(project, projectMemberRepository
                        .findAllByProject_IdOrderByDisplayOrderAsc(project.getId())))
                .toList();
    }

    @Transactional(readOnly = true)
    public ProjectPageResponse getProjectPage(ProjectStatus status, String query, int page, int size) {
        String search = query == null ? "" : query.trim();
        int effectiveSize = status == ProjectStatus.ARCHIVED ? 5 : size;
        PageRequest pageable = PageRequest.of(page, effectiveSize, PROJECT_ORDER);
        Page<Project> projects;
        if (search.isEmpty()) {
            projects = status == null
                    ? projectRepository.findByDeletedAtIsNull(pageable)
                    : projectRepository.findByStatusAndDeletedAtIsNull(status, pageable);
        } else {
            projects = status == null
                    ? projectRepository.findByDeletedAtIsNullAndNameContainingIgnoreCase(search, pageable)
                    : projectRepository.findByStatusAndDeletedAtIsNullAndNameContainingIgnoreCase(status, search, pageable);
        }
        List<ProjectResponse> items = projects.getContent().stream()
                .map(project -> toResponse(project, projectMemberRepository
                        .findAllByProject_IdOrderByDisplayOrderAsc(project.getId())))
                .toList();
        return new ProjectPageResponse(items, page, effectiveSize,
                projects.getTotalElements(), projects.getTotalPages());
    }

    @Transactional
    public ProjectResponse createProject(CreateProjectRequest request) {
        Project project;
        try {
            project = projectRepository.saveAndFlush(new Project(
                    publicTokenGenerator.generate(),
                    request.name(),
                    request.description(),
                    request.type(),
                    request.roundingUnit()
            ));
        } catch (DataIntegrityViolationException exception) {
            if (hasConstraint(exception, PUBLIC_TOKEN_UNIQUE_CONSTRAINT)) {
                throw new ProjectPublicTokenConflictException();
            }
            throw exception;
        }

        List<ProjectMember> members = new ArrayList<>(request.members().size());
        for (int index = 0; index < request.members().size(); index++) {
            CreateProjectMemberRequest memberRequest = request.members().get(index);
            members.add(new ProjectMember(project, memberRequest.name().trim(), index + 1));
        }

        List<ProjectMember> savedMembers = projectMemberRepository.saveAll(members);
        return toResponse(project, savedMembers);
    }

    @Transactional
    public ProjectMemberResponse addMember(
            String publicToken,
            CreateProjectMemberRequest request
    ) {
        Project project = projectRepository.findForUpdateByPublicTokenAndDeletedAtIsNull(publicToken)
                .orElseThrow(ProjectNotFoundException::new);
        assertProjectMutable(project);
        int displayOrder = projectMemberRepository
                .findMaximumDisplayOrderByProjectId(project.getId())
                .orElse(0) + 1;

        try {
            ProjectMember member = projectMemberRepository.saveAndFlush(
                    new ProjectMember(project, request.name().trim(), displayOrder)
            );
            return toMemberResponse(member);
        } catch (DataIntegrityViolationException exception) {
            if (hasConstraint(exception, MEMBER_DISPLAY_ORDER_UNIQUE_CONSTRAINT)) {
                throw new MemberDisplayOrderConflictException();
            }
            throw exception;
        }
    }

    @Transactional
    public ProjectMemberResponse renameMember(
            String publicToken,
            UUID memberId,
            RenameProjectMemberRequest request
    ) {
        Project project = projectRepository.findForUpdateByPublicTokenAndDeletedAtIsNull(publicToken)
                .orElseThrow(ProjectNotFoundException::new);
        assertProjectMutable(project);
        ProjectMember member = projectMemberRepository
                .findByIdAndProject_Id(memberId, project.getId())
                .orElseThrow(MemberNotFoundException::new);
        if (!member.isActive()) {
            throw new MemberInactiveException();
        }

        member.rename(request.name().trim());
        return toMemberResponse(projectMemberRepository.saveAndFlush(member));
    }

    @Transactional
    public ProjectResponse archiveProject(String publicToken) {
        Project project = projectRepository.findForUpdateByPublicTokenAndDeletedAtIsNull(publicToken)
                .orElseThrow(ProjectNotFoundException::new);
        if (project.getType() != ProjectType.EVENT) {
            throw new EventArchiveUnsupportedException();
        }
        if (project.getStatus() == ProjectStatus.ARCHIVED) {
            throw new ProjectArchivedException();
        }

        project.archive(Instant.now());
        Project archived = projectRepository.saveAndFlush(project);
        List<ProjectMember> members =
                projectMemberRepository.findAllByProject_IdOrderByDisplayOrderAsc(archived.getId());
        return toResponse(archived, members);
    }

    @Transactional
    public void deleteProject(String publicToken) {
        Project project = projectRepository.findForUpdateByPublicTokenAndDeletedAtIsNull(publicToken)
                .orElseThrow(ProjectNotFoundException::new);
        project.delete(Instant.now());
        projectRepository.saveAndFlush(project);
    }

    private boolean hasConstraint(DataIntegrityViolationException exception, String constraintName) {
        Throwable cause = exception;
        while (cause != null) {
            if (cause instanceof ConstraintViolationException constraintViolation) {
                return constraintName.equals(constraintViolation.getConstraintName());
            }
            cause = cause.getCause();
        }
        return false;
    }

    @Transactional(readOnly = true)
    public ProjectResponse getProject(String publicToken) {
        Project project = findProject(publicToken);
        List<ProjectMember> members =
                projectMemberRepository.findAllByProject_IdOrderByDisplayOrderAsc(project.getId());
        return toResponse(project, members);
    }

    private Project findProject(String publicToken) {
        return projectRepository.findByPublicTokenAndDeletedAtIsNull(publicToken)
                .orElseThrow(ProjectNotFoundException::new);
    }

    private void assertProjectMutable(Project project) {
        if (project.getStatus() == ProjectStatus.ARCHIVED) {
            throw new ProjectArchivedException();
        }
    }

    private ProjectMemberResponse toMemberResponse(ProjectMember member) {
        return new ProjectMemberResponse(
                member.getId(),
                member.getName(),
                member.getDisplayOrder(),
                member.isActive()
        );
    }

    private ProjectResponse toResponse(Project project, List<ProjectMember> members) {
        List<ProjectMemberResponse> memberResponses = members.stream()
                .sorted(Comparator.comparingInt(ProjectMember::getDisplayOrder))
                .map(this::toMemberResponse)
                .toList();

        return new ProjectResponse(
                project.getPublicToken(),
                project.getName(),
                project.getDescription(),
                project.getType(),
                project.getCurrency(),
                project.getRoundingUnit(),
                project.getStatus(),
                memberResponses,
                project.getCreatedAt(),
                project.getUpdatedAt(),
                project.getArchivedAt()
        );
    }
}
