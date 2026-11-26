package com.splitmate.settlement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.YearMonth;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import com.splitmate.project.domain.Project;
import com.splitmate.project.domain.ProjectStatus;
import com.splitmate.project.domain.ProjectType;
import com.splitmate.project.dto.CreateProjectMemberRequest;
import com.splitmate.project.repository.ProjectMemberRepository;
import com.splitmate.project.repository.ProjectRepository;
import com.splitmate.project.service.ProjectArchivedException;
import com.splitmate.project.service.ProjectNotFoundException;
import com.splitmate.project.service.ProjectService;
import com.splitmate.settlement.domain.SettlementRunState;
import com.splitmate.settlement.domain.SettlementStrategy;
import com.splitmate.settlement.repository.SettlementRunRepository;
import com.splitmate.settlement.service.SettlementService;

@SpringBootTest
@ActiveProfiles("local")
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@EnabledIfEnvironmentVariable(
        named = "SPLITMATE_POSTGRES_INTEGRATION_TEST",
        matches = "true",
        disabledReason = "Requires the Docker PostgreSQL integration-test environment."
)
class ProjectLockIntegrationTests {

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private ProjectMemberRepository projectMemberRepository;

    @Autowired
    private ProjectService projectService;

    @Autowired
    private SettlementService settlementService;

    @Autowired
    private SettlementRunRepository settlementRunRepository;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Test
    void pessimisticProjectLockSerializesTwoTransactions() throws Exception {
        TransactionTemplate transactions = new TransactionTemplate(transactionManager);
        Project project = transactions.execute(status -> projectRepository.saveAndFlush(
                new Project(randomToken(), "Locked", null, ProjectType.EVENT, 1)
        ));
        CountDownLatch firstLocked = new CountDownLatch(1);
        CountDownLatch releaseFirst = new CountDownLatch(1);
        CountDownLatch secondAttempting = new CountDownLatch(1);

        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> transactions.execute(status -> {
                projectRepository.findForUpdateByPublicTokenAndDeletedAtIsNull(project.getPublicToken()).orElseThrow();
                firstLocked.countDown();
                await(releaseFirst);
                return true;
            }));
            assertThat(firstLocked.await(5, TimeUnit.SECONDS)).isTrue();

            var second = executor.submit(() -> transactions.execute(status -> {
                secondAttempting.countDown();
                return projectRepository
                        .findForUpdateByPublicTokenAndDeletedAtIsNull(project.getPublicToken())
                        .orElseThrow()
                        .getId();
            }));
            assertThat(secondAttempting.await(5, TimeUnit.SECONDS)).isTrue();
            Thread.sleep(200);
            assertThat(second).isNotDone();

