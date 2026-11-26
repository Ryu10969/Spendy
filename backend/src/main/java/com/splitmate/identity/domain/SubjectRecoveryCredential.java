package com.splitmate.identity.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
@Table(name = "subject_recovery_credentials")
public class SubjectRecoveryCredential {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "subject_id", nullable = false, updatable = false)
    private AnonymousSubject subject;

    @Column(name = "selector", nullable = false, updatable = false)
    private String selector;

    @Column(name = "secret_verifier", nullable = false, updatable = false)
    private byte[] secretVerifier;

    @Column(name = "generation", nullable = false, updatable = false)
    private long generation;

    @Column(name = "activated_at", nullable = false, updatable = false)
    private Instant activatedAt;

    @Column(name = "consumed_at", nullable = true, updatable = true)
    private Instant consumedAt;

    @Column(name = "revoked_at", nullable = true, updatable = true)
    private Instant revokedAt;

    protected SubjectRecoveryCredential() {
    }

    public SubjectRecoveryCredential(
            AnonymousSubject subject,
            String selector,
            byte[] secretVerifier,
            long generation,
            Instant activatedAt
    ) {
        this.subject = Objects.requireNonNull(subject);
        this.selector = Objects.requireNonNull(selector);
        this.secretVerifier = Objects.requireNonNull(secretVerifier).clone();
        this.generation = generation;
        this.activatedAt = Objects.requireNonNull(activatedAt);
    }

    public UUID getId() {
        return id;
    }

    public AnonymousSubject getSubject() {
        return subject;
    }

    public String getSelector() {
        return selector;
    }

    public byte[] getSecretVerifier() {
        return secretVerifier == null ? null : secretVerifier.clone();
    }

    public long getGeneration() {
        return generation;
    }

    public Instant getActivatedAt() {
        return activatedAt;
    }

    public Instant getConsumedAt() {
        return consumedAt;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }
}
