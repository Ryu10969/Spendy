package com.splitmate.project.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;

import com.splitmate.common.error.GlobalExceptionHandler;
import com.splitmate.project.domain.ProjectCurrency;
import com.splitmate.project.domain.ProjectStatus;
import com.splitmate.project.domain.ProjectType;
import com.splitmate.project.dto.CreateProjectRequest;
import com.splitmate.project.dto.CreateProjectMemberRequest;
import com.splitmate.project.dto.ProjectMemberResponse;
import com.splitmate.project.dto.ProjectPageResponse;
import com.splitmate.project.dto.ProjectResponse;
import com.splitmate.project.dto.RenameProjectMemberRequest;
import com.splitmate.project.service.EventArchiveUnsupportedException;
import com.splitmate.project.service.MemberDisplayOrderConflictException;
import com.splitmate.project.service.MemberInactiveException;
import com.splitmate.project.service.MemberNotFoundException;
import com.splitmate.project.service.ProjectArchivedException;
import com.splitmate.project.service.ProjectNotFoundException;
import com.splitmate.project.service.ProjectPublicTokenConflictException;
import com.splitmate.project.service.ProjectService;

@ExtendWith(OutputCaptureExtension.class)
class ProjectControllerTests {

    private static final String PUBLIC_TOKEN = "A".repeat(43);

    private MockMvc mockMvc;

    private ProjectService projectService;

    @BeforeEach
    void setUp() {
        projectService = mock(ProjectService.class);
        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        mockMvc = MockMvcBuilders
                .standaloneSetup(new ProjectController(projectService))
                .setControllerAdvice(new GlobalExceptionHandler())
                .setValidator(validator)
                .build();
    }

