package com.splitmate.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;

import com.splitmate.identity.repository.AnonymousSubjectRepository;
import com.splitmate.identity.repository.BrowserContextChannelRepository;
import com.splitmate.identity.repository.BrowserCookieSlotRepository;
import com.splitmate.identity.repository.SubjectSessionRepository;
import com.splitmate.identity.service.IdentityStateRules;

import jakarta.persistence.EntityManager;

class IdentityConcurrencyIntegrationTests extends IdentityPostgresTestSupport {
    @Autowired AnonymousSubjectRepository subjects;
    @Autowired BrowserContextChannelRepository channels;
    @Autowired SubjectSessionRepository sessions;
    @Autowired BrowserCookieSlotRepository slots;
    @Autowired EntityManager entityManager;

    @ParameterizedTest
    @ValueSource(strings = {"CHANNEL", "CODE", "SLOT"})
    void t3ConcurrentInsertHasOneWinnerAndRollsBackLoserRows(String kind) throws Exception {
        Fixture f = fixture();
        UUID newRoot = root();
        if (kind.equals("CODE")) jdbc.update("UPDATE " + q("subject_recovery_credentials") + " SET consumed_at=? WHERE id=?", at(NOW), f.code());
        long before = count("anonymous_subjects");
        CountDownLatch firstInserted = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger pid = new AtomicInteger();
        try (var executor = Executors.newFixedThreadPool(2)) {
            try {
                var first = executor.submit(() -> tx(() -> {
                    subject("PENDING", 0);
                    insertContender(kind, f, newRoot);
                    firstInserted.countDown();
                    await(release);
                    return "COMMITTED";
                }));
                await(firstInserted);
                var second = executor.submit(() -> {
                    try {
                        return tx(() -> {
                            pid.set(jdbc.queryForObject("SELECT pg_backend_pid()", Integer.class));
                            subject("PENDING", 0);
                            insertContender(kind, f, newRoot);
                            return "COMMITTED";
                        });
                    } catch (RuntimeException failure) {
                        return sqlState(failure);
                    }
                });
                waitForLock(pid);
                release.countDown();
                assertThat(first.get(10, TimeUnit.SECONDS)).isEqualTo("COMMITTED");
                assertThat(second.get(10, TimeUnit.SECONDS)).isEqualTo("23505");
                assertThat(count("anonymous_subjects")).isEqualTo(before + 1);
            } finally {
                release.countDown();
            }
        }
    }

    @Test
    void t3InitialRootConflictConvergesWithoutUpdatingExistingMetadata() throws Exception {
        UUID id = UUID.randomUUID();
        var results = guardedRace(null,
                () -> insertRootOnce(id, NOW), () -> insertRootOnce(id, NOW.plusSeconds(99)));
        assertThat(results).containsExactly(id, id);
        assertThat(jdbc.queryForObject("SELECT created_at FROM " + q("browser_context_roots") + " WHERE id=?", java.sql.Timestamp.class, id))
                .isEqualTo(at(NOW));
    }

    @ParameterizedTest
    @ValueSource(strings = {"EPOCH", "SESSION", "RECOVERY"})
    void t4ExpectedCounterHasOneWinnerAndUnsignedLocksAgreeWithPostgres(String kind) throws Exception {
        Fixture f = orderedFixture();
        List<UUID> sqlOrder = jdbc.queryForList("SELECT id FROM " + q("anonymous_subjects")
                + " WHERE id IN (?,?) ORDER BY id ASC", UUID.class, B, A);
        assertThat(sqlOrder).containsExactly(A, B);
        List<List<UUID>> traces = new java.util.concurrent.CopyOnWriteArrayList<>();
        List<Boolean> outcomes = guardedRace(null,
                () -> counterWriter(f, kind, List.of(B, A), traces),
                () -> counterWriter(f, kind, List.of(A, B), traces), failure -> {
                    if (failure instanceof CounterConflict) return false;
                    throw failure;
                });
        assertThat(outcomes).containsExactly(true, false);
        assertThat(traces).containsExactly(List.of(A, B), List.of(A, B));
        long actual = switch (kind) {
            case "EPOCH" -> scalar("browser_context_channels", "epoch", f.channel());
            case "SESSION" -> scalar("subject_sessions", "credential_generation", f.session());
            case "RECOVERY" -> scalar("anonymous_subjects", "recovery_generation", f.subject());
            default -> throw new IllegalArgumentException();
        };
        assertThat(actual).isEqualTo(kind.equals("SESSION") ? 1 : 2);
        // Nonnegative SQL CHECKs do not enforce history: Java/guard checks must reject stale resets.
        assertThatThrownCounterConflict(actual, actual - 1);
    }

