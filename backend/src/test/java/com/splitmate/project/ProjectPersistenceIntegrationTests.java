package com.splitmate.project;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.ArrayList;
import java.util.UUID;
import java.time.Instant;
import java.sql.Timestamp;
import java.math.BigDecimal;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import com.splitmate.project.domain.Project;
import com.splitmate.project.domain.ProjectMember;
import com.splitmate.project.domain.ProjectStatus;
import com.splitmate.project.domain.ProjectType;
import com.splitmate.project.dto.CreateProjectMemberRequest;
import com.splitmate.project.dto.CreateProjectRequest;
import com.splitmate.project.dto.ProjectResponse;
import com.splitmate.project.dto.RenameProjectMemberRequest;
import com.splitmate.project.repository.ProjectMemberRepository;
import com.splitmate.project.repository.ProjectRepository;
import com.splitmate.project.service.EventArchiveUnsupportedException;
import com.splitmate.project.service.MemberInactiveException;
import com.splitmate.project.service.MemberNotFoundException;
import com.splitmate.project.service.ProjectArchivedException;
import com.splitmate.project.service.ProjectNotFoundException;
import com.splitmate.project.service.ProjectPublicTokenConflictException;
import com.splitmate.project.service.ProjectService;
import com.splitmate.project.service.PublicTokenGenerator;
import com.splitmate.expense.domain.ExpenseCategory;
import com.splitmate.expense.dto.CreateExpenseRequest;
import com.splitmate.expense.service.ExpenseService;
import com.splitmate.settlement.domain.SettlementStrategy;
import com.splitmate.settlement.service.SettlementService;
import jakarta.persistence.EntityManager;

@SpringBootTest
@ActiveProfiles("local")
@ExtendWith(OutputCaptureExtension.class)
@EnabledIfEnvironmentVariable(
        named = "SPLITMATE_POSTGRES_INTEGRATION_TEST",
        matches = "true",
        disabledReason = "Requires the Docker PostgreSQL integration-test environment."
)
class ProjectPersistenceIntegrationTests {

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private ProjectMemberRepository projectMemberRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ProjectService projectService;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private ExpenseService expenseService;

    @Autowired
    private SettlementService settlementService;

