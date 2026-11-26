package com.splitmate.identity.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "anonymous_subjects")
public class AnonymousSubject {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, updatable = true)
    private SubjectStatus status;

    @Column(name = "recovery_generation", nullable = false, updatable = true)
    private long recoveryGeneration;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected AnonymousSubject() {
    }

    public AnonymousSubject(
            SubjectStatus status,
            long recoveryGeneration,
            Instant createdAt
    ) {
        this.status = Objects.requireNonNull(status);
        this.recoveryGeneration = recoveryGeneration;
        this.createdAt = Objects.requireNonNull(createdAt);
    }

    public UUID getId() {
        return id;
    }

    public SubjectStatus getStatus() {
        return status;
    }

    public long getRecoveryGeneration() {
        return recoveryGeneration;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