    @Test
    void t5FreshStateAfterDatabaseWaitRejectsExpiryAndDoesNotReuseManagedEntity() throws Exception {
        Fixture f = fixture();
        for (String table : List.of("anonymous_subjects", "browser_context_roots", "browser_context_channels")) {
            jdbc.update("UPDATE " + q(table) + " SET created_at=clock_timestamp()-interval '1 second'");
        }
        jdbc.update("UPDATE " + q("subject_sessions")
                + " SET created_at=clock_timestamp()-interval '1 second',idle_expires_at=clock_timestamp()+interval '10 seconds',"
                + "absolute_expires_at=clock_timestamp()+interval '20 seconds' WHERE id=?", f.session());
        jdbc.update("UPDATE " + q("browser_cookie_slots") + " SET created_at=clock_timestamp()-interval '1 second',"
                + "cookie_expires_at=clock_timestamp()+interval '10 seconds' WHERE id=?", f.slot());
        CountDownLatch locked = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger pid = new AtomicInteger();
        AtomicReference<Instant> expiry = new AtomicReference<>();
        try (var executor = Executors.newFixedThreadPool(2)) {
            try {
                var first = executor.submit(() -> tx(() -> {
                    guard(f);
                    expiry.set(jdbc.queryForObject("UPDATE " + q("subject_sessions")
                            + " SET idle_expires_at=clock_timestamp()+interval '250 milliseconds' WHERE id=? RETURNING idle_expires_at",
                            java.sql.Timestamp.class, f.session()).toInstant());
                    locked.countDown();
                    await(release);
                    return true;
                }));
                await(locked);
                var second = executor.submit(() -> tx(() -> {
                    var stale = sessions.findById(f.session()).orElseThrow();
                    assertThat(stale.getIdleExpiresAt()).isAfter(expiry.get());
                    pid.set(jdbc.queryForObject("SELECT pg_backend_pid()", Integer.class));
                    guard(f);
                    entityManager.refresh(stale);
                    Instant fresh = jdbc.queryForObject("SELECT clock_timestamp()", java.sql.Timestamp.class).toInstant();
                    return IdentityStateRules.isCurrentSubjectSessionState(subjects.findById(f.subject()).orElseThrow(), stale,
                            channels.findById(f.channel()).orElseThrow(), slots.findById(f.slot()).orElseThrow(), 1L, fresh);
                }));
                waitForLock(pid);
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
                while (jdbc.queryForObject("SELECT clock_timestamp()", java.sql.Timestamp.class).toInstant().isBefore(expiry.get())) {
                    if (System.nanoTime() > deadline) throw new AssertionError("Database clock did not pass fixture expiry.");
                    Thread.sleep(5);
                }
                release.countDown();
                assertThat(first.get(10, TimeUnit.SECONDS)).isTrue();
                assertThat(second.get(10, TimeUnit.SECONDS)).isFalse();
            } finally {
                release.countDown();
            }
        }
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void t6CleanupAndCompletionRecheckPendingAndReceiptInBothCommitOrders(boolean completeFirst) throws Exception {
        Fixture f = fixture();
        UUID attempt = attempt(f);
        UUID provisional = slot(f.channel(), "PROVISIONAL", attempt, 0, 1);
        Instant cutoff = NOW.plusSeconds(120);
        jdbc.update("UPDATE " + q("browser_cookie_slots") + " SET cookie_expires_at=? WHERE id=?",
                at(NOW.plusSeconds(60)), provisional);
        AtomicReference<List<String>> completedState = new AtomicReference<>();
        Supplier<Boolean> cleanup = () -> {
            List<String> before = snapshot();
            boolean purged = eligibleAttemptPurge(f, attempt, provisional, cutoff);
            assertThat(purged).isFalse();
            assertThat(snapshot()).isEqualTo(before);
            return purged;
        };
        Supplier<Boolean> writer = () -> {
            complete(f, attempt);
            assertThat(jdbc.queryForObject("SELECT receipt_expires_at FROM " + q("subject_recovery_attempts")
                    + " WHERE id=?", java.sql.Timestamp.class, attempt)).isEqualTo(at(NOW.plusSeconds(300)));
            completedState.set(snapshot());
            return true;
        };
        var results = completeFirst ? guardedRace(f, writer, cleanup) : guardedRace(f, cleanup, writer);
        assertThat(results).containsExactly(completeFirst, !completeFirst);
        assertThat(snapshot()).isEqualTo(completedState.get());
        assertThat(count("subject_recovery_attempts")).isEqualTo(1);
        assertThat(count("browser_cookie_slots")).isEqualTo(3);
        assertThat(scalar("browser_context_channels", "epoch", f.channel())).isEqualTo(2);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void t6ReceiptAloneProtectsExpiredCookieUntilReceiptExpiry(boolean receiptExpired) {
        Fixture f = fixture();
        Fixture other = fixture();
        UUID shareChannel = channel(other.root(), "SHARE");
        UUID shareSlot = slot(shareChannel, "SHARE", shareSession(shareChannel), 0, 1);
        UUID attempt = attempt(f);
        UUID provisional = slot(f.channel(), "PROVISIONAL", attempt, 0, 1);
        Instant cookieExpiry = NOW.plusSeconds(60);
        Instant receiptExpiry = NOW.plusSeconds(300);
        Instant cutoff = receiptExpired ? receiptExpiry : NOW.plusSeconds(120);
        jdbc.update("UPDATE " + q("browser_cookie_slots") + " SET cookie_expires_at=? WHERE id=?",
                at(cookieExpiry), provisional);
        Completion completed = complete(f, attempt);

        // Every other eligibility condition holds; the live receipt must be the sole veto.
        assertThat(cookieExpiry).isBefore(cutoff);
        assertThat(jdbc.queryForMap("SELECT context_channel_id,subject_id,consumed_at,receipt_expires_at FROM "
                + q("subject_recovery_attempts") + " WHERE id=?", attempt))
                .containsEntry("context_channel_id", f.channel()).containsEntry("subject_id", f.subject())
                .containsEntry("consumed_at", at(NOW.plusSeconds(1))).containsEntry("receipt_expires_at", at(receiptExpiry));
        assertThat(jdbc.queryForMap("SELECT context_channel_id,purpose,kind,terminal_at,cookie_expires_at FROM "
                + q("browser_cookie_slots") + " WHERE id=?", provisional))
                .containsEntry("context_channel_id", f.channel()).containsEntry("purpose", "SUBJECT")
                .containsEntry("kind", "PROVISIONAL").containsEntry("terminal_at", at(NOW.plusSeconds(1)))
                .containsEntry("cookie_expires_at", at(cookieExpiry));
        assertThat(jdbc.queryForMap("SELECT current_slot_id,pending_attempt_id FROM "
                + q("browser_context_channels") + " WHERE id=?", f.channel()))
                .containsEntry("current_slot_id", completed.slot()).containsEntry("pending_attempt_id", null);
        assertThat(provisional).isNotEqualTo(completed.slot());
        assertThat(cutoff.isBefore(receiptExpiry)).isEqualTo(!receiptExpired);

        List<String> before = snapshot();
        List<String> removedRows = List.of(
                jdbc.queryForObject("SELECT row_to_json(t)::text FROM " + q("subject_recovery_attempts")
                        + " t WHERE id=?", String.class, attempt),
                jdbc.queryForObject("SELECT row_to_json(t)::text FROM " + q("browser_cookie_slots")
                        + " t WHERE id=?", String.class, provisional));
        assertThat(tx(() -> eligibleAttemptPurge(f, attempt, provisional, cutoff))).isEqualTo(receiptExpired);
        if (receiptExpired) {
            List<String> retainedRows = new ArrayList<>(before);
            assertThat(retainedRows.removeAll(removedRows)).isTrue();
            assertThat(retainedRows).hasSize(before.size() - 2);
            assertThat(snapshot()).containsExactlyElementsOf(retainedRows);
            assertThat(jdbc.queryForList("SELECT id FROM " + q("subject_recovery_attempts"), UUID.class)).isEmpty();
            assertThat(jdbc.queryForList("SELECT id FROM " + q("browser_cookie_slots"), UUID.class))
                    .containsExactlyInAnyOrder(f.slot(), completed.slot(), other.slot(), shareSlot);
        } else {
            assertThat(snapshot()).isEqualTo(before);
        }
    }

    @Test
    void t6EligiblePurgeUsesForeignKeyOrderAndKeepsTombstonesAndOtherContext() {
        Fixture f = fixture();
        Fixture other = fixture();
        UUID attempt = attempt(f);
        UUID provisional = slot(f.channel(), "PROVISIONAL", attempt, 0, 1);
        Completion completed = complete(f, attempt);
        rejected("UPDATE " + q("subject_recovery_attempts")
                + " SET result_slot_id=NULL,result_session_id=NULL WHERE id=?", "23514", attempt);
        tx(() -> {
            guard(f);
            jdbc.update("UPDATE " + q("browser_context_channels") + " SET current_slot_id=NULL,epoch=3 WHERE id=?", f.channel());
            jdbc.update("UPDATE " + q("browser_cookie_slots") + " SET terminal_at=? WHERE id=?", at(NOW.plusSeconds(10)), completed.slot());
            assertThat(eligibleAttemptPurge(f, attempt, provisional, NOW.plusSeconds(10000))).isTrue();
            for (UUID id : List.of(f.slot(), completed.slot())) jdbc.update("DELETE FROM " + q("browser_cookie_slots") + " WHERE id=?", id);
            for (UUID id : List.of(f.session(), completed.session())) {
                jdbc.update("UPDATE " + q("subject_sessions") + " SET revoked_at=? WHERE id=?", at(NOW.plusSeconds(10)), id);
                jdbc.update("DELETE FROM " + q("subject_sessions") + " WHERE id=?", id);
            }
            jdbc.update("DELETE FROM " + q("subject_recovery_credentials") + " WHERE id=?", f.code());
            return null;
        });
        assertThat(count("subject_recovery_attempts")).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM " + q("browser_context_roots") + " WHERE id=?", Integer.class, f.root())).isEqualTo(1);
        assertThat(scalar("browser_context_channels", "epoch", f.channel())).isEqualTo(3);
        assertThat(jdbc.queryForObject("SELECT current_slot_id FROM " + q("browser_context_channels") + " WHERE id=?", UUID.class, other.channel())).isEqualTo(other.slot());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM " + q("anonymous_subjects") + " WHERE id=?", Integer.class, f.subject())).isEqualTo(1);
    }

    @Test
    void t6CleanupNeverSelectsAnotherChannelEvenWhenItsReceiptHasExpired() {
        Fixture f = fixture();
        Fixture other = fixture();
        UUID attempt = attempt(other);
        UUID provisional = slot(other.channel(), "PROVISIONAL", attempt, 0, 1);
        complete(other, attempt);
        List<String> before = snapshot();
        assertThat(tx(() -> eligibleAttemptPurge(f, attempt, provisional, NOW.plusSeconds(10000)))).isFalse();
        assertThat(snapshot()).isEqualTo(before);
    }

    @ParameterizedTest
    @ValueSource(strings = {"CHECK", "FK", "UNIQUE", "ROLLBACK"})
    void t7FailureWithReverseInputLeavesAllPersistedStateUnchanged(String failure) throws Exception {
        Fixture f = orderedFixture();
        UUID attempt = attempt(f);
        List<String> before = snapshot();
        List<List<UUID>> traces = new java.util.concurrent.CopyOnWriteArrayList<>();
        CountDownLatch mutated = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger pid = new AtomicInteger();
        Supplier<String> failing = () -> {
            try {
                return tx(() -> {
                    traces.add(lockSubjects(List.of(B, A)));
                    guard(f);
                    jdbc.update("UPDATE " + q("subject_sessions") + " SET credential_generation=1,secret_verifier=? WHERE id=?", verifier(), f.session());
                    jdbc.update("UPDATE " + q("browser_context_channels") + " SET epoch=2,pending_attempt_id=NULL WHERE id=?", f.channel());
                    jdbc.update("UPDATE " + q("subject_recovery_attempts") + " SET invalidated_at=? WHERE id=?", at(NOW.plusSeconds(1)), attempt);
                    jdbc.update("UPDATE " + q("subject_recovery_credentials") + " SET consumed_at=? WHERE id=?", at(NOW.plusSeconds(1)), f.code());
                    UUID newSlot = slot(f.channel(), "SUBJECT", f.session(), 1, 2);
                    jdbc.update("UPDATE " + q("browser_context_channels") + " SET current_slot_id=? WHERE id=?", newSlot, f.channel());
                    mutated.countDown();
                    await(release);
                    switch (failure) {
                        case "CHECK" -> jdbc.update("UPDATE " + q("browser_context_channels") + " SET epoch=-1 WHERE id=?", f.channel());
                        case "FK" -> jdbc.update("UPDATE " + q("browser_context_channels") + " SET current_slot_id=? WHERE id=?", UUID.randomUUID(), f.channel());
                        case "UNIQUE" -> insert("browser_context_roots", values("id", f.root(), "created_at", at(NOW)));
                        case "ROLLBACK" -> throw new FixtureRollback();
                        default -> throw new AssertionError();
                    }
                    return "UNEXPECTED";
                });
            } catch (FixtureRollback expected) {
                return "ROLLBACK";
            } catch (RuntimeException expected) {
                return sqlState(expected);
            }
        };
        try (var executor = Executors.newFixedThreadPool(2)) {
            try {
                var first = executor.submit(failing::get);
                await(mutated);
                var second = executor.submit(() -> tx(() -> {
                    pid.set(jdbc.queryForObject("SELECT pg_backend_pid()", Integer.class));
                    traces.add(lockSubjects(List.of(A, B)));
                    return "READ";
                }));
                waitForLock(pid);
                release.countDown();
                String expected = switch (failure) { case "CHECK" -> "23514"; case "FK" -> "23503"; case "UNIQUE" -> "23505"; default -> "ROLLBACK"; };
                assertThat(first.get(10, TimeUnit.SECONDS)).isEqualTo(expected);
                assertThat(second.get(10, TimeUnit.SECONDS)).isEqualTo("READ");
            } finally { release.countDown(); }
        }
        assertThat(traces).containsExactly(List.of(A, B), List.of(A, B));
        assertThat(snapshot()).isEqualTo(before);
    }

    @Test
    void t7LockTimeoutRollsBackPrivateFixtureInsert() throws Exception {
        Fixture f = orderedFixture();
        long before = count("anonymous_subjects");
        CountDownLatch locked = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            try {
                var first = executor.submit(() -> tx(() -> { lockSubjects(List.of(B, A)); locked.countDown(); await(release); return true; }));
                await(locked);
                var second = executor.submit(() -> {
                    try {
                        tx(() -> {
                            subject("PENDING", 0);
                            jdbc.execute("SET LOCAL lock_timeout='150ms'");
                            lockSubjects(List.of(A, B));
                            return null;
                        });
                        return "UNEXPECTED";
                    } catch (RuntimeException failure) { return sqlState(failure); }
                });
                assertThat(second.get(10, TimeUnit.SECONDS)).isEqualTo("55P03");
                release.countDown();
                assertThat(first.get(10, TimeUnit.SECONDS)).isTrue();
                assertThat(count("anonymous_subjects")).isEqualTo(before);
                assertThat(f.subject()).isEqualTo(A);
            } finally { release.countDown(); }
        }
    }

    @Test
    void t7InjectedOppositeLocksRollbackTheDatabaseDeadlockVictim() throws Exception {
        orderedFixture();
        CountDownLatch both = new CountDownLatch(2);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> deadlockContender(A, B, both));
            var second = executor.submit(() -> deadlockContender(B, A, both));
            assertThat(List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder("COMMITTED", "40P01");
        }
        assertThat(scalar("anonymous_subjects", "recovery_generation", A)
                + scalar("anonymous_subjects", "recovery_generation", B)).isEqualTo(3);
    }

