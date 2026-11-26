package com.splitmate.project.domain;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

@Entity
@Table(name = "projects")
public class Project {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "public_token", nullable = false, unique = true, length = 43)
    private String publicToken;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(length = 1000)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private ProjectType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 3)
    private ProjectCurrency currency;

    @Column(name = "rounding_unit", nullable = false)
    private int roundingUnit;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 8)
    private ProjectStatus status;

    @Column(name = "archived_at")
    private Instant archivedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Version
    @Column(nullable = false)
    private long version;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Project() {
    }

    public Project(
            String publicToken,
            String name,
            String description,
            ProjectType type,
            int roundingUnit
    ) {
        this.publicToken = Objects.requireNonNull(publicToken);
        this.name = Objects.requireNonNull(name);
        this.description = description;
        this.type = Objects.requireNonNull(type);
        this.currency = ProjectCurrency.JPY;
        this.roundingUnit = roundingUnit;
        this.status = ProjectStatus.ACTIVE;
    }

    @PrePersist
    void initializeTimestamps() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void updateTimestamp() {
        updatedAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public String getPublicToken() {
        return publicToken;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public ProjectType getType() {
        return type;
    }

    public ProjectCurrency getCurrency() {
        return currency;
    }

    public int getRoundingUnit() {
        return roundingUnit;
    }

    public ProjectStatus getStatus() {
        return status;
    }

    public void archive(Instant archivedAt) {
        this.status = ProjectStatus.ARCHIVED;
        this.archivedAt = Objects.requireNonNull(archivedAt);
    }

    public Instant getArchivedAt() {
        return archivedAt;
    }

    public Instant getDeletedAt() {
        return deletedAt;
    }

    public void delete(Instant deletedAt) {
        this.deletedAt = Objects.requireNonNull(deletedAt);
    }

    public long getVersion() {
        return version;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
