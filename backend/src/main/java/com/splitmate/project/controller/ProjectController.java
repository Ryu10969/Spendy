package com.splitmate.project.controller;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.splitmate.project.domain.ProjectStatus;
import com.splitmate.project.dto.CreateProjectMemberRequest;
import com.splitmate.project.dto.CreateProjectRequest;
import com.splitmate.project.dto.EventCompletionRequest;
import com.splitmate.project.dto.ProjectMemberResponse;
import com.splitmate.project.dto.ProjectPageResponse;
import com.splitmate.project.dto.ProjectResponse;
import com.splitmate.project.dto.RenameProjectMemberRequest;
import com.splitmate.project.service.ProjectService;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;

@RestController
@RequestMapping("/api/projects")
public class ProjectController {

    private final ProjectService projectService;

    public ProjectController(ProjectService projectService) {
        this.projectService = projectService;
    }

    @GetMapping
    public List<ProjectResponse> getProjects() {
        return projectService.getProjects();
    }

    @GetMapping("/page")
    public ProjectPageResponse getProjectPage(
            @RequestParam(required = false) ProjectStatus status,
            @RequestParam(required = false) String query,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "10") @Min(5) @Max(10) int size
    ) {
        return projectService.getProjectPage(status, query, page, size);
    }

    @PostMapping
    public ResponseEntity<ProjectResponse> createProject(
            @Valid @RequestBody CreateProjectRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(projectService.createProject(request));
    }

    @GetMapping("/{publicToken}")
    public ProjectResponse getProject(
            @PathVariable
            @Pattern(
                    regexp = "[A-Za-z0-9_-]{43}",
                    message = "Public token must be a 43-character Base64url value."
            )
            String publicToken
    ) {
        return projectService.getProject(publicToken);
    }

    @DeleteMapping("/{publicToken}")
    public ResponseEntity<Void> deleteProject(
            @PathVariable
            @Pattern(
                    regexp = "[A-Za-z0-9_-]{43}",
                    message = "Public token must be a 43-character Base64url value."
            )
            String publicToken
    ) {
        projectService.deleteProject(publicToken);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{publicToken}/members")
    public ResponseEntity<ProjectMemberResponse> addMember(
            @PathVariable
            @Pattern(
                    regexp = "[A-Za-z0-9_-]{43}",
                    message = "Public token must be a 43-character Base64url value."
            )
            String publicToken,
            @Valid @RequestBody CreateProjectMemberRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(projectService.addMember(publicToken, request));
    }

    @PatchMapping("/{publicToken}/members/{memberId}")
    public ProjectMemberResponse renameMember(
            @PathVariable
            @Pattern(
                    regexp = "[A-Za-z0-9_-]{43}",
                    message = "Public token must be a 43-character Base64url value."
            )
            String publicToken,
            @PathVariable UUID memberId,
            @Valid @RequestBody RenameProjectMemberRequest request
    ) {
        return projectService.renameMember(publicToken, memberId, request);
    }

    @PostMapping("/{publicToken}/archive")
    public ProjectResponse archiveProject(
            @PathVariable
            @Pattern(
                    regexp = "[A-Za-z0-9_-]{43}",
                    message = "Public token must be a 43-character Base64url value."
            )
            String publicToken,
            @Valid @RequestBody EventCompletionRequest request
    ) {
        return projectService.archiveProject(publicToken);
    }
}