    private String deadlockContender(UUID first, UUID second, CountDownLatch both) {
        try {
            tx(() -> {
                // Fault injection intentionally violates the production order; normal callers sort before locking.
                subjects.findForUpdateById(first).orElseThrow();
                jdbc.update("UPDATE " + q("anonymous_subjects") + " SET recovery_generation=2 WHERE id=?", first);
                both.countDown(); await(both);
                subjects.findForUpdateById(second).orElseThrow();
                return null;
            });
            return "COMMITTED";
        } catch (RuntimeException failure) { return sqlState(failure); }
    }

    private boolean counterWriter(Fixture f, String kind, List<UUID> input, List<List<UUID>> traces) {
        traces.add(lockSubjects(input));
        guard(f);
        long actual = switch (kind) {
            case "EPOCH" -> channels.findForUpdateById(f.channel()).orElseThrow().getEpoch();
            case "SESSION" -> sessions.findForUpdateById(f.session()).orElseThrow().getCredentialGeneration();
            case "RECOVERY" -> subjects.findForUpdateById(f.subject()).orElseThrow().getRecoveryGeneration();
            default -> throw new IllegalArgumentException();
        };
        long expected = kind.equals("SESSION") ? 0 : 1;
        if (actual != expected) throw new CounterConflict();
        long next = IdentityStateRules.nextCounter(actual, expected);
        switch (kind) {
            case "EPOCH" -> jdbc.update("UPDATE " + q("browser_context_channels") + " SET epoch=? WHERE id=?", next, f.channel());
            case "SESSION" -> {
                jdbc.update("UPDATE " + q("subject_sessions") + " SET credential_generation=?,selector=?,secret_verifier=? WHERE id=?", next, UUID.randomUUID().toString(), verifier(), f.session());
                jdbc.update("UPDATE " + q("browser_cookie_slots") + " SET terminal_at=? WHERE id=?", at(NOW.plusSeconds(1)), f.slot());
                UUID newSlot = slot(f.channel(), "SUBJECT", f.session(), next, 2);
                jdbc.update("UPDATE " + q("browser_context_channels") + " SET epoch=2,current_slot_id=? WHERE id=?", newSlot, f.channel());
            }
            case "RECOVERY" -> {
                jdbc.update("UPDATE " + q("subject_recovery_credentials") + " SET consumed_at=? WHERE id=?", at(NOW.plusSeconds(1)), f.code());
                credential(f.subject(), next);
                jdbc.update("UPDATE " + q("anonymous_subjects") + " SET recovery_generation=? WHERE id=?", next, f.subject());
            }
            default -> throw new IllegalArgumentException();
        }
        return true;
    }

