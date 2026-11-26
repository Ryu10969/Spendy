package com.splitmate.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.util.ReflectionTestUtils;

import com.splitmate.identity.domain.AnonymousSubject;
import com.splitmate.identity.domain.BrowserContextChannel;
import com.splitmate.identity.domain.BrowserContextRoot;
import com.splitmate.identity.domain.BrowserCookieSlot;
import com.splitmate.identity.domain.ContextPurpose;
import com.splitmate.identity.domain.CookieSlotKind;
import com.splitmate.identity.domain.RecoveryPurpose;
import com.splitmate.identity.domain.ShareSession;
import com.splitmate.identity.domain.SubjectRecoveryAttempt;
import com.splitmate.identity.domain.SubjectRecoveryCredential;
import com.splitmate.identity.domain.SubjectSession;
import com.splitmate.identity.domain.SubjectStatus;
import com.splitmate.identity.repository.AnonymousSubjectRepository;
import com.splitmate.identity.repository.BrowserContextRootRepository;
import com.splitmate.identity.repository.BrowserContextChannelRepository;
import com.splitmate.identity.repository.SubjectSessionRepository;
import com.splitmate.identity.repository.ShareSessionRepository;
import com.splitmate.identity.repository.SubjectRecoveryCredentialRepository;
import com.splitmate.identity.repository.SubjectRecoveryAttemptRepository;
import com.splitmate.identity.repository.BrowserCookieSlotRepository;
import com.splitmate.identity.service.IdentityStateRules;

import jakarta.persistence.EntityManager;

class IdentityStateIntegrationTests extends IdentityPostgresTestSupport {
    @Autowired AnonymousSubjectRepository subjects;
    @Autowired BrowserContextRootRepository roots;
    @Autowired BrowserContextChannelRepository channels;
    @Autowired SubjectSessionRepository sessions;
    @Autowired ShareSessionRepository shares;
    @Autowired SubjectRecoveryCredentialRepository credentials;
    @Autowired SubjectRecoveryAttemptRepository attempts;
    @Autowired BrowserCookieSlotRepository slots;
    @Autowired EntityManager entityManager;

    @Test
    void t5MapsAllEightEntitiesAndLocksWithoutMakingAnAuthenticationProvider() {
        tx(() -> {
            var root = roots.saveAndFlush(new BrowserContextRoot(UUID.randomUUID(), NOW));
            var subject = subjects.saveAndFlush(new AnonymousSubject(SubjectStatus.ACTIVE, 1, NOW));
            var channel = channels.saveAndFlush(new BrowserContextChannel(root, ContextPurpose.SUBJECT, NOW));
            var session = sessions.saveAndFlush(new SubjectSession(subject, channel, "subject-fixture", new byte[]{1},
                    0, NOW, NOW.plusSeconds(100), NOW.plusSeconds(200), "fictional device"));
            var shareChannel = channels.saveAndFlush(new BrowserContextChannel(root, ContextPurpose.SHARE, NOW));
            var share = shares.saveAndFlush(new ShareSession(shareChannel, "share-fixture", new byte[]{2},
                    0, NOW, NOW.plusSeconds(100), NOW.plusSeconds(200)));
            var code = credentials.saveAndFlush(new SubjectRecoveryCredential(subject, "code-fixture", new byte[]{3}, 1, NOW));
            var attempt = attempts.saveAndFlush(new SubjectRecoveryAttempt(subject, channel, RecoveryPurpose.ADD_DEVICE,
                    1, code, "provisional-fixture", new byte[]{4}, "pending-fixture", new byte[]{5}, UUID.randomUUID(),
                    session, 0L, false, 1, NOW, NOW.plusSeconds(60)));
            var slot = slots.saveAndFlush(new BrowserCookieSlot(channel, CookieSlotKind.SUBJECT, session, null, null,
                    0, 1, NOW, NOW.plusSeconds(100)));
            entityManager.clear();
            assertThat(roots.findForUpdateById(root.getId()).orElseThrow().getCreatedAt()).isEqualTo(NOW);
            assertThat(subjects.findForUpdateById(subject.getId()).orElseThrow().getStatus()).isEqualTo(SubjectStatus.ACTIVE);
            assertThat(channels.findForUpdateById(channel.getId()).orElseThrow().getPurpose()).isEqualTo(ContextPurpose.SUBJECT);
            assertThat(credentials.findForUpdateById(code.getId()).orElseThrow().getSecretVerifier()).containsExactly((byte) 3);
            assertThat(attempts.findForUpdateById(attempt.getId()).orElseThrow().getOperationId()).isEqualTo(attempt.getOperationId());
            assertThat(sessions.findForUpdateById(session.getId()).orElseThrow().getDeviceLabel()).isEqualTo("fictional device");
            assertThat(shares.findForUpdateById(share.getId()).orElseThrow().getContextPurpose()).isEqualTo(ContextPurpose.SHARE);
            assertThat(slots.findForUpdateById(slot.getId()).orElseThrow().getSubjectSession().getId()).isEqualTo(session.getId());
            return null;
        });
    }

    @Test
    void t5DoesNotPersistChangesToImmutableJpaFields() {
        Fixture f = fixture();
        tx(() -> {
            var slot = slots.findById(f.slot()).orElseThrow();
            var session = sessions.findById(f.session()).orElseThrow();
            ReflectionTestUtils.setField(slot, "credentialGeneration", 99L);
            ReflectionTestUtils.setField(slot, "cookieExpiresAt", NOW.plusSeconds(1));
            ReflectionTestUtils.setField(session, "absoluteExpiresAt", NOW.plusSeconds(99999));
            entityManager.flush();
            entityManager.clear();
            assertThat(slots.findById(f.slot()).orElseThrow().getCredentialGeneration()).isZero();
            assertThat(slots.findById(f.slot()).orElseThrow().getCookieExpiresAt()).isEqualTo(NOW.plusSeconds(3600));
            assertThat(sessions.findById(f.session()).orElseThrow().getAbsoluteExpiresAt()).isEqualTo(NOW.plusSeconds(7200));
            return null;
        });
    }