            releaseFirst.countDown();
            assertThat(first.get(5, TimeUnit.SECONDS)).isTrue();
            assertThat(second.get(5, TimeUnit.SECONDS)).isEqualTo(project.getId());
        } finally {
            releaseFirst.countDown();
            transactions.executeWithoutResult(status -> projectRepository.deleteById(project.getId()));
        }
    }

    @Test
    void monthlySettlementWaitsForProjectLockBeforeGeneratingRun() throws Exception {
        TransactionTemplate transactions = new TransactionTemplate(transactionManager);
        Project project = transactions.execute(status -> projectRepository.saveAndFlush(
                new Project(randomToken(), "Monthly lock", null, ProjectType.CONTINUOUS, 1)
        ));
        CountDownLatch firstLocked = new CountDownLatch(1);
        CountDownLatch releaseFirst = new CountDownLatch(1);
        CountDownLatch secondAttempting = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> transactions.execute(status -> {
                projectRepository.findForUpdateByPublicTokenAndDeletedAtIsNull(
                        project.getPublicToken()).orElseThrow();
                firstLocked.countDown();
                await(releaseFirst);
                return true;
            }));
            assertThat(firstLocked.await(5, TimeUnit.SECONDS)).isTrue();
            var second = executor.submit(() -> {
                secondAttempting.countDown();
                return settlementService.getSettlement(project.getPublicToken(),
                        SettlementStrategy.FEWER_TRANSFERS, YearMonth.of(2026, 9));
            });
            assertThat(secondAttempting.await(5, TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> second.get(200, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            releaseFirst.countDown();
            assertThat(first.get(5, TimeUnit.SECONDS)).isTrue();
            assertThat(second.get(5, TimeUnit.SECONDS).scopeKey()).isEqualTo("2026-09");
        } finally {
            releaseFirst.countDown();
            transactions.executeWithoutResult(status -> {
                settlementRunRepository.deleteAll(settlementRunRepository.findAllByProject_IdAndState(
                        project.getId(), SettlementRunState.CURRENT));
                settlementRunRepository.flush();
                projectRepository.deleteById(project.getId());
            });
        }
    }

    @Test
    void concurrentArchiveRequestsSerializeAndRejectTheLaterRequest() throws Exception {
        TransactionTemplate transactions = new TransactionTemplate(transactionManager);
        Project project = transactions.execute(status -> projectRepository.saveAndFlush(
                new Project(randomToken(), "Archive lock", null, ProjectType.EVENT, 1)
        ));
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch ready = new CountDownLatch(2);

        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> {
                ready.countDown();
                await(start);
                return archiveOutcome(project.getPublicToken());
            });
            var second = executor.submit(() -> {
                ready.countDown();
                await(start);
                return archiveOutcome(project.getPublicToken());
            });
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            java.util.List<ArchiveOutcome> outcomes = java.util.List.of(
                    first.get(10, TimeUnit.SECONDS),
                    second.get(10, TimeUnit.SECONDS)
            );
            assertThat(outcomes).filteredOn(ArchiveOutcome::archived).hasSize(1);
            assertThat(outcomes).filteredOn(outcome -> !outcome.archived())
                    .singleElement()
                    .extracting(ArchiveOutcome::conflict)
                    .isInstanceOf(ProjectArchivedException.class);

            Project persisted = projectRepository.findByPublicTokenAndDeletedAtIsNull(project.getPublicToken()).orElseThrow();
            assertThat(persisted.getStatus()).isEqualTo(ProjectStatus.ARCHIVED);
            assertThat(persisted.getArchivedAt()).isNotNull();
        } finally {
            start.countDown();
            transactions.executeWithoutResult(status -> projectRepository.deleteById(project.getId()));
        }
    }

    @Test
    void memberAdditionCannotCommitAfterProjectDeletion() throws Exception {
        TransactionTemplate transactions = new TransactionTemplate(transactionManager);
        Project project = transactions.execute(status -> projectRepository.saveAndFlush(
                new Project(randomToken(), "Delete lock", null, ProjectType.EVENT, 1)
        ));
        CountDownLatch deletionMarked = new CountDownLatch(1);
        CountDownLatch releaseDeletion = new CountDownLatch(1);
        CountDownLatch additionAttempting = new CountDownLatch(1);

        try (var executor = Executors.newFixedThreadPool(2)) {
            var deletion = executor.submit(() -> transactions.execute(status -> {
                projectService.deleteProject(project.getPublicToken());
                deletionMarked.countDown();
                await(releaseDeletion);
                return true;
            }));
            assertThat(deletionMarked.await(5, TimeUnit.SECONDS)).isTrue();

            var addition = executor.submit(() -> {
                additionAttempting.countDown();
                try {
                    projectService.addMember(project.getPublicToken(),
                            new CreateProjectMemberRequest("Late member"));
                    return null;
                } catch (RuntimeException exception) {
                    return exception;
                }
            });
            assertThat(additionAttempting.await(5, TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> addition.get(200, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);

            releaseDeletion.countDown();
            assertThat(deletion.get(5, TimeUnit.SECONDS)).isTrue();
            assertThat(addition.get(5, TimeUnit.SECONDS))
                    .isInstanceOf(ProjectNotFoundException.class);
            assertThat(projectRepository.findById(project.getId()).orElseThrow().getDeletedAt())
                    .isNotNull();
            assertThat(projectMemberRepository.findAllByProject_IdOrderByDisplayOrderAsc(project.getId()))
                    .isEmpty();
        } finally {
            releaseDeletion.countDown();
            transactions.executeWithoutResult(status -> {
                projectMemberRepository.deleteAll(
                        projectMemberRepository.findAllByProject_IdOrderByDisplayOrderAsc(project.getId()));
                projectMemberRepository.flush();
                projectRepository.deleteById(project.getId());
            });
        }
    }

    private ArchiveOutcome archiveOutcome(String publicToken) {
        try {
            projectService.archiveProject(publicToken);
            return new ArchiveOutcome(true, null);
        } catch (RuntimeException exception) {
            return new ArchiveOutcome(false, exception);
        }
    }

    private record ArchiveOutcome(boolean archived, RuntimeException conflict) {
    }

    private void await(CountDownLatch latch) {
        try {
            if (!latch.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Timed out while holding the project lock.");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while holding the project lock.", exception);
        }
    }

    private static String randomToken() {
        String characters = UUID.randomUUID().toString().replace("-", "")
                + UUID.randomUUID().toString().replace("-", "");
        return characters.substring(0, 43);
    }
}