    private boolean eligibleAttemptPurge(Fixture f, UUID attempt, UUID provisional, Instant cutoff) {
        guard(f);
        boolean eligible = jdbc.queryForObject("SELECT EXISTS (SELECT 1"
                + " FROM " + q("subject_recovery_attempts") + " a JOIN " + q("browser_context_channels")
                + " c ON c.id=a.context_channel_id JOIN " + q("browser_cookie_slots") + " s ON s.attempt_id=a.id"
                + " WHERE a.id=? AND s.id=? AND a.context_channel_id=? AND a.subject_id=?"
                + " AND s.kind='PROVISIONAL' AND s.purpose='SUBJECT'"
                + " AND c.pending_attempt_id IS DISTINCT FROM a.id"
                + " AND c.current_slot_id IS DISTINCT FROM s.id AND s.terminal_at IS NOT NULL"
                + " AND s.cookie_expires_at<=? AND a.consumed_at IS NOT NULL AND a.receipt_expires_at<=?)",
                Boolean.class, attempt, provisional, f.channel(), f.subject(), at(cutoff), at(cutoff));
        if (eligible) {
            jdbc.update("DELETE FROM " + q("browser_cookie_slots") + " WHERE id=?", provisional);
            jdbc.update("DELETE FROM " + q("subject_recovery_attempts") + " WHERE id=?", attempt);
        }
        return eligible;
    }

