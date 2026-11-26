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
@Table(name = "subject_sessions")
public class SubjectSession {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "subject_id", nullable = false, updatable = false)
    private AnonymousSubject subject;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "context_channel_id", nullable = false, updatable = false)
    private BrowserContextChannel contextChannel;

    @Enumerated(EnumType.STRING)
    @Column(name = "context_purpose", nullable = false, updatable = false)
    private ContextPurpose contextPurpose;

    @Column(name = "selector", nullable = false, updatable = true)
    private String selector;

    @Column(name = "secret_verifier", nullable = false, updatable = true)
    private byte[] secretVerifier;

    @Column(name = "credential_generation", nullable = false, updatable = true)
    private long credentialGeneration;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "last_used_at", nullable = true, updatable = true)
    private Instant lastUsedAt;

    @Column(name = "idle_expires_at", nullable = false, updatable = true)
    private Instant idleExpiresAt;

    @Column(name = "absolute_expires_at", nullable = false, updatable = false)
    private Instant absoluteExpiresAt;

    @Column(name = "revoked_at", nullable = true, updatable = true)
    private Instant revokedAt;

    @Column(name = "device_label", nullable = true, updatable = true)
    private String deviceLabel;

    protected SubjectSession() {
    }

    public SubjectSession(
            AnonymousSubject subject,
            BrowserContextChannel contextChannel,
            String selector,
            byte[] secretVerifier,
            long credentialGeneration,
            Instant createdAt,
            Instant idleExpiresAt,
            Instant absoluteExpiresAt,
            String deviceLabel
    ) {
        this.subject = Objects.requireNonNull(subject);
        this.contextChannel = Objects.requireNonNull(contextChannel);
        this.contextPurpose = Objects.requireNonNull(ContextPurpose.SUBJECT);
        this.selector = Objects.requireNonNull(selector);
        this.secretVerifier = Objects.requireNonNull(secretVerifier).clone();
        this.credentialGeneration = credentialGeneration;
        this.createdAt = Objects.requireNonNull(createdAt);
        this.idleExpiresAt = Objects.requireNonNull(idleExpiresAt);
        this.absoluteExpiresAt = Objects.requireNonNull(absoluteExpiresAt);
        this.deviceLabel = deviceLabel;
    }

    public UUID getId() {
        return id;
    }

    public AnonymousSubject getSubject() {
        return subject;
    }

    public BrowserContextChannel getContextChannel() {
        return contextChannel;
    }

    public ContextPurpose getContextPurpose() {
        return contextPurpose;
    }

    public String getSelector() {
        return selector;
    }

    public byte[] getSecretVerifier() {
        return secretVerifier == null ? null : secretVerifier.clone();
    }

    public long getCredentialGeneration() {
        return credentialGeneration;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getLastUsedAt() {
        return lastUsedAt;
    }

    public Instant getIdleExpiresAt() {
        return idleExpiresAt;
    }

    public Instant getAbsoluteExpiresAt() {
        return absoluteExpiresAt;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }

    public String getDeviceLabel() {
        return deviceLabel;
    }
}
