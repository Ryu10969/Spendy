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
@Table(name = "browser_context_channels")
public class BrowserContextChannel {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "root_id", nullable = false, updatable = false)
    private BrowserContextRoot root;

    @Enumerated(EnumType.STRING)
    @Column(name = "purpose", nullable = false, updatable = false)
    private ContextPurpose purpose;

    @Column(name = "epoch", nullable = false, updatable = true)
    private long epoch;

    @Enumerated(EnumType.STRING)
    @Column(name = "state", nullable = false, updatable = true)
    private ChannelState state;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "current_slot_id", nullable = true, updatable = true)
    private BrowserCookieSlot currentSlot;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pending_attempt_id", nullable = true, updatable = true)
    private SubjectRecoveryAttempt pendingAttempt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "retired_at", nullable = true, updatable = true)
    private Instant retiredAt;

    protected BrowserContextChannel() {
    }

    public BrowserContextChannel(
            BrowserContextRoot root,
            ContextPurpose purpose,
            Instant createdAt
    ) {
        this.root = Objects.requireNonNull(root);
        this.purpose = Objects.requireNonNull(purpose);
        this.epoch = 0;
        this.state = Objects.requireNonNull(ChannelState.OPEN);
        this.createdAt = Objects.requireNonNull(createdAt);
    }

    public UUID getId() {
        return id;
    }

    public BrowserContextRoot getRoot() {
        return root;
    }

    public ContextPurpose getPurpose() {
        return purpose;
    }

    public long getEpoch() {
        return epoch;
    }

    public ChannelState getState() {
        return state;
    }

    public BrowserCookieSlot getCurrentSlot() {
        return currentSlot;
    }

    public SubjectRecoveryAttempt getPendingAttempt() {
        return pendingAttempt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getRetiredAt() {
        return retiredAt;
    }
}
