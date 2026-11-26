package com.splitmate.identity.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "browser_cookie_slots")
public class BrowserCookieSlot {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "context_channel_id", nullable = false, updatable = false)
    private BrowserContextChannel contextChannel;

    @Enumerated(EnumType.STRING)
    @Column(name = "purpose", nullable = false, updatable = false)
    private ContextPurpose purpose;

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, updatable = false)
    private CookieSlotKind kind;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "subject_session_id", nullable = true, updatable = false)
    private SubjectSession subjectSession;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "share_session_id", nullable = true, updatable = false)
    private ShareSession shareSession;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "attempt_id", nullable = true, updatable = false)
    private SubjectRecoveryAttempt attempt;

    @Column(name = "credential_generation", nullable = false, updatable = false)
    private long credentialGeneration;

    @Column(name = "issued_epoch", nullable = false, updatable = false)
    private long issuedEpoch;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "cookie_expires_at", nullable = false, updatable = false)
    private Instant cookieExpiresAt;

    @Column(name = "terminal_at", nullable = true, updatable = true)
    private Instant terminalAt;

    protected BrowserCookieSlot() {
    }

    public BrowserCookieSlot(
            BrowserContextChannel contextChannel,
            CookieSlotKind kind,
            SubjectSession subjectSession,
            ShareSession shareSession,
            SubjectRecoveryAttempt attempt,
            long credentialGeneration,
            long issuedEpoch,
            Instant createdAt,
            Instant cookieExpiresAt
    ) {
        this.contextChannel = Objects.requireNonNull(contextChannel);
        this.purpose = Objects.requireNonNull(Objects.requireNonNull(contextChannel).getPurpose());
        this.kind = Objects.requireNonNull(kind);
        this.subjectSession = subjectSession;
        this.shareSession = shareSession;
        this.attempt = attempt;
        this.credentialGeneration = credentialGeneration;
        this.issuedEpoch = issuedEpoch;
        this.createdAt = Objects.requireNonNull(createdAt);
        this.cookieExpiresAt = Objects.requireNonNull(cookieExpiresAt);
    }

    public UUID getId() {
        return id;
    }

    public BrowserContextChannel getContextChannel() {
        return contextChannel;
    }

    public ContextPurpose getPurpose() {
        return purpose;
    }

    public CookieSlotKind getKind() {
        return kind;
    }

    public SubjectSession getSubjectSession() {
        return subjectSession;
    }

    public ShareSession getShareSession() {
        return shareSession;
    }

    public SubjectRecoveryAttempt getAttempt() {
        return attempt;
    }

    public long getCredentialGeneration() {
        return credentialGeneration;
    }

    public long getIssuedEpoch() {
        return issuedEpoch;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getCookieExpiresAt() {
        return cookieExpiresAt;
    }

    public Instant getTerminalAt() {
        return terminalAt;
    }
}