    @ParameterizedTest
    @CsvSource({"PENDING,0", "DISABLED,0", "DISABLED,1"})
    void t5PendingAndDisabledStoredSubjectsNeverQualify(String status, long generation) {
        Fixture f = fixture();
        jdbc.update("UPDATE " + q("anonymous_subjects") + " SET status=?,recovery_generation=? WHERE id=?", status, generation, f.subject());
        assertThat(subjectState(f, NOW.plusSeconds(10))).isFalse();
    }

    @ParameterizedTest
    @CsvSource({"subject_sessions,idle_expires_at", "subject_sessions,absolute_expires_at",
            "browser_cookie_slots,cookie_expires_at"})
    void t5DeadlineEqualityIsExpired(String table, String column) {
        Fixture f = fixture();
        UUID id = table.equals("subject_sessions") ? f.session() : f.slot();
        if (column.equals("absolute_expires_at")) {
            jdbc.update("UPDATE " + q("subject_sessions") + " SET idle_expires_at=? WHERE id=?", at(NOW.plusSeconds(10)), id);
            jdbc.update("UPDATE " + q("browser_cookie_slots") + " SET cookie_expires_at=? WHERE id=?", at(NOW.plusSeconds(10)), f.slot());
        }
        jdbc.update("UPDATE " + q(table) + " SET " + column + "=? WHERE id=?", at(NOW.plusSeconds(10)), id);
        assertThat(subjectState(f, NOW.plusSeconds(9))).isTrue();
        assertThat(subjectState(f, NOW.plusSeconds(10))).isFalse();
        assertThat(subjectState(f, NOW.plusSeconds(11))).isFalse();
    }

    @Test
    void t5MissingCurrentOldSlotRevokedAndMismatchedGenerationNeverFallback() {
        Fixture f = fixture();
        assertThat(subjectState(f, NOW.plusSeconds(10))).isTrue();
        jdbc.update("UPDATE " + q("browser_context_channels") + " SET current_slot_id=NULL WHERE id=?", f.channel());
        assertThat(subjectState(f, NOW.plusSeconds(10))).isFalse();
        jdbc.update("UPDATE " + q("browser_context_channels") + " SET current_slot_id=? WHERE id=?", f.slot(), f.channel());
        jdbc.update("UPDATE " + q("subject_sessions") + " SET credential_generation=1 WHERE id=?", f.session());
        assertThat(subjectState(f, NOW.plusSeconds(10))).isFalse();
        jdbc.update("UPDATE " + q("subject_sessions") + " SET credential_generation=0,revoked_at=? WHERE id=?", at(NOW.plusSeconds(1)), f.session());
        assertThat(subjectState(f, NOW.plusSeconds(10))).isFalse();
        jdbc.update("UPDATE " + q("subject_sessions") + " SET revoked_at=NULL WHERE id=?", f.session());
        jdbc.update("UPDATE " + q("browser_cookie_slots") + " SET terminal_at=? WHERE id=?", at(NOW.plusSeconds(1)), f.slot());
        assertThat(subjectState(f, NOW.plusSeconds(10))).isFalse();
    }

    @Test
    void t5PendingExpiryAndConsumedReceiptCannotServeAsSession() {
        Fixture f = fixture();
        UUID attempt = attempt(f);
        UUID provisional = slot(f.channel(), "PROVISIONAL", attempt, 0, 1);
        jdbc.update("UPDATE " + q("subject_recovery_attempts") + " SET expires_at=? WHERE id=?", at(NOW.plusSeconds(10)), attempt);
        for (int seconds : List.of(9, 10, 11)) {
            assertThat(tx(() -> IdentityStateRules.isPendingAttemptState(attempts.findById(attempt).orElseThrow(),
                    channels.findById(f.channel()).orElseThrow(), 1L, NOW.plusSeconds(seconds))))
                    .isEqualTo(seconds < 10);
        }
        Completion result = complete(f, attempt);
        tx(() -> {
            var channel = channels.findById(f.channel()).orElseThrow();
            var subject = subjects.findById(f.subject()).orElseThrow();
            assertThat(IdentityStateRules.isPendingAttemptState(attempts.findById(attempt).orElseThrow(), channel, 2L, NOW.plusSeconds(10))).isFalse();
            assertThat(IdentityStateRules.isCurrentSubjectSessionState(subject, sessions.findById(result.session()).orElseThrow(),
                    channel, slots.findById(provisional).orElseThrow(), 2L, NOW.plusSeconds(10))).isFalse();
            assertThat(IdentityStateRules.isCurrentSubjectSessionState(subject, sessions.findById(result.session()).orElseThrow(),
                    channel, slots.findById(result.slot()).orElseThrow(), 2L, NOW.plusSeconds(10))).isTrue();
            return null;
        });
    }

    boolean subjectState(Fixture f, Instant now) {
        return tx(() -> IdentityStateRules.isCurrentSubjectSessionState(subjects.findById(f.subject()).orElseThrow(),
                sessions.findById(f.session()).orElseThrow(), channels.findById(f.channel()).orElseThrow(),
                slots.findById(f.slot()).orElseThrow(), 1L, now));
    }
}
