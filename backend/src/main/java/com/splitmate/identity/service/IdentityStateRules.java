package com.splitmate.identity.service;

import java.time.Instant;
import java.util.Comparator;
import java.util.Objects;
import java.util.UUID;

import com.splitmate.identity.domain.AnonymousSubject;
import com.splitmate.identity.domain.BrowserContextChannel;
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

/** Persistence-state checks only: no credential verification or Project authority. */
public final class IdentityStateRules {

    public static final Comparator<UUID> UUID_ORDER = (left, right) -> {
        Objects.requireNonNull(left);
        Objects.requireNonNull(right);
        int most = Long.compareUnsigned(left.getMostSignificantBits(), right.getMostSignificantBits());
        return most != 0 ? most : Long.compareUnsigned(left.getLeastSignificantBits(), right.getLeastSignificantBits());
    };

    private IdentityStateRules() {
    }

    public static long nextCounter(Long current, Long expected) {
        if (current == null || expected == null || current < 0 || expected < 0) {
            throw new IllegalArgumentException("Counter and expected value must be nonnegative.");
        }
        if (!current.equals(expected) || current == Long.MAX_VALUE) {
            throw new IllegalStateException("Counter conflict or overflow.");
        }
        return current + 1;
    }

    public static boolean isCurrentSubjectSessionState(
            AnonymousSubject subject, SubjectSession session, BrowserContextChannel channel,
            BrowserCookieSlot slot, Long expectedEpoch, Instant now
    ) {
        return activeSubject(subject, now) && session != null
                && sameId(subject.getId(), session.getSubject() == null ? null : session.getSubject().getId())
                && session.getContextPurpose() == ContextPurpose.SUBJECT
                && sameChannel(channel, session.getContextChannel())
                && session.getCredentialGeneration() >= 0 && session.getRevokedAt() == null
                && storedCredential(session.getSelector(), session.getSecretVerifier())
                && sessionTimes(session.getCreatedAt(), session.getLastUsedAt(),
                        session.getIdleExpiresAt(), session.getAbsoluteExpiresAt(), now)
                && currentSlot(channel, slot, ContextPurpose.SUBJECT, CookieSlotKind.SUBJECT, expectedEpoch, now)
                && slot.getSubjectSession() != null
                && sameId(slot.getSubjectSession().getId(), session.getId())
                && slot.getShareSession() == null && slot.getAttempt() == null
                && slot.getCredentialGeneration() == session.getCredentialGeneration()
                && !slot.getCookieExpiresAt().isAfter(session.getAbsoluteExpiresAt());
    }

    public static boolean isCurrentShareSessionState(
            ShareSession session, BrowserContextChannel channel, BrowserCookieSlot slot,
            Long expectedEpoch, Instant now
    ) {
        return session != null && session.getContextPurpose() == ContextPurpose.SHARE
                && sameChannel(channel, session.getContextChannel())
                && session.getCredentialGeneration() >= 0 && session.getRevokedAt() == null
                && storedCredential(session.getSelector(), session.getSecretVerifier())
                && sessionTimes(session.getCreatedAt(), session.getLastUsedAt(),
                        session.getIdleExpiresAt(), session.getAbsoluteExpiresAt(), now)
                && currentSlot(channel, slot, ContextPurpose.SHARE, CookieSlotKind.SHARE, expectedEpoch, now)
                && slot.getShareSession() != null && sameId(slot.getShareSession().getId(), session.getId())
                && slot.getSubjectSession() == null && slot.getAttempt() == null
                && slot.getCredentialGeneration() == session.getCredentialGeneration()
                && !slot.getCookieExpiresAt().isAfter(session.getAbsoluteExpiresAt());
    }

    public static boolean isCurrentRecoveryCredentialState(
            AnonymousSubject subject, SubjectRecoveryCredential credential, Instant now
    ) {
        return activeSubject(subject, now) && credential != null && credential.getId() != null && credential.getSubject() != null
                && sameId(subject.getId(), credential.getSubject().getId())
                && credential.getGeneration() >= 1 && credential.getGeneration() == subject.getRecoveryGeneration()
                && credential.getConsumedAt() == null && credential.getRevokedAt() == null
                && finite(credential.getActivatedAt()) && !credential.getActivatedAt().isAfter(now)
                && storedCredential(credential.getSelector(), credential.getSecretVerifier());
    }

