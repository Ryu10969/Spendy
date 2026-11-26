package com.splitmate.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.test.util.ReflectionTestUtils;

import com.splitmate.identity.domain.AnonymousSubject;
import com.splitmate.identity.domain.BrowserContextChannel;
import com.splitmate.identity.domain.BrowserContextRoot;
import com.splitmate.identity.domain.BrowserCookieSlot;
import com.splitmate.identity.domain.ChannelState;
import com.splitmate.identity.domain.ContextPurpose;
import com.splitmate.identity.domain.CookieSlotKind;
import com.splitmate.identity.domain.RecoveryPurpose;
import com.splitmate.identity.domain.ShareSession;
import com.splitmate.identity.domain.SubjectRecoveryAttempt;
import com.splitmate.identity.domain.SubjectRecoveryCredential;
import com.splitmate.identity.domain.SubjectSession;
import com.splitmate.identity.domain.SubjectStatus;
import com.splitmate.identity.service.IdentityStateRules;

class IdentityStateRulesTests {
    private static final Instant CREATED = Instant.parse("2026-11-06T00:00:00Z");
    private static final Instant NOW = CREATED.plusSeconds(10);
    private AnonymousSubject subject;
    private BrowserContextChannel channel;
    private SubjectSession session;
    private BrowserCookieSlot slot;

    @BeforeEach
    void fixture() {
        subject = identified(new AnonymousSubject(SubjectStatus.ACTIVE, 1, CREATED));
        channel = identified(new BrowserContextChannel(new BrowserContextRoot(UUID.randomUUID(), CREATED),
                ContextPurpose.SUBJECT, CREATED));
        ReflectionTestUtils.setField(channel, "epoch", 1L);
        session = identified(new SubjectSession(subject, channel, "fixture", new byte[]{1}, 0,
                CREATED, CREATED.plusSeconds(100), CREATED.plusSeconds(200), null));
        slot = identified(new BrowserCookieSlot(channel, CookieSlotKind.SUBJECT, session, null, null,
                0, 1, CREATED, CREATED.plusSeconds(100)));
        ReflectionTestUtils.setField(channel, "currentSlot", slot);
    }

    @Test
    void acceptsOnlyCoherentCurrentStateWithoutGrantingAuthority() {
        assertThat(eligible()).isTrue();
        ReflectionTestUtils.setField(channel, "epoch", 2L);
        assertThat(IdentityStateRules.isCurrentSubjectSessionState(subject, session, channel, slot, 2L, NOW)).isTrue();
        assertThat(eligible()).isFalse();
        assertThat(IdentityStateRules.isCurrentSubjectSessionState(null, session, channel, slot, 2L, NOW)).isFalse();
        assertThat(IdentityStateRules.isCurrentSubjectSessionState(subject, null, channel, slot, 2L, NOW)).isFalse();
        assertThat(IdentityStateRules.isCurrentSubjectSessionState(subject, session, null, slot, 2L, NOW)).isFalse();
        assertThat(IdentityStateRules.isCurrentSubjectSessionState(subject, session, channel, null, 2L, NOW)).isFalse();
        assertThat(IdentityStateRules.isCurrentSubjectSessionState(subject, session, channel, slot, null, NOW)).isFalse();
        assertThat(IdentityStateRules.isCurrentSubjectSessionState(subject, session, channel, slot, 2L, null)).isFalse();
    }

    static Stream<Arguments> corruptStates() {
        return Stream.of(
                Arguments.of("subject", "status", SubjectStatus.PENDING),
                Arguments.of("subject", "status", SubjectStatus.DISABLED),
                Arguments.of("subject", "status", null),
                Arguments.of("subject", "recoveryGeneration", 0L),
                Arguments.of("subject", "recoveryGeneration", -1L),
                Arguments.of("subject", "id", null),
                Arguments.of("channel", "state", ChannelState.RETIRED),
                Arguments.of("channel", "state", null),
                Arguments.of("channel", "purpose", ContextPurpose.SHARE),
                Arguments.of("channel", "purpose", null),
                Arguments.of("channel", "epoch", -1L),
                Arguments.of("channel", "currentSlot", null),
                Arguments.of("channel", "root", null),
                Arguments.of("channel", "retiredAt", NOW),
                Arguments.of("session", "revokedAt", NOW),
                Arguments.of("session", "credentialGeneration", -1L),
                Arguments.of("session", "credentialGeneration", 1L),
                Arguments.of("session", "contextPurpose", ContextPurpose.SHARE),
                Arguments.of("session", "contextChannel", null),
                Arguments.of("session", "subject", null),
                Arguments.of("session", "idleExpiresAt", NOW),
                Arguments.of("session", "absoluteExpiresAt", NOW),
                Arguments.of("session", "idleExpiresAt", null),
                Arguments.of("session", "absoluteExpiresAt", Instant.MAX),
                Arguments.of("session", "createdAt", Instant.MIN),
                Arguments.of("session", "lastUsedAt", CREATED.minusSeconds(1)),
                Arguments.of("session", "selector", " "),
                Arguments.of("session", "secretVerifier", new byte[0]),
                Arguments.of("slot", "kind", CookieSlotKind.PROVISIONAL),
                Arguments.of("slot", "kind", null),
                Arguments.of("slot", "purpose", ContextPurpose.SHARE),
                Arguments.of("slot", "credentialGeneration", 1L),
                Arguments.of("slot", "issuedEpoch", 2L),
                Arguments.of("slot", "issuedEpoch", 0L),
                Arguments.of("slot", "terminalAt", NOW),
                Arguments.of("slot", "cookieExpiresAt", NOW),
                Arguments.of("slot", "contextChannel", null),
                Arguments.of("slot", "subjectSession", null));
    }