    private void insertContender(String kind, Fixture f, UUID newRoot) {
        switch (kind) {
            case "CHANNEL" -> channel(newRoot, "SUBJECT");
            case "CODE" -> credential(f.subject(), 2);
            case "SLOT" -> slot(f.channel(), "SUBJECT", f.session(), 1, 2);
            default -> throw new IllegalArgumentException();
        }
    }

    private UUID insertRootOnce(UUID id, Instant created) {
        jdbc.update("INSERT INTO " + q("browser_context_roots") + " (id,created_at) VALUES (?,?) ON CONFLICT DO NOTHING", id, at(created));
        return jdbc.queryForObject("SELECT id FROM " + q("browser_context_roots") + " WHERE id=?", UUID.class, id);
    }

    private Fixture orderedFixture() {
        insert("anonymous_subjects", values("id", A, "status", "ACTIVE", "recovery_generation", 1L, "created_at", at(NOW)));
        insert("anonymous_subjects", values("id", B, "status", "ACTIVE", "recovery_generation", 1L, "created_at", at(NOW)));
        UUID root = root(); UUID channel = channel(root, "SUBJECT"); UUID session = session(A, channel); UUID code = credential(A, 1);
        UUID slot = slot(channel, "SUBJECT", session, 0, 1);
        jdbc.update("UPDATE " + q("browser_context_channels") + " SET current_slot_id=? WHERE id=?", slot, channel);
        return new Fixture(root, A, channel, session, code, slot);
    }