    /** Pending/receipt state is never accepted by either current-session check. */
    public static boolean isPendingAttemptState(
            SubjectRecoveryAttempt attempt, BrowserContextChannel channel, Long expectedEpoch, Instant now
    ) {
        if (attempt == null || !openChannel(channel, ContextPurpose.SUBJECT, expectedEpoch, now)
                || !sameChannel(channel, attempt.getContextChannel())
                || attempt.getContextPurpose() != ContextPurpose.SUBJECT
                || channel.getPendingAttempt() == null
                || !sameId(attempt.getId(), channel.getPendingAttempt().getId())
                || attempt.getExpectedContextEpoch() <= 0
                || attempt.getExpectedContextEpoch() != channel.getEpoch()
                || attempt.getConsumedAt() != null || attempt.getInvalidatedAt() != null
                || attempt.getResultSession() != null || attempt.getResultSlot() != null
                || attempt.getResultSessionGeneration() != null || attempt.getResultContextEpoch() != null
                || attempt.getReceiptExpiresAt() != null || attempt.getFailedConfirmations() < 0
                || attempt.getOperationId() == null || attempt.getPurpose() == null
                || !liveInterval(attempt.getCreatedAt(), attempt.getExpiresAt(), now)
                || !storedCredential(attempt.getProvisionalSelector(), attempt.getProvisionalVerifier())
                || !storedCredential(attempt.getPendingSelector(), attempt.getPendingVerifier())) {
            return false;
        }
        AnonymousSubject subject = attempt.getSubject();
        if (subject == null || subject.getId() == null || !finite(subject.getCreatedAt())
                || subject.getCreatedAt().isAfter(now)) {
            return false;
        }
        if (attempt.getPurpose() == RecoveryPurpose.BOOTSTRAP) {
            return subject.getStatus() == SubjectStatus.PENDING && subject.getRecoveryGeneration() == 0
                    && attempt.getExpectedGeneration() == 0 && attempt.getCurrentCredential() == null
                    && channel.getCurrentSlot() == null && attempt.getInitiatingSession() == null
                    && attempt.getInitiatingSessionGeneration() == null && !attempt.isSwitchIntent();
        }
        if (attempt.getPurpose() != RecoveryPurpose.ADD_DEVICE && attempt.getPurpose() != RecoveryPurpose.RECOVER
                && attempt.getPurpose() != RecoveryPurpose.REPLACE_CODE) {
            return false;
        }
        if (attempt.getExpectedGeneration() != subject.getRecoveryGeneration()
                || !isCurrentRecoveryCredentialState(subject, attempt.getCurrentCredential(), now)) {
            return false;
        }
        SubjectSession initiating = attempt.getInitiatingSession();
        if (initiating == null) {
            return attempt.getInitiatingSessionGeneration() == null && channel.getCurrentSlot() == null
                    && !attempt.isSwitchIntent() && attempt.getPurpose() != RecoveryPurpose.REPLACE_CODE;
        }
        boolean sameSubject = initiating.getSubject() != null
                && sameId(initiating.getSubject().getId(), subject.getId());
        return attempt.getInitiatingSessionGeneration() != null
                && attempt.getInitiatingSessionGeneration() == initiating.getCredentialGeneration()
                && isCurrentSubjectSessionState(initiating.getSubject(), initiating, channel,
                        channel.getCurrentSlot(), expectedEpoch, now)
                && (sameSubject || attempt.isSwitchIntent())
                && (attempt.getPurpose() != RecoveryPurpose.REPLACE_CODE || sameSubject);
    }

    private static boolean activeSubject(AnonymousSubject subject, Instant now) {
        return subject != null && subject.getId() != null && subject.getStatus() == SubjectStatus.ACTIVE
                && subject.getRecoveryGeneration() >= 1 && finite(now) && finite(subject.getCreatedAt())
                && !subject.getCreatedAt().isAfter(now);
    }

    private static boolean currentSlot(
            BrowserContextChannel channel, BrowserCookieSlot slot, ContextPurpose purpose,
            CookieSlotKind kind, Long expectedEpoch, Instant now
    ) {
        return openChannel(channel, purpose, expectedEpoch, now) && slot != null
                && channel.getCurrentSlot() != null && sameId(channel.getCurrentSlot().getId(), slot.getId())
                && sameChannel(channel, slot.getContextChannel()) && slot.getPurpose() == purpose
                && slot.getKind() == kind && slot.getTerminalAt() == null
                && slot.getIssuedEpoch() > 0 && slot.getIssuedEpoch() <= channel.getEpoch()
                && liveInterval(slot.getCreatedAt(), slot.getCookieExpiresAt(), now);
    }

    private static boolean openChannel(
            BrowserContextChannel channel, ContextPurpose purpose, Long expectedEpoch, Instant now
    ) {
        return channel != null && channel.getId() != null && channel.getRoot() != null
                && channel.getRoot().getId() != null && channel.getPurpose() == purpose
                && channel.getState() == ChannelState.OPEN && channel.getRetiredAt() == null
                && expectedEpoch != null && expectedEpoch >= 0 && channel.getEpoch() == expectedEpoch
                && finite(now) && finite(channel.getCreatedAt()) && !channel.getCreatedAt().isAfter(now)
                && finite(channel.getRoot().getCreatedAt()) && !channel.getRoot().getCreatedAt().isAfter(now);
    }

    private static boolean sessionTimes(Instant created, Instant lastUsed, Instant idle, Instant absolute, Instant now) {
        return liveInterval(created, idle, now) && liveInterval(created, absolute, now)
                && !idle.isAfter(absolute)
                && (lastUsed == null || finite(lastUsed) && !lastUsed.isBefore(created) && !lastUsed.isAfter(now));
    }

    private static boolean liveInterval(Instant created, Instant expires, Instant now) {
        return finite(created) && finite(expires) && finite(now) && created.isBefore(expires)
                && !created.isAfter(now) && now.isBefore(expires);
    }

    private static boolean finite(Instant value) {
        return value != null && !value.equals(Instant.MIN) && !value.equals(Instant.MAX);
    }

    private static boolean sameChannel(BrowserContextChannel left, BrowserContextChannel right) {
        return left != null && right != null && sameId(left.getId(), right.getId());
    }

    private static boolean sameId(UUID left, UUID right) {
        return left != null && left.equals(right);
    }

    private static boolean storedCredential(String selector, byte[] verifier) {
        return selector != null && !selector.isBlank() && verifier != null && verifier.length > 0;
    }
}