    @ParameterizedTest
    @MethodSource("corruptStates")
    void rejectsCorruptMissingExpiredRevokedAndUnknownState(String target, String field, Object value) {
        Object row = switch (target) {
            case "subject" -> subject;
            case "channel" -> channel;
            case "session" -> session;
            case "slot" -> slot;
            default -> throw new IllegalArgumentException();
        };
        ReflectionTestUtils.setField(row, field, value);
        assertThat(eligible()).isFalse();
    }

    @Test
    void pendingAndReceiptNeverBecomeCurrentSession() {
        var code = identified(new SubjectRecoveryCredential(subject, "code", new byte[]{2}, 1, CREATED));
        var attempt = identified(new SubjectRecoveryAttempt(subject, channel, RecoveryPurpose.ADD_DEVICE, 1,
                code, "provisional", new byte[]{3}, "pending", new byte[]{4}, UUID.randomUUID(),
                session, 0L, false, 1, CREATED, CREATED.plusSeconds(100)));
        ReflectionTestUtils.setField(channel, "pendingAttempt", attempt);
        assertThat(IdentityStateRules.isPendingAttemptState(attempt, channel, 1L, NOW)).isTrue();
        assertThat(eligible()).isTrue();
        var pending = identified(new BrowserCookieSlot(channel, CookieSlotKind.PROVISIONAL, null, null,
                attempt, 0, 1, CREATED, CREATED.plusSeconds(100)));
        ReflectionTestUtils.setField(channel, "currentSlot", pending);
        assertThat(IdentityStateRules.isCurrentSubjectSessionState(subject, session, channel, pending, 1L, NOW)).isFalse();
        ReflectionTestUtils.setField(attempt, "consumedAt", NOW);
        ReflectionTestUtils.setField(attempt, "receiptExpiresAt", CREATED.plusSeconds(200));
        assertThat(IdentityStateRules.isPendingAttemptState(attempt, channel, 1L, NOW)).isFalse();
        assertThat(IdentityStateRules.isPendingAttemptState(null, channel, 1L, NOW)).isFalse();
    }

    @Test
    void shareStateIsSeparateAndHasNoSubjectOrProjectRights() {
        var shareChannel = identified(new BrowserContextChannel(channel.getRoot(), ContextPurpose.SHARE, CREATED));
        ReflectionTestUtils.setField(shareChannel, "epoch", 1L);
        var share = identified(new ShareSession(shareChannel, "share", new byte[]{5}, 0,
                CREATED, CREATED.plusSeconds(100), CREATED.plusSeconds(200)));
        var shareSlot = identified(new BrowserCookieSlot(shareChannel, CookieSlotKind.SHARE, null, share, null,
                0, 1, CREATED, CREATED.plusSeconds(100)));
        ReflectionTestUtils.setField(shareChannel, "currentSlot", shareSlot);
        assertThat(IdentityStateRules.isCurrentShareSessionState(share, shareChannel, shareSlot, 1L, NOW)).isTrue();
        assertThat(IdentityStateRules.isCurrentSubjectSessionState(subject, session, shareChannel, shareSlot, 1L, NOW)).isFalse();
        ReflectionTestUtils.setField(share, "revokedAt", NOW);
        assertThat(IdentityStateRules.isCurrentShareSessionState(share, shareChannel, shareSlot, 1L, NOW)).isFalse();
    }

    @Test
    void secretVerifierArraysAreDefensivelyCopied() {
        byte[] input = {9};
        var stored = new SubjectRecoveryCredential(subject, "fixture", input, 1, CREATED);
        input[0] = 0;
        stored.getSecretVerifier()[0] = 0;
        assertThat(stored.getSecretVerifier()).containsExactly((byte) 9);
    }