    private List<UUID> lockSubjects(List<UUID> input) {
        List<UUID> trace = new ArrayList<>();
        input.stream().distinct().sorted(IdentityStateRules.UUID_ORDER).forEach(id -> {
            trace.add(subjects.findForUpdateById(id).orElseThrow().getId());
        });
        return trace;
    }

    private void guard(Fixture f) {
        subjects.findForUpdateById(f.subject()).orElseThrow();
        channels.findForUpdateById(f.channel()).orElseThrow();
    }

    private <T> List<T> guardedRace(Fixture f, Supplier<T> firstBody, Supplier<T> secondBody) throws Exception {
        return guardedRace(f, firstBody, secondBody, failure -> { throw failure; });
    }

    private <T> List<T> guardedRace(Fixture f, Supplier<T> firstBody, Supplier<T> secondBody,
            java.util.function.Function<RuntimeException, T> failureHandler) throws Exception {
        CountDownLatch locked = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger pid = new AtomicInteger();
        try (var executor = Executors.newFixedThreadPool(2)) {
            try {
                var first = executor.submit(() -> outcome(() -> {
                    if (f != null) guard(f);
                    T value = firstBody.get();
                    locked.countDown(); await(release);
                    return value;
                }, failureHandler));
                await(locked);
                var second = executor.submit(() -> outcome(() -> {
                    pid.set(jdbc.queryForObject("SELECT pg_backend_pid()", Integer.class));
                    if (f != null) guard(f);
                    return secondBody.get();
                }, failureHandler));
                waitForLock(pid);
                release.countDown();
                return List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS));
            } finally { release.countDown(); }
        }
    }

    private <T> T outcome(Supplier<T> body, java.util.function.Function<RuntimeException, T> failureHandler) {
        try { return tx(body); }
        catch (RuntimeException failure) { return failureHandler.apply(failure); }
    }

    private void waitForLock(AtomicInteger pid) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < deadline) {
            if (pid.get() != 0 && Boolean.TRUE.equals(jdbc.queryForObject(
                    "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE pid=? AND wait_event_type='Lock'"
                    + " AND cardinality(pg_blocking_pids(pid))>0)", Boolean.class, pid.get()))) return;
            Thread.sleep(5);
        }
        throw new AssertionError("Contender never reached the expected PostgreSQL lock wait.");
    }

    private long scalar(String table, String column, UUID id) {
        return jdbc.queryForObject("SELECT " + column + " FROM " + q(table) + " WHERE id=?", Long.class, id);
    }

    private long count(String table) { return jdbc.queryForObject("SELECT count(*) FROM " + q(table), Long.class); }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) throw new AssertionError("Fixture barrier timed out.");
        } catch (InterruptedException failure) {
            Thread.currentThread().interrupt(); throw new AssertionError(failure);
        }
    }

    private static void assertThatThrownCounterConflict(long value, long expected) {
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> IdentityStateRules.nextCounter(value, expected))
                .isInstanceOf(IllegalStateException.class);
    }

    private static final class FixtureRollback extends RuntimeException { }
    private static final class CounterConflict extends RuntimeException { }
}
