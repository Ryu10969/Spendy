package com.splitmate.settlement.domain;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

import com.splitmate.project.domain.Project;

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

@Entity
@Table(name = "settlement_runs")
public class SettlementRun {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @Column(name = "run_sequence", nullable = false)
    private long runSequence;

    @Enumerated(EnumType.STRING)
    @Column(name = "scope_type", nullable = false, length = 20)
    private SettlementScopeType scopeType;

    @Column(name = "scope_key", nullable = false, length = 7)
    private String scopeKey;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private SettlementStrategy strategy;

    @Column(name = "source_state_fingerprint", nullable = false, length = 64)
    private String sourceStateFingerprint;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private SettlementRunState state;

    @Column(name = "generated_at", nullable = false)
    private Instant generatedAt;

    @Column(name = "staled_at")
    private Instant staledAt;

    protected SettlementRun() {
    }

    public SettlementRun(
            Project project,
            long runSequence,
            SettlementStrategy strategy,
            String sourceStateFingerprint,
            Instant generatedAt
    ) {
        this(project, runSequence, SettlementScopeType.PROJECT, "PROJECT", strategy,
                sourceStateFingerprint, generatedAt);
    }

    public SettlementRun(
            Project project,
            long runSequence,
            SettlementScopeType scopeType,
            String scopeKey,
            SettlementStrategy strategy,
            String sourceStateFingerprint,
            Instant generatedAt
    ) {
        this.project = Objects.requireNonNull(project);
        this.runSequence = runSequence;
        this.scopeType = Objects.requireNonNull(scopeType);
        this.scopeKey = Objects.requireNonNull(scopeKey);
        this.strategy = Objects.requireNonNull(strategy);
        this.sourceStateFingerprint = Objects.requireNonNull(sourceStateFingerprint);
        this.state = SettlementRunState.CURRENT;
        this.generatedAt = Objects.requireNonNull(generatedAt);
    }

    public void markStale(Instant staledAt) {
        if (state == SettlementRunState.CURRENT) {
            state = SettlementRunState.STALE;
            this.staledAt = Objects.requireNonNull(staledAt);
        }
    }

    public UUID getId() {
        return id;
    }

    public Project getProject() {
        return project;
    }

    public long getRunSequence() {
        return runSequence;
    }

    public SettlementScopeType getScopeType() {
        return scopeType;
    }

    public String getScopeKey() {
        return scopeKey;
    }

    public SettlementStrategy getStrategy() {
        return strategy;
    }

    public String getSourceStateFingerprint() {
        return sourceStateFingerprint;
    }

    public SettlementRunState getState() {
        return state;
    }

    public Instant getGeneratedAt() {
        return generatedAt;
    }

    public Instant getStaledAt() {
        return staledAt;
    }
}