    @Test
    void listsProjectsAndReturns200() throws Exception {
        when(projectService.getProjects()).thenReturn(List.of(projectResponse()));

        mockMvc.perform(get("/api/projects"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].publicToken").value(PUBLIC_TOKEN))
                .andExpect(jsonPath("$[0].members[0].name").value("さくら"));
    }

    @Test
    void listsNoProjectsAsEmptyArray() throws Exception {
        when(projectService.getProjects()).thenReturn(List.of());

        mockMvc.perform(get("/api/projects"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void returnsPagedProjectsWithMetadata() throws Exception {
        when(projectService.getProjectPage(ProjectStatus.ACTIVE, null, 1, 10))
                .thenReturn(new ProjectPageResponse(List.of(projectResponse()), 1, 10, 11, 2));

        mockMvc.perform(get("/api/projects/page?status=ACTIVE&page=1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].publicToken").value(PUBLIC_TOKEN))
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.size").value(10))
                .andExpect(jsonPath("$.totalElements").value(11))
                .andExpect(jsonPath("$.totalPages").value(2));
    }

    @Test
    void acceptsFiveItemPageSize() throws Exception {
        when(projectService.getProjectPage(ProjectStatus.ACTIVE, null, 1, 5))
                .thenReturn(new ProjectPageResponse(List.of(projectResponse()), 1, 5, 6, 2));

        mockMvc.perform(get("/api/projects/page?status=ACTIVE&page=1&size=5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(5))
                .andExpect(jsonPath("$.totalPages").value(2));
    }

    @Test
    void passesSearchThroughWithoutStatusFilter() throws Exception {
        when(projectService.getProjectPage(null, "沖縄", 0, 10))
                .thenReturn(new ProjectPageResponse(List.of(projectResponse()), 0, 10, 1, 1));

        mockMvc.perform(get("/api/projects/page?query=沖縄"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].name").value("沖縄旅行"));
    }

    @Test
    void rejectsNegativePage() throws Exception {
        mockMvc.perform(get("/api/projects/page?page=-1&status=ACTIVE"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

        verifyNoInteractions(projectService);
    }

    @Test
    void rejectsSizeOutsideFiveToTen() throws Exception {
        for (int size : List.of(0, 4, 11, 100)) {
            mockMvc.perform(get("/api/projects/page?status=ACTIVE&size=" + size))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        }

        verifyNoInteractions(projectService);
    }

    @Test
    void createsProjectAndReturns201() throws Exception {
        when(projectService.createProject(any(CreateProjectRequest.class)))
                .thenReturn(projectResponse());

        mockMvc.perform(post("/api/projects")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": "沖縄旅行",
                                  "description": "3泊4日の旅行",
                                  "type": "EVENT",
                                  "roundingUnit": 10,
                                  "members": [
                                    { "name": "さくら" },
                                    { "name": "太郎" }
                                  ]
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.publicToken").value(PUBLIC_TOKEN))
                .andExpect(jsonPath("$.currency").value("JPY"))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.members[0].displayOrder").value(1))
                .andExpect(jsonPath("$.members[1].displayOrder").value(2));
    }

    @Test
    void getsProjectAndReturns200WithMembersInDisplayOrder() throws Exception {
        when(projectService.getProject(PUBLIC_TOKEN)).thenReturn(projectResponse());

        mockMvc.perform(get("/api/projects/{publicToken}", PUBLIC_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("沖縄旅行"))
                .andExpect(jsonPath("$.members[0].name").value("さくら"))
                .andExpect(jsonPath("$.members[0].displayOrder").value(1))
                .andExpect(jsonPath("$.members[1].name").value("太郎"))
                .andExpect(jsonPath("$.members[1].displayOrder").value(2));
    }

    @Test
    void deletesProjectWithNoBodyAndReturns204() throws Exception {
        mockMvc.perform(delete("/api/projects/{publicToken}", PUBLIC_TOKEN))
                .andExpect(status().isNoContent());
        org.mockito.Mockito.verify(projectService).deleteProject(PUBLIC_TOKEN);
    }

    @Test
    void missingProjectDeletionUsesExistingNotFoundError() throws Exception {
        org.mockito.Mockito.doThrow(new ProjectNotFoundException())
                .when(projectService).deleteProject(PUBLIC_TOKEN);

        mockMvc.perform(delete("/api/projects/{publicToken}", PUBLIC_TOKEN))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PROJECT_NOT_FOUND"));
    }

    @Test
    void rejectsInvalidDeletionToken() throws Exception {
        mockMvc.perform(delete("/api/projects/{publicToken}", "invalid"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        verifyNoInteractions(projectService);
    }

    @Test
    void addsMemberAndReturns201() throws Exception {
        when(projectService.addMember(
                anyString(),
                any(CreateProjectMemberRequest.class)
        )).thenReturn(memberResponse());

        mockMvc.perform(post("/api/projects/{publicToken}/members", PUBLIC_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(memberNameJson("Alice")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(memberResponse().id().toString()))
                .andExpect(jsonPath("$.name").value("Alice"))
                .andExpect(jsonPath("$.displayOrder").value(3))
                .andExpect(jsonPath("$.active").value(true));
    }

    @Test
    void allowsOneHundredCharacterMemberNameOnAddition() throws Exception {
        when(projectService.addMember(
                anyString(),
                any(CreateProjectMemberRequest.class)
        )).thenReturn(memberResponse());

        mockMvc.perform(post("/api/projects/{publicToken}/members", PUBLIC_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(memberNameJson("A".repeat(100))))
                .andExpect(status().isCreated());
    }

    @Test
    void rejectsBlankMemberNameOnAddition() throws Exception {
        assertInvalidMemberAddition("");
    }

    @Test
    void rejectsWhitespaceOnlyMemberNameOnAddition() throws Exception {
        assertInvalidMemberAddition("   ");
    }

    @Test
    void rejectsMemberNameOverOneHundredCharactersOnAddition() throws Exception {
        assertInvalidMemberAddition("A".repeat(101));
    }

    @Test
    void returnsProjectNotFoundForMemberAddition() throws Exception {
        when(projectService.addMember(
                anyString(),
                any(CreateProjectMemberRequest.class)
        )).thenThrow(new ProjectNotFoundException());

        assertMemberAdditionError("PROJECT_NOT_FOUND", 404);
    }

    @Test
    void returnsProjectArchivedForMemberAddition() throws Exception {
        when(projectService.addMember(
                anyString(),
                any(CreateProjectMemberRequest.class)
        )).thenThrow(new ProjectArchivedException());

        assertMemberAdditionError("PROJECT_ARCHIVED", 409);
    }

    @Test
    void returnsDisplayOrderConflictWithoutExposingOrLoggingPublicToken(
            CapturedOutput output
    ) throws Exception {
        when(projectService.addMember(
                anyString(),
                any(CreateProjectMemberRequest.class)
        )).thenThrow(new MemberDisplayOrderConflictException());

        String responseBody = mockMvc.perform(
                        post("/api/projects/{publicToken}/members", PUBLIC_TOKEN)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(memberNameJson("Alice"))
                )
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("MEMBER_DISPLAY_ORDER_CONFLICT"))
                .andExpect(jsonPath("$.fieldErrors").isEmpty())
                .andReturn()
                .getResponse()
                .getContentAsString();

        assertThat(responseBody).doesNotContain(PUBLIC_TOKEN);
        assertThat(output).doesNotContain(PUBLIC_TOKEN);
    }

    @Test
    void renamesMemberAndReturns200() throws Exception {
        ProjectMemberResponse renamed = new ProjectMemberResponse(
                memberResponse().id(),
                "Alice Smith",
                3,
                true
        );
        when(projectService.renameMember(
                anyString(),
                any(UUID.class),
                any(RenameProjectMemberRequest.class)
        )).thenReturn(renamed);

        mockMvc.perform(patch(
                        "/api/projects/{publicToken}/members/{memberId}",
                        PUBLIC_TOKEN,
                        renamed.id()
                )
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(memberNameJson("Alice Smith")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(renamed.id().toString()))
                .andExpect(jsonPath("$.name").value("Alice Smith"))
                .andExpect(jsonPath("$.displayOrder").value(3))
                .andExpect(jsonPath("$.active").value(true));
    }

    @Test
    void allowsOneHundredCharacterMemberNameOnRename() throws Exception {
        when(projectService.renameMember(
                anyString(),
                any(UUID.class),
                any(RenameProjectMemberRequest.class)
        )).thenReturn(memberResponse());

        mockMvc.perform(patch(
                        "/api/projects/{publicToken}/members/{memberId}",
                        PUBLIC_TOKEN,
                        memberResponse().id()
                )
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(memberNameJson("A".repeat(100))))
                .andExpect(status().isOk());
    }

    @Test
    void rejectsBlankMemberNameOnRename() throws Exception {
        assertInvalidMemberRename("");
    }

    @Test
    void rejectsWhitespaceOnlyMemberNameOnRename() throws Exception {
        assertInvalidMemberRename("   ");
    }

    @Test
    void rejectsMemberNameOverOneHundredCharactersOnRename() throws Exception {
        assertInvalidMemberRename("A".repeat(101));
    }

    @Test
    void returnsProjectNotFoundForMemberRename() throws Exception {
        assertMemberRenameError(new ProjectNotFoundException(), "PROJECT_NOT_FOUND", 404);
    }

    @Test
    void returnsMemberNotFoundForMemberRename() throws Exception {
        assertMemberRenameError(new MemberNotFoundException(), "MEMBER_NOT_FOUND", 404);
    }

    @Test
    void returnsProjectArchivedForMemberRename() throws Exception {
        assertMemberRenameError(new ProjectArchivedException(), "PROJECT_ARCHIVED", 409);
    }

    @Test
    void returnsMemberInactiveForMemberRename() throws Exception {
        assertMemberRenameError(new MemberInactiveException(), "MEMBER_INACTIVE", 409);
    }

    @Test
    void rejectsMalformedMemberId() throws Exception {
        mockMvc.perform(patch(
                        "/api/projects/{publicToken}/members/{memberId}",
                        PUBLIC_TOKEN,
                        "not-a-uuid"
                )
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(memberNameJson("Alice Smith")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("memberId"));

        verifyNoInteractions(projectService);
    }

    @Test
    void archivesProjectAndReturns200() throws Exception {
        Instant archivedAt = Instant.parse("2026-09-04T03:00:00Z");
        when(projectService.archiveProject(PUBLIC_TOKEN)).thenReturn(archivedProjectResponse(archivedAt));

        mockMvc.perform(post("/api/projects/{publicToken}/archive", PUBLIC_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(archiveRequestJson(true)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.publicToken").value(PUBLIC_TOKEN))
                .andExpect(jsonPath("$.status").value("ARCHIVED"))
                .andExpect(jsonPath("$.archivedAt").value(archivedAt.toString()))
                .andExpect(jsonPath("$.version").doesNotExist());
    }

    @Test
    void rejectsArchiveWhenConfirmationIsMissing() throws Exception {
        mockMvc.perform(post("/api/projects/{publicToken}/archive", PUBLIC_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("confirmed"));

        verifyNoInteractions(projectService);
    }

    @Test
    void rejectsArchiveWhenConfirmationIsFalse() throws Exception {
        mockMvc.perform(post("/api/projects/{publicToken}/archive", PUBLIC_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(archiveRequestJson(false)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("confirmed"));

        verifyNoInteractions(projectService);
    }

    @Test
    void returnsMalformedRequestForUnreadableArchiveBody() throws Exception {
        mockMvc.perform(post("/api/projects/{publicToken}/archive", PUBLIC_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));

        verifyNoInteractions(projectService);
    }

    @Test
    void returnsProjectNotFoundForArchive() throws Exception {
        when(projectService.archiveProject(PUBLIC_TOKEN)).thenThrow(new ProjectNotFoundException());

        mockMvc.perform(post("/api/projects/{publicToken}/archive", PUBLIC_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(archiveRequestJson(true)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PROJECT_NOT_FOUND"))
                .andExpect(jsonPath("$.fieldErrors").isEmpty());
    }

    @Test
    void returnsEventArchiveUnsupportedForArchive() throws Exception {
        when(projectService.archiveProject(PUBLIC_TOKEN))
                .thenThrow(new EventArchiveUnsupportedException());

        mockMvc.perform(post("/api/projects/{publicToken}/archive", PUBLIC_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(archiveRequestJson(true)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EVENT_ARCHIVE_UNSUPPORTED"))
                .andExpect(jsonPath("$.fieldErrors").isEmpty());
    }

    @Test
    void returnsProjectArchivedForRepeatArchive() throws Exception {
        when(projectService.archiveProject(PUBLIC_TOKEN)).thenThrow(new ProjectArchivedException());

        mockMvc.perform(post("/api/projects/{publicToken}/archive", PUBLIC_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(archiveRequestJson(true)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PROJECT_ARCHIVED"))
                .andExpect(jsonPath("$.fieldErrors").isEmpty());
    }

    @Test
    void rejectsInvalidPublicTokenForArchiveWithoutCallingService() throws Exception {
        mockMvc.perform(post("/api/projects/{publicToken}/archive", "invalid-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(archiveRequestJson(true)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("publicToken"));

        verifyNoInteractions(projectService);
    }

    @Test
    void returns400WithSharedErrorShapeForInvalidRequest() throws Exception {
        mockMvc.perform(post("/api/projects")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": " ",
                                  "description": null,
                                  "type": null,
                                  "roundingUnit": 2,
                                  "members": []
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.message").value("Request validation failed."))
                .andExpect(jsonPath("$.fieldErrors").isArray())
                .andExpect(jsonPath("$.fieldErrors.length()").value(4))
                .andExpect(jsonPath("$.timestamp").exists());

        verifyNoInteractions(projectService);
    }

    @Test
    void returns404WithProjectNotFoundErrorShape() throws Exception {
        when(projectService.getProject(PUBLIC_TOKEN)).thenThrow(new ProjectNotFoundException());

        mockMvc.perform(get("/api/projects/{publicToken}", PUBLIC_TOKEN))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PROJECT_NOT_FOUND"))
                .andExpect(jsonPath("$.message").value("Project was not found."))
                .andExpect(jsonPath("$.fieldErrors").isArray())
                .andExpect(jsonPath("$.fieldErrors.length()").value(0))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    void rejectsInvalidPublicTokenWithoutCallingService() throws Exception {
        mockMvc.perform(get("/api/projects/{publicToken}", "invalid-token"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("publicToken"))
                .andExpect(jsonPath("$.timestamp").exists());

        verifyNoInteractions(projectService);
    }

    @Test
    void returns409WithoutExposingOrLoggingPublicToken(CapturedOutput output) throws Exception {
        when(projectService.createProject(any(CreateProjectRequest.class)))
                .thenThrow(new ProjectPublicTokenConflictException());

        String responseBody = mockMvc.perform(post("/api/projects")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequestJson()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PROJECT_PUBLIC_TOKEN_CONFLICT"))
                .andExpect(jsonPath("$.message").value("A project public token conflict occurred."))
                .andExpect(jsonPath("$.fieldErrors").isArray())
                .andExpect(jsonPath("$.timestamp").exists())
                .andReturn()
                .getResponse()
                .getContentAsString();

        assertThat(responseBody).doesNotContain(PUBLIC_TOKEN);
        assertThat(output).doesNotContain(PUBLIC_TOKEN);
    }

    @Test
    void rejectsProjectNameOver100Characters() throws Exception {
        assertInvalidRequest(requestJson("P".repeat(101), "Description", "Member"), "name");
    }

    @Test
    void rejectsDescriptionOver1000Characters() throws Exception {
        assertInvalidRequest(
                requestJson("Project", "D".repeat(1001), "Member"),
                "description"
        );
    }

    @Test
    void rejectsBlankMemberName() throws Exception {
        assertInvalidRequest(requestJson("Project", "Description", "   "), "members[0].name");
    }

    @Test
    void rejectsMemberNameOver100Characters() throws Exception {
        assertInvalidRequest(
                requestJson("Project", "Description", "M".repeat(101)),
                "members[0].name"
        );
    }

    private void assertInvalidRequest(String requestBody, String field) throws Exception {
        mockMvc.perform(post("/api/projects")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath(
                        "$.fieldErrors[?(@.field == '" + field + "')]"
                ).exists());

        verifyNoInteractions(projectService);
    }

    private void assertInvalidMemberAddition(String name) throws Exception {
        mockMvc.perform(post("/api/projects/{publicToken}/members", PUBLIC_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(memberNameJson(name)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("name"));

        verifyNoInteractions(projectService);
    }

    private void assertInvalidMemberRename(String name) throws Exception {
        mockMvc.perform(patch(
                        "/api/projects/{publicToken}/members/{memberId}",
                        PUBLIC_TOKEN,
                        memberResponse().id()
                )
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(memberNameJson(name)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("name"));

        verifyNoInteractions(projectService);
    }

    private void assertMemberAdditionError(String code, int statusCode) throws Exception {
        mockMvc.perform(post("/api/projects/{publicToken}/members", PUBLIC_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(memberNameJson("Alice")))
                .andExpect(status().is(statusCode))
                .andExpect(jsonPath("$.code").value(code))
                .andExpect(jsonPath("$.fieldErrors").isEmpty());
    }

    private void assertMemberRenameError(
            RuntimeException exception,
            String code,
            int statusCode
    ) throws Exception {
        when(projectService.renameMember(
                anyString(),
                any(UUID.class),
                any(RenameProjectMemberRequest.class)
        )).thenThrow(exception);

        mockMvc.perform(patch(
                        "/api/projects/{publicToken}/members/{memberId}",
                        PUBLIC_TOKEN,
                        memberResponse().id()
                )
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(memberNameJson("Alice Smith")))
                .andExpect(status().is(statusCode))
                .andExpect(jsonPath("$.code").value(code))
                .andExpect(jsonPath("$.fieldErrors").isEmpty());
    }

    private String archiveRequestJson(boolean confirmed) {
        return """
                {
                  "confirmed": %s
                }
                """.formatted(confirmed);
    }

    private String memberNameJson(String name) {
        return """
                {
                  "name": "%s"
                }
                """.formatted(name);
    }

    private String validRequestJson() {
        return requestJson("沖縄旅行", "3泊4日の旅行", "さくら");
    }

    private String requestJson(String name, String description, String memberName) {
        return """
                {
                  "name": "%s",
                  "description": "%s",
                  "type": "EVENT",
                  "roundingUnit": 10,
                  "members": [{ "name": "%s" }]
                }
                """.formatted(name, description, memberName);
    }

    private ProjectResponse projectResponse() {
        Instant timestamp = Instant.parse("2026-07-26T12:00:00Z");
        return new ProjectResponse(
                PUBLIC_TOKEN,
                "沖縄旅行",
                "3泊4日の旅行",
                ProjectType.EVENT,
                ProjectCurrency.JPY,
                10,
                ProjectStatus.ACTIVE,
                List.of(
                        new ProjectMemberResponse(UUID.randomUUID(), "さくら", 1, true),
                        new ProjectMemberResponse(UUID.randomUUID(), "太郎", 2, true)
                ),
                timestamp,
                timestamp,
                null
        );
    }

    private ProjectResponse archivedProjectResponse(Instant archivedAt) {
        return new ProjectResponse(
                PUBLIC_TOKEN,
                "沖縄旅行",
                "3泊4日の旅行",
                ProjectType.EVENT,
                ProjectCurrency.JPY,
                10,
                ProjectStatus.ARCHIVED,
                List.of(
                        new ProjectMemberResponse(UUID.randomUUID(), "さくら", 1, true),
                        new ProjectMemberResponse(UUID.randomUUID(), "太郎", 2, true)
                ),
                archivedAt,
                archivedAt,
                archivedAt
        );
    }

    private ProjectMemberResponse memberResponse() {
        return new ProjectMemberResponse(
                UUID.fromString("4ae57cf6-0617-4f43-a865-d02a90f4805d"),
                "Alice",
                3,
                true
        );
    }
}