    @Test
    void rejectsUnpersistedConsumedRevokedAndFutureRecoveryCredentialState() {
        var code = new SubjectRecoveryCredential(subject, "fixture-code", new byte[]{2}, 1, CREATED);
        assertThat(IdentityStateRules.isCurrentRecoveryCredentialState(subject, code, NOW)).isFalse();
        identified(code);
        assertThat(IdentityStateRules.isCurrentRecoveryCredentialState(subject, code, NOW)).isTrue();
        ReflectionTestUtils.setField(code, "consumedAt", NOW);
        assertThat(IdentityStateRules.isCurrentRecoveryCredentialState(subject, code, NOW)).isFalse();
        ReflectionTestUtils.setField(code, "consumedAt", null);
        ReflectionTestUtils.setField(code, "revokedAt", NOW);
        assertThat(IdentityStateRules.isCurrentRecoveryCredentialState(subject, code, NOW)).isFalse();
        ReflectionTestUtils.setField(code, "revokedAt", null);
        ReflectionTestUtils.setField(code, "activatedAt", NOW.plusSeconds(1));
        assertThat(IdentityStateRules.isCurrentRecoveryCredentialState(subject, code, NOW)).isFalse();
    }

    @Test
    void bootstrapPendingStateRejectsZeroExpectedContextEpoch() {
        var pendingSubject = identified(new AnonymousSubject(SubjectStatus.PENDING, 0, CREATED));
        ReflectionTestUtils.setField(channel, "currentSlot", null);
        var attempt = identified(new SubjectRecoveryAttempt(pendingSubject, channel, RecoveryPurpose.BOOTSTRAP,
                0, null, "provisional", new byte[]{1}, "pending", new byte[]{2}, UUID.randomUUID(),
                null, null, false, 1, CREATED, CREATED.plusSeconds(100)));
        ReflectionTestUtils.setField(channel, "pendingAttempt", attempt);
        assertThat(IdentityStateRules.isPendingAttemptState(attempt, channel, 1L, NOW)).isTrue();
        ReflectionTestUtils.setField(channel, "epoch", 0L);
        ReflectionTestUtils.setField(attempt, "expectedContextEpoch", 0L);
        assertThat(IdentityStateRules.isPendingAttemptState(attempt, channel, 0L, NOW)).isFalse();
    }

    @Test
    void countersRejectMissingNegativeStaleOverflowAndReset() {
        assertThat(IdentityStateRules.nextCounter(0L, 0L)).isEqualTo(1);
        assertThat(IdentityStateRules.nextCounter(Long.MAX_VALUE - 1, Long.MAX_VALUE - 1)).isEqualTo(Long.MAX_VALUE);
        for (Long[] pair : new Long[][]{{null, 0L}, {0L, null}, {-1L, -1L}, {0L, -1L}}) {
            assertThatThrownBy(() -> IdentityStateRules.nextCounter(pair[0], pair[1])).isInstanceOf(IllegalArgumentException.class);
        }
        for (long[] pair : new long[][]{{1, 0}, {0, 1}, {Long.MAX_VALUE, Long.MAX_VALUE}}) {
            assertThatThrownBy(() -> IdentityStateRules.nextCounter(pair[0], pair[1])).isInstanceOf(IllegalStateException.class);
        }
    }

    @Test
    void unsignedUuidOrderMatchesIndependentByteComparisonIncludingBothSignBoundaries() {
        UUID a = UUID.fromString("7fffffff-ffff-4fff-8000-000000000000");
        UUID b = UUID.fromString("80000000-0000-4000-8000-000000000000");
        assertThat(a.compareTo(b)).isPositive();
        assertThat(IdentityStateRules.UUID_ORDER.compare(a, b)).isNegative();
        var ids = new ArrayList<>(List.of(a, b,
                UUID.fromString("7fffffff-ffff-4fff-7fff-ffffffffffff")));
        var random = new java.util.Random(17);
        for (int i = 0; i < 100; i++) {
            ids.add(new UUID(random.nextLong(), random.nextLong()));
        }
        List<UUID> independent = ids.stream().sorted((left, right) -> {
            String l = left.toString().replace("-", "");
            String r = right.toString().replace("-", "");
            return l.compareTo(r);
        }).toList();
        assertThat(ids.stream().sorted(IdentityStateRules.UUID_ORDER).toList()).isEqualTo(independent);
        assertThatThrownBy(() -> IdentityStateRules.UUID_ORDER.compare(null, a)).isInstanceOf(NullPointerException.class);
    }

    private boolean eligible() {
        return IdentityStateRules.isCurrentSubjectSessionState(subject, session, channel, slot, 1L, NOW);
    }

    private static <T> T identified(T entity) {
        ReflectionTestUtils.setField(entity, "id", UUID.randomUUID());
        return entity;
    }
}