    @Test
    @Transactional
    void flywayAddsNullableProjectDeletionTimestampWithoutChangingForeignKeys() {
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM flyway_schema_history WHERE version = '4' AND success",
                Long.class)).isEqualTo(1L);
        assertThat(jdbcTemplate.queryForObject(
                """
                SELECT data_type = 'timestamp with time zone' AND is_nullable = 'YES'
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'projects'
                  AND column_name = 'deleted_at'
                """, Boolean.class)).isTrue();
        assertThat(jdbcTemplate.queryForObject(
                """
                SELECT count(*) FROM pg_constraint
                WHERE contype = 'f' AND confrelid = 'projects'::regclass
                  AND confdeltype = 'a'
                """, Long.class)).isPositive();
    }

    @Test
    @Transactional
    void softDeletionHidesProjectFromEveryEntryPointAndRetainsOwnedRows() {
        String name = "Delete history " + UUID.randomUUID();
        ProjectResponse created = projectService.createProject(new CreateProjectRequest(
                name, null, ProjectType.EVENT, 1,
                List.of(new CreateProjectMemberRequest("Payer"),
                        new CreateProjectMemberRequest("Participant"))));
        UUID projectId = projectRepository.findByPublicTokenAndDeletedAtIsNull(created.publicToken())
                .orElseThrow().getId();
        var expense = expenseService.createExpense(created.publicToken(), new CreateExpenseRequest(
                created.members().get(0).id(), List.of(created.members().get(1).id()),
                BigDecimal.valueOf(100), "Shared", ExpenseCategory.OTHER, null,
                LocalDate.of(2026, 10, 1)));
        var settlement = settlementService.getSettlement(created.publicToken(),
                SettlementStrategy.FEWER_TRANSFERS);
        assertThat(settlement.balances()).hasSize(2);
        assertThat(settlement.transfers()).hasSize(1);

        projectService.deleteProject(created.publicToken());

        assertThat(jdbcTemplate.queryForObject(
                "SELECT deleted_at IS NOT NULL FROM projects WHERE id = ?", Boolean.class, projectId))
                .isTrue();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM project_members WHERE project_id = ?", Long.class, projectId))
                .isEqualTo(2L);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM expenses WHERE project_id = ?", Long.class, projectId))
                .isEqualTo(1L);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM expense_participants WHERE expense_id = ?", Long.class, expense.id()))
                .isEqualTo(1L);
        for (String table : List.of("settlement_runs", "settlement_balances", "settlement_transfers")) {
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT count(*) FROM " + table + " WHERE project_id = ?", Long.class, projectId))
                    .isPositive();
        }
        assertThatThrownBy(() -> projectService.getProject(created.publicToken()))
                .isInstanceOf(ProjectNotFoundException.class);
        assertThatThrownBy(() -> projectService.deleteProject(created.publicToken()))
                .isInstanceOf(ProjectNotFoundException.class);
        assertThatThrownBy(() -> projectService.addMember(created.publicToken(),
                new CreateProjectMemberRequest("New")))
                .isInstanceOf(ProjectNotFoundException.class);
        assertThatThrownBy(() -> projectService.renameMember(created.publicToken(),
                created.members().get(0).id(), new RenameProjectMemberRequest("New")))
                .isInstanceOf(ProjectNotFoundException.class);
        assertThatThrownBy(() -> projectService.archiveProject(created.publicToken()))
                .isInstanceOf(ProjectNotFoundException.class);
        assertThatThrownBy(() -> expenseService.getExpenses(created.publicToken()))
                .isInstanceOf(ProjectNotFoundException.class);
        assertThatThrownBy(() -> expenseService.createExpense(created.publicToken(),
                new CreateExpenseRequest(created.members().get(0).id(),
                        List.of(created.members().get(1).id()), BigDecimal.ONE,
                        "New", ExpenseCategory.OTHER, null, LocalDate.of(2026, 10, 1))))
                .isInstanceOf(ProjectNotFoundException.class);
        assertThatThrownBy(() -> expenseService.deleteExpense(created.publicToken(), expense.id()))
                .isInstanceOf(ProjectNotFoundException.class);
        assertThatThrownBy(() -> settlementService.getSettlement(created.publicToken(),
                SettlementStrategy.FEWER_TRANSFERS))
                .isInstanceOf(ProjectNotFoundException.class);
        assertThat(projectService.getProjects()).extracting(ProjectResponse::publicToken)
                .doesNotContain(created.publicToken());
        assertThat(projectService.getProjectPage(null, name, 0, 5).totalElements()).isZero();
        assertThat(projectService.getProjectPage(ProjectStatus.ACTIVE, name, 0, 5).totalPages()).isZero();
    }

    @Test
    @Transactional
    void softDeletesContinuousAndArchivedEventsWithoutChangingArchiveRules() {
        String name = "Lifecycle delete " + UUID.randomUUID();
        ProjectResponse continuous = projectService.createProject(new CreateProjectRequest(
                name, null, ProjectType.CONTINUOUS, 1,
                List.of(new CreateProjectMemberRequest("Member"))));
        ProjectResponse archived = projectService.createProject(new CreateProjectRequest(
                name, null, ProjectType.EVENT, 1,
                List.of(new CreateProjectMemberRequest("Member"))));
        projectService.archiveProject(archived.publicToken());
        assertThatThrownBy(() -> projectService.addMember(archived.publicToken(),
                new CreateProjectMemberRequest("Blocked")))
                .isInstanceOf(ProjectArchivedException.class);

        projectService.deleteProject(continuous.publicToken());
        projectService.deleteProject(archived.publicToken());

        assertThat(projectService.getProjectPage(ProjectStatus.ACTIVE, name, 0, 5).totalElements())
                .isZero();
        assertThat(projectService.getProjectPage(ProjectStatus.ARCHIVED, name, 0, 5).totalElements())
                .isZero();
        assertThat(projectService.getProjectPage(null, name, 0, 5).items()).isEmpty();
    }

    @Test
    @Transactional
    void softDeletionUpdatesPageCountsAndArchivedPreview() {
        String name = "Page delete " + UUID.randomUUID();
        List<String> active = new ArrayList<>();
        List<String> archived = new ArrayList<>();
        for (int index = 0; index < 6; index++) {
            active.add(projectService.createProject(new CreateProjectRequest(
                    name, null, ProjectType.EVENT, 1,
                    List.of(new CreateProjectMemberRequest("Member")))).publicToken());
            String token = projectService.createProject(new CreateProjectRequest(
                    name, null, ProjectType.EVENT, 1,
                    List.of(new CreateProjectMemberRequest("Member")))).publicToken();
            projectService.archiveProject(token);
            archived.add(token);
        }
        var preview = projectService.getProjectPage(ProjectStatus.ARCHIVED, name, 0, 5);
        assertThat(preview.totalElements()).isEqualTo(6);
        assertThat(preview.items()).hasSize(5);
        String deletedPreviewToken = preview.items().get(0).publicToken();
        String olderToken = archived.stream().filter(token -> preview.items().stream()
                .noneMatch(item -> item.publicToken().equals(token))).findFirst().orElseThrow();

        projectService.deleteProject(active.get(0));
        projectService.deleteProject(deletedPreviewToken);

        var activePage = projectService.getProjectPage(ProjectStatus.ACTIVE, name, 0, 5);
        var nextActivePage = projectService.getProjectPage(ProjectStatus.ACTIVE, name, 1, 5);
        var archivedPage = projectService.getProjectPage(ProjectStatus.ARCHIVED, name, 0, 5);
        var search = projectService.getProjectPage(null, name, 0, 5);
        assertThat(activePage.totalElements()).isEqualTo(5);
        assertThat(activePage.totalPages()).isEqualTo(1);
        assertThat(nextActivePage.items()).isEmpty();
        assertThat(archivedPage.totalElements()).isEqualTo(5);
        assertThat(archivedPage.totalPages()).isEqualTo(1);
        assertThat(archivedPage.items()).extracting(ProjectResponse::publicToken)
                .contains(olderToken).doesNotContain(deletedPreviewToken);
        assertThat(search.totalElements()).isEqualTo(10);
        assertThat(search.totalPages()).isEqualTo(2);
    }

    @Test
    @Transactional
    void listsCreatedActiveProjectsAndArchivedEventInDeterministicOrder() {
        ProjectResponse continuous = projectService.createProject(new CreateProjectRequest(
                "Continuous list", null, ProjectType.CONTINUOUS, 1,
                List.of(new CreateProjectMemberRequest("Alice"))));
        ProjectResponse event = projectService.createProject(new CreateProjectRequest(
                "Event list", null, ProjectType.EVENT, 1,
                List.of(new CreateProjectMemberRequest("Bob"))));
        ProjectResponse archived = projectService.createProject(new CreateProjectRequest(
                "Archived list", null, ProjectType.EVENT, 1,
                List.of(new CreateProjectMemberRequest("Carol"))));
        projectService.archiveProject(archived.publicToken());

        Instant base = Instant.parse("2026-01-01T00:00:00Z");
        jdbcTemplate.update("UPDATE projects SET updated_at = ? WHERE public_token = ?",
                Timestamp.from(base), continuous.publicToken());
        jdbcTemplate.update("UPDATE projects SET updated_at = ? WHERE public_token = ?",
                Timestamp.from(base.plusSeconds(1)), event.publicToken());
        jdbcTemplate.update("UPDATE projects SET updated_at = ? WHERE public_token = ?",
                Timestamp.from(base.plusSeconds(2)), archived.publicToken());
        entityManager.clear();

        List<ProjectResponse> listed = projectService.getProjects();
        assertThat(listed).extracting(ProjectResponse::publicToken)
                .containsSubsequence(archived.publicToken(), event.publicToken(),
                        continuous.publicToken());
        assertThat(listed).filteredOn(project -> project.publicToken().equals(continuous.publicToken()))
                .singleElement().satisfies(project -> {
                    assertThat(project.type()).isEqualTo(ProjectType.CONTINUOUS);
                    assertThat(project.status()).isEqualTo(ProjectStatus.ACTIVE);
                    assertThat(project.members()).singleElement()
                            .extracting(member -> member.name()).isEqualTo("Alice");
                });
        assertThat(listed).filteredOn(project -> project.publicToken().equals(event.publicToken()))
                .singleElement().satisfies(project -> {
                    assertThat(project.type()).isEqualTo(ProjectType.EVENT);
                    assertThat(project.status()).isEqualTo(ProjectStatus.ACTIVE);
                });
        assertThat(listed).filteredOn(project -> project.publicToken().equals(archived.publicToken()))
                .singleElement().satisfies(project -> {
                    assertThat(project.type()).isEqualTo(ProjectType.EVENT);
                    assertThat(project.status()).isEqualTo(ProjectStatus.ARCHIVED);
                });
    }

    @Test
    @Transactional
    void pagesActiveProjectsAtTenWithStableOrderAndOutOfRangeMetadata() {
        String prefix = "Page-" + UUID.randomUUID() + "-";
        var empty = projectService.getProjectPage(ProjectStatus.ACTIVE, prefix, 0, 5);
        assertThat(empty.items()).isEmpty();
        assertThat(empty.totalElements()).isZero();
        assertThat(empty.totalPages()).isZero();

        List<String> tokens = new ArrayList<>();
        for (int index = 0; index < 23; index++) {
            ProjectResponse created = projectService.createProject(new CreateProjectRequest(
                    prefix + index, null, ProjectType.EVENT, 1,
                    List.of(new CreateProjectMemberRequest("Member"))));
            tokens.add(created.publicToken());
            if (index == 0 || index == 4 || index == 5 || index == 9 || index == 10) {
                for (int size : List.of(5, 10)) {
                    var page = projectService.getProjectPage(ProjectStatus.ACTIVE, prefix, 0, size);
                    assertThat(page.items()).hasSize(Math.min(index + 1, size));
                    assertThat(page.totalElements()).isEqualTo(index + 1);
                    assertThat(page.totalPages()).isEqualTo((index + size) / size);
                }
            }
        }

        Instant base = Instant.parse("2026-01-01T00:00:00Z");
        for (int index = 0; index < tokens.size(); index++) {
            jdbcTemplate.update("UPDATE projects SET updated_at = ? WHERE public_token = ?",
                    Timestamp.from(base.plusSeconds(index)), tokens.get(index));
        }
        entityManager.clear();

        var first = projectService.getProjectPage(ProjectStatus.ACTIVE, prefix, 0, 10);
        var second = projectService.getProjectPage(ProjectStatus.ACTIVE, prefix, 1, 10);
        var last = projectService.getProjectPage(ProjectStatus.ACTIVE, prefix, 2, 10);
        var outOfRange = projectService.getProjectPage(ProjectStatus.ACTIVE, prefix, 3, 10);
        var firstFive = projectService.getProjectPage(ProjectStatus.ACTIVE, prefix, 0, 5);
        var lastFive = projectService.getProjectPage(ProjectStatus.ACTIVE, prefix, 4, 5);
        var outOfRangeFive = projectService.getProjectPage(ProjectStatus.ACTIVE, prefix, 5, 5);
        var searchPage = projectService.getProjectPage(null, prefix, 1, 10);
        var searchPageFive = projectService.getProjectPage(null, prefix, 1, 5);
        assertThat(first.size()).isEqualTo(10);
        assertThat(first.totalElements()).isEqualTo(23);
        assertThat(first.totalPages()).isEqualTo(3);
        assertThat(first.items()).extracting(ProjectResponse::publicToken)
                .containsExactlyElementsOf(List.of(tokens.get(22), tokens.get(21), tokens.get(20),
                        tokens.get(19), tokens.get(18), tokens.get(17), tokens.get(16),
                        tokens.get(15), tokens.get(14), tokens.get(13)));
        assertThat(second.items()).hasSize(10);
        assertThat(firstFive.items()).hasSize(5);
        assertThat(firstFive.items()).extracting(ProjectResponse::publicToken)
                .containsExactly(tokens.get(22), tokens.get(21), tokens.get(20),
                        tokens.get(19), tokens.get(18));
        assertThat(firstFive.page()).isZero();
        assertThat(firstFive.size()).isEqualTo(5);
        assertThat(firstFive.totalElements()).isEqualTo(23);
        assertThat(firstFive.totalPages()).isEqualTo(5);
        assertThat(lastFive.items()).hasSize(3);
        assertThat(lastFive.items()).extracting(ProjectResponse::publicToken)
                .containsExactly(tokens.get(2), tokens.get(1), tokens.get(0));
        assertThat(lastFive.page()).isEqualTo(4);
        assertThat(lastFive.size()).isEqualTo(5);
        assertThat(lastFive.totalElements()).isEqualTo(23);
        assertThat(lastFive.totalPages()).isEqualTo(5);
        assertThat(outOfRangeFive.items()).isEmpty();
        assertThat(outOfRangeFive.page()).isEqualTo(5);
        assertThat(outOfRangeFive.size()).isEqualTo(5);
        assertThat(outOfRangeFive.totalElements()).isEqualTo(23);
        assertThat(outOfRangeFive.totalPages()).isEqualTo(5);
        assertThat(searchPage.items()).hasSize(10);
        assertThat(searchPage.totalPages()).isEqualTo(3);
        assertThat(searchPageFive.items()).hasSize(5);
        assertThat(searchPageFive.items()).extracting(ProjectResponse::publicToken)
                .containsExactly(tokens.get(17), tokens.get(16), tokens.get(15),
                        tokens.get(14), tokens.get(13));
        assertThat(searchPageFive.page()).isEqualTo(1);
        assertThat(searchPageFive.size()).isEqualTo(5);
        assertThat(searchPageFive.totalElements()).isEqualTo(23);
        assertThat(searchPageFive.totalPages()).isEqualTo(5);
        assertThat(last.items()).extracting(ProjectResponse::publicToken)
                .containsExactly(tokens.get(2), tokens.get(1), tokens.get(0));
        assertThat(outOfRange.items()).isEmpty();
        assertThat(outOfRange.totalElements()).isEqualTo(23);
        assertThat(outOfRange.totalPages()).isEqualTo(3);
    }

    @Test
    @Transactional
    void previewsFiveNewestArchivesAndSearchesOlderArchivesAndActiveProjects() {
        String marker = "Target" + UUID.randomUUID().toString().replace("-", "");
        assertThat(projectService.getProjectPage(ProjectStatus.ARCHIVED, marker, 0, 10).items()).isEmpty();
        List<String> archivedTokens = new ArrayList<>();
        for (int index = 0; index < 6; index++) {
            ProjectResponse created = projectService.createProject(new CreateProjectRequest(
                    marker + " archived " + index, null, ProjectType.EVENT, 1,
                    List.of(new CreateProjectMemberRequest("Member"))));
            projectService.archiveProject(created.publicToken());
            archivedTokens.add(created.publicToken());
            var preview = projectService.getProjectPage(ProjectStatus.ARCHIVED, marker, 0, 10);
            assertThat(preview.items()).hasSize(Math.min(index + 1, 5));
            assertThat(preview.size()).isEqualTo(5);
        }
        ProjectResponse active = projectService.createProject(new CreateProjectRequest(
                marker + " active", null, ProjectType.CONTINUOUS, 1,
                List.of(new CreateProjectMemberRequest("Member"))));

        Instant base = Instant.parse("2026-01-01T00:00:00Z");
        for (int index = 0; index < archivedTokens.size(); index++) {
            jdbcTemplate.update("UPDATE projects SET updated_at = ? WHERE public_token = ?",
                    Timestamp.from(base.plusSeconds(index)), archivedTokens.get(index));
        }
        entityManager.clear();

        var preview = projectService.getProjectPage(ProjectStatus.ARCHIVED, marker, 0, 10);
        assertThat(preview.totalElements()).isEqualTo(6);
        assertThat(preview.items()).extracting(ProjectResponse::publicToken)
                .containsExactly(archivedTokens.get(5), archivedTokens.get(4),
                        archivedTokens.get(3), archivedTokens.get(2), archivedTokens.get(1));
        assertThat(projectService.getProjectPage(null, "  " + marker.toLowerCase() + " ARCHIVED 0  ", 0, 5)
                .items()).extracting(ProjectResponse::publicToken).containsExactly(archivedTokens.get(0));
        assertThat(projectService.getProjectPage(null, marker + " archived 5", 0, 10).items())
                .extracting(ProjectResponse::publicToken).containsExactly(archivedTokens.get(5));
        assertThat(projectService.getProjectPage(null, marker + " active", 0, 5).items())
                .extracting(ProjectResponse::publicToken).containsExactly(active.publicToken());
        assertThat(projectService.getProjectPage(null, marker + " missing", 0, 10).items()).isEmpty();
    }

    @Test
    @Transactional
    void usesProjectIdToBreakEqualTimestampTies() {
        String prefix = "Tie-" + UUID.randomUUID() + "-";
        for (int index = 0; index < 2; index++) {
            projectService.createProject(new CreateProjectRequest(
                    prefix + index, null, ProjectType.EVENT, 1,
                    List.of(new CreateProjectMemberRequest("Member"))));
        }
        Timestamp tiedAt = Timestamp.from(Instant.parse("2026-01-01T00:00:00Z"));
        jdbcTemplate.update("UPDATE projects SET created_at = ?, updated_at = ? WHERE name LIKE ?",
                tiedAt, tiedAt, prefix + "%");
        entityManager.clear();

        List<String> expected = jdbcTemplate.queryForList(
                "SELECT public_token FROM projects WHERE name LIKE ? ORDER BY id ASC",
                String.class, prefix + "%");
        assertThat(projectService.getProjectPage(ProjectStatus.ACTIVE, prefix, 0, 10).items())
                .extracting(ProjectResponse::publicToken).containsExactlyElementsOf(expected);
    }

    @Test
    void flywayCreatesProjectTables() {
        Integer appliedMigrationCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM flyway_schema_history WHERE version = '1' AND success",
                Integer.class
        );
        String projectsTable = jdbcTemplate.queryForObject(
                "SELECT to_regclass('public.projects')::text",
                String.class
        );
        String projectMembersTable = jdbcTemplate.queryForObject(
                "SELECT to_regclass('public.project_members')::text",
                String.class
        );

        assertThat(appliedMigrationCount).isEqualTo(1);
        assertThat(projectsTable).isEqualTo("projects");
        assertThat(projectMembersTable).isEqualTo("project_members");
    }

    @Test
    @Transactional
    void savesAndFindsProjectByPublicToken() {
        String publicToken = token('A');
        Project project = projectRepository.saveAndFlush(
                new Project(publicToken, "共同生活費", "毎月の共有費用", ProjectType.CONTINUOUS, 100)
        );

        Project found = projectRepository.findByPublicTokenAndDeletedAtIsNull(publicToken).orElseThrow();

        assertThat(found.getId()).isEqualTo(project.getId());
        assertThat(found.getStatus()).isEqualTo(ProjectStatus.ACTIVE);
        assertThat(found.getVersion()).isZero();
        assertThat(found.getCreatedAt()).isNotNull();
        assertThat(found.getUpdatedAt()).isNotNull();
    }

    @Test
    @Transactional
    void savesAndFindsProjectMembersInDisplayOrder() {
        Project project = projectRepository.saveAndFlush(
                new Project(token('B'), "沖縄旅行", null, ProjectType.EVENT, 10)
        );
        projectMemberRepository.save(new ProjectMember(project, "さくら", 2));
        projectMemberRepository.save(new ProjectMember(project, "太郎", 1));
        projectMemberRepository.flush();

        List<ProjectMember> members =
                projectMemberRepository.findAllByProject_IdOrderByDisplayOrderAsc(project.getId());

        assertThat(members).extracting(ProjectMember::getName)
                .containsExactly("太郎", "さくら");
        assertThat(members).allSatisfy(member -> {
            assertThat(member.getProject().getId()).isEqualTo(project.getId());
            assertThat(member.isActive()).isTrue();
            assertThat(member.getCreatedAt()).isNotNull();
            assertThat(member.getUpdatedAt()).isNotNull();
        });
    }

    @Test
    @Transactional
    void rejectsDuplicatePublicToken() {
        String duplicateToken = token('C');
        projectRepository.saveAndFlush(
                new Project(duplicateToken, "Project 1", null, ProjectType.EVENT, 1)
        );

        assertThatThrownBy(() -> projectRepository.saveAndFlush(
                new Project(duplicateToken, "Project 2", null, ProjectType.EVENT, 1)
        )).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @Transactional
    void convertsPublicTokenConstraintWithoutLoggingFullToken(CapturedOutput output) {
        String duplicateToken = token('K');
        projectRepository.saveAndFlush(
                new Project(duplicateToken, "Existing", null, ProjectType.EVENT, 1)
        );
        PublicTokenGenerator duplicateTokenGenerator = new PublicTokenGenerator() {
            @Override
            public String generate() {
                return duplicateToken;
            }
        };
        ProjectService conflictService = new ProjectService(
                projectRepository,
                projectMemberRepository,
                duplicateTokenGenerator
        );
        CreateProjectRequest request = new CreateProjectRequest(
                "Conflicting",
                null,
                ProjectType.EVENT,
                1,
                List.of(new CreateProjectMemberRequest("Member"))
        );

        assertThatThrownBy(() -> conflictService.createProject(request))
                .isInstanceOf(ProjectPublicTokenConflictException.class)
                .hasMessageNotContaining(duplicateToken);
        assertThat(output).doesNotContain(duplicateToken);
    }

    @Test
    @Transactional
    void rejectsDuplicateDisplayOrderWithinProject() {
        Project project = projectRepository.saveAndFlush(
                new Project(token('D'), "Project", null, ProjectType.EVENT, 1)
        );
        projectMemberRepository.saveAndFlush(new ProjectMember(project, "Member 1", 1));

        assertThatThrownBy(() -> projectMemberRepository.saveAndFlush(
                new ProjectMember(project, "Member 2", 1)
        )).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @Transactional
    void rejectsDisplayOrderBelowOne() {
        Project project = projectRepository.saveAndFlush(
                new Project(token('E'), "Project", null, ProjectType.EVENT, 1)
        );

        assertThatThrownBy(() -> projectMemberRepository.saveAndFlush(
                new ProjectMember(project, "Member", 0)
        )).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @Transactional
    void rejectsProjectNameContainingOnlyTabs() {
        assertThatThrownBy(() -> projectRepository.saveAndFlush(
                new Project(token('I'), "\t\t", null, ProjectType.EVENT, 1)
        )).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @Transactional
    void rejectsProjectMemberNameContainingOnlyNewlines() {
        Project project = projectRepository.saveAndFlush(
                new Project(token('J'), "Project", null, ProjectType.EVENT, 1)
        );

        assertThatThrownBy(() -> projectMemberRepository.saveAndFlush(
                new ProjectMember(project, "\n\n", 1)
        )).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @Transactional
    void rejectsActiveProjectWithArchivedTimestamp() {
        assertThatThrownBy(() -> insertProject(
                token('F'),
                "EVENT",
                "ACTIVE",
                true
        )).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @Transactional
    void rejectsArchivedContinuousProject() {
        assertThatThrownBy(() -> insertProject(
                token('G'),
                "CONTINUOUS",
                "ARCHIVED",
                true
        )).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @Transactional
    void rejectsArchivedProjectWithoutArchivedTimestamp() {
        assertThatThrownBy(() -> insertProject(
                token('H'),
                "EVENT",
                "ARCHIVED",
                false
        )).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @Transactional
    void rejectsPublicTokenOutsideApprovedFormat() {
        assertThatThrownBy(() -> insertProject(
                "!".repeat(43),
                "EVENT",
                "ACTIVE",
                false
        )).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rollsBackProjectWhenInitialMemberPersistenceFails() {
        long projectCountBefore = projectRepository.count();
        long memberCountBefore = projectMemberRepository.count();
        CreateProjectRequest request = new CreateProjectRequest(
                "Rollback test",
                null,
                ProjectType.EVENT,
                1,
                List.of(new CreateProjectMemberRequest("M".repeat(101)))
        );

        assertThatThrownBy(() -> projectService.createProject(request))
                .isInstanceOf(DataIntegrityViolationException.class);

        assertThat(projectRepository.count()).isEqualTo(projectCountBefore);
        assertThat(projectMemberRepository.count()).isEqualTo(memberCountBefore);
    }

    @Test
    void addsMemberAfterInactiveMaximumOrderAndReturnsMembersInOrder() {
        ProjectResponse created = projectService.createProject(new CreateProjectRequest(
                "Member addition",
                null,
                ProjectType.EVENT,
                1,
                List.of(
                        new CreateProjectMemberRequest("  First  "),
                        new CreateProjectMemberRequest("Second")
                )
        ));
        Project project = projectRepository.findByPublicTokenAndDeletedAtIsNull(created.publicToken()).orElseThrow();
        ProjectMember inactiveMaximum = projectMemberRepository.saveAndFlush(
                new ProjectMember(project, "Inactive", 5)
        );
        jdbcTemplate.update(
                "UPDATE project_members SET active = FALSE WHERE id = ?",
                inactiveMaximum.getId()
        );

        var added = projectService.addMember(
                created.publicToken(),
                new CreateProjectMemberRequest("  Added  ")
        );
        ProjectResponse retrieved = projectService.getProject(created.publicToken());

        assertThat(added.id()).isNotNull();
        assertThat(added.name()).isEqualTo("Added");
        assertThat(added.displayOrder()).isEqualTo(6);
        assertThat(added.active()).isTrue();
        assertThat(projectMemberRepository
                .findByIdAndProject_Id(added.id(), project.getId()))
                .isPresent()
                .get()
                .satisfies(member -> {
                    assertThat(member.getName()).isEqualTo("Added");
                    assertThat(member.getDisplayOrder()).isEqualTo(6);
                    assertThat(member.isActive()).isTrue();
                });
        assertThat(retrieved.members())
                .extracting(member -> member.displayOrder())
                .containsExactly(1, 2, 5, 6);
        assertThat(retrieved.members())
                .extracting(member -> member.name())
                .containsExactly("First", "Second", "Inactive", "Added");
        assertThat(retrieved.members())
                .filteredOn(member -> member.id().equals(inactiveMaximum.getId()))
                .extracting(member -> member.active())
                .containsExactly(false);
    }

    @Test
    void rollsBackFailedMemberAddition() {
        ProjectResponse created = projectService.createProject(new CreateProjectRequest(
                "Failed member addition",
                null,
                ProjectType.EVENT,
                1,
                List.of(new CreateProjectMemberRequest("Existing"))
        ));
        Project project = projectRepository.findByPublicTokenAndDeletedAtIsNull(created.publicToken()).orElseThrow();
        long memberCountBefore = projectMemberRepository
                .findAllByProject_IdOrderByDisplayOrderAsc(project.getId())
                .size();

        assertThatThrownBy(() -> projectService.addMember(
                created.publicToken(),
                new CreateProjectMemberRequest("M".repeat(101))
        )).isInstanceOf(DataIntegrityViolationException.class);

        assertThat(projectMemberRepository
                .findAllByProject_IdOrderByDisplayOrderAsc(project.getId()))
                .hasSize((int) memberCountBefore)
                .extracting(ProjectMember::getName)
                .containsExactly("Existing");
    }

    @Test
    void renamesMemberAndReflectsItInProjectRetrieval() {
        ProjectResponse created = projectService.createProject(new CreateProjectRequest(
                "Member rename",
                null,
                ProjectType.EVENT,
                1,
                List.of(new CreateProjectMemberRequest("Before"))
        ));
        UUID memberId = created.members().getFirst().id();

        var renamed = projectService.renameMember(
                created.publicToken(),
                memberId,
                new RenameProjectMemberRequest("  After  ")
        );
        ProjectResponse retrieved = projectService.getProject(created.publicToken());

        assertThat(renamed.name()).isEqualTo("After");
        assertThat(renamed.displayOrder()).isEqualTo(1);
        assertThat(renamed.active()).isTrue();
        assertThat(retrieved.members()).singleElement().satisfies(member -> {
            assertThat(member.id()).isEqualTo(memberId);
            assertThat(member.name()).isEqualTo("After");
            assertThat(member.displayOrder()).isEqualTo(1);
            assertThat(member.active()).isTrue();
        });
    }

    @Test
    void doesNotRenameMemberBelongingToAnotherProject() {
        ProjectResponse addressedProject = projectService.createProject(new CreateProjectRequest(
                "Addressed project",
                null,
                ProjectType.EVENT,
                1,
                List.of(new CreateProjectMemberRequest("Addressed member"))
        ));
        ProjectResponse otherProject = projectService.createProject(new CreateProjectRequest(
                "Other project",
                null,
                ProjectType.EVENT,
                1,
                List.of(new CreateProjectMemberRequest("Other member"))
        ));
        UUID otherMemberId = otherProject.members().getFirst().id();

        assertThatThrownBy(() -> projectService.renameMember(
                addressedProject.publicToken(),
                otherMemberId,
                new RenameProjectMemberRequest("Exposed")
        )).isInstanceOf(MemberNotFoundException.class);

        Project other = projectRepository.findByPublicTokenAndDeletedAtIsNull(otherProject.publicToken()).orElseThrow();
        assertThat(projectMemberRepository
                .findByIdAndProject_Id(otherMemberId, other.getId()))
                .isPresent()
                .get()
                .extracting(ProjectMember::getName)
                .isEqualTo("Other member");
    }

    @Test
    void doesNotRenameInactiveMember() {
        ProjectResponse created = projectService.createProject(new CreateProjectRequest(
                "Inactive member",
                null,
                ProjectType.EVENT,
                1,
                List.of(new CreateProjectMemberRequest("Before"))
        ));
        UUID memberId = created.members().getFirst().id();
        jdbcTemplate.update(
                "UPDATE project_members SET active = FALSE WHERE id = ?",
                memberId
        );

        assertThatThrownBy(() -> projectService.renameMember(
                created.publicToken(),
                memberId,
                new RenameProjectMemberRequest("After")
        )).isInstanceOf(MemberInactiveException.class);

        Project project = projectRepository.findByPublicTokenAndDeletedAtIsNull(created.publicToken()).orElseThrow();
        assertThat(projectMemberRepository.findByIdAndProject_Id(memberId, project.getId()))
                .isPresent()
                .get()
                .satisfies(member -> {
                    assertThat(member.getName()).isEqualTo("Before");
                    assertThat(member.isActive()).isFalse();
                });
    }

    @Test
    void keepsOriginalMemberNameWhenArchivedProjectRejectsRename() {
        ProjectResponse created = projectService.createProject(new CreateProjectRequest(
                "Archived member",
                null,
                ProjectType.EVENT,
                1,
                List.of(new CreateProjectMemberRequest("Before"))
        ));
        UUID memberId = created.members().getFirst().id();
        Project project = projectRepository.findByPublicTokenAndDeletedAtIsNull(created.publicToken()).orElseThrow();
        jdbcTemplate.update(
                """
                UPDATE projects
                SET status = 'ARCHIVED', archived_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                project.getId()
        );

        assertThatThrownBy(() -> projectService.renameMember(
                created.publicToken(),
                memberId,
                new RenameProjectMemberRequest("After")
        )).isInstanceOf(ProjectArchivedException.class);

        assertThat(projectMemberRepository.findByIdAndProject_Id(memberId, project.getId()))
                .isPresent()
                .get()
                .extracting(ProjectMember::getName)
                .isEqualTo("Before");
    }

    @Test
    void archivesActiveEventAndPersistsArchivedState() {
        ProjectResponse created = projectService.createProject(new CreateProjectRequest(
                "Archive event",
                null,
                ProjectType.EVENT,
                1,
                List.of(new CreateProjectMemberRequest("さくら"))
        ));

        ProjectResponse archived = projectService.archiveProject(created.publicToken());
        ProjectResponse reloaded = projectService.getProject(created.publicToken());
        Project persisted = projectRepository.findByPublicTokenAndDeletedAtIsNull(created.publicToken()).orElseThrow();

        assertThat(archived.status()).isEqualTo(ProjectStatus.ARCHIVED);
        assertThat(archived.archivedAt()).isNotNull();
        assertThat(reloaded.status()).isEqualTo(ProjectStatus.ARCHIVED);
        assertThat(reloaded.archivedAt()).isEqualTo(archived.archivedAt());
        assertThat(persisted.getStatus()).isEqualTo(ProjectStatus.ARCHIVED);
        assertThat(persisted.getArchivedAt()).isEqualTo(archived.archivedAt());
    }

    @Test
    void archivesActiveEventWithoutExpensesOrSettlement() {
        ProjectResponse created = projectService.createProject(new CreateProjectRequest(
                "Empty archive event",
                null,
                ProjectType.EVENT,
                1,
                List.of(new CreateProjectMemberRequest("さくら"))
        ));

        ProjectResponse archived = projectService.archiveProject(created.publicToken());

        assertThat(archived.status()).isEqualTo(ProjectStatus.ARCHIVED);
        assertThat(archived.archivedAt()).isNotNull();
        assertThat(archived.members()).singleElement()
                .extracting(member -> member.name())
                .isEqualTo("さくら");
    }

    @Test
    void rejectsArchiveWhenPublicTokenDoesNotExist() {
        assertThatThrownBy(() -> projectService.archiveProject(token('Z')))
                .isInstanceOf(ProjectNotFoundException.class);
    }

    @Test
    void rejectsArchiveForContinuousProject() {
        ProjectResponse created = projectService.createProject(new CreateProjectRequest(
                "Continuous archive",
                null,
                ProjectType.CONTINUOUS,
                1,
                List.of(new CreateProjectMemberRequest("さくら"))
        ));

        assertThatThrownBy(() -> projectService.archiveProject(created.publicToken()))
                .isInstanceOf(EventArchiveUnsupportedException.class);

        ProjectResponse reloaded = projectService.getProject(created.publicToken());
        assertThat(reloaded.status()).isEqualTo(ProjectStatus.ACTIVE);
        assertThat(reloaded.archivedAt()).isNull();
    }

    @Test
    void rejectsRepeatArchiveAsProjectArchived() {
        ProjectResponse created = projectService.createProject(new CreateProjectRequest(
                "Repeat archive",
                null,
                ProjectType.EVENT,
                1,
                List.of(new CreateProjectMemberRequest("さくら"))
        ));
        projectService.archiveProject(created.publicToken());

        assertThatThrownBy(() -> projectService.archiveProject(created.publicToken()))
                .isInstanceOf(ProjectArchivedException.class);
    }

    @Test
    void rejectsMemberMutationsAfterArchive() {
        ProjectResponse created = projectService.createProject(new CreateProjectRequest(
                "Archived mutations",
                null,
                ProjectType.EVENT,
                1,
                List.of(new CreateProjectMemberRequest("Before"))
        ));
        UUID memberId = created.members().getFirst().id();
        projectService.archiveProject(created.publicToken());

        assertThatThrownBy(() -> projectService.addMember(
                created.publicToken(),
                new CreateProjectMemberRequest("After")
        )).isInstanceOf(ProjectArchivedException.class);
        assertThatThrownBy(() -> projectService.renameMember(
                created.publicToken(),
                memberId,
                new RenameProjectMemberRequest("Renamed")
        )).isInstanceOf(ProjectArchivedException.class);

        ProjectResponse reloaded = projectService.getProject(created.publicToken());
        assertThat(reloaded.members()).singleElement().satisfies(member -> {
            assertThat(member.id()).isEqualTo(memberId);
            assertThat(member.name()).isEqualTo("Before");
        });
    }

    private void insertProject(
            String publicToken,
            String type,
            String status,
            boolean includeArchivedAt
    ) {
        jdbcTemplate.update(
                """
                INSERT INTO projects (
                    id,
                    public_token,
                    name,
                    type,
                    currency,
                    rounding_unit,
                    status,
                    archived_at,
                    version,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, 'JPY', 1, ?, %s, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """.formatted(includeArchivedAt ? "CURRENT_TIMESTAMP" : "NULL"),
                UUID.randomUUID(),
                publicToken,
                "Constraint test",
                type,
                status
        );
    }

    private static String token(char character) {
        return String.valueOf(character).repeat(43);
    }
}
