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
@Table(name = "subject_recovery_attempts")
public class SubjectRecoveryAttempt {

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

    @Enumerated(EnumType.STRING)
    @Column(name = "purpose", nullable = false, updatable = false)
    private RecoveryPurpose purpose;

    @Column(name = "expected_generation", nullable = false, updatable = false)
    private long expectedGeneration;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "current_credential_id", nullable = true, updatable = false)
    private SubjectRecoveryCredential currentCredential;

    @Column(name = "provisional_selector", nullable = false, updatable = false)
    private String provisionalSelector;

    @Column(name = "provisional_verifier", nullable = false, updatable = false)
    private byte[] provisionalVerifier;

    @Column(name = "pending_selector", nullable = false, updatable = false)
    private String pendingSelector;

    @Column(name = "pending_verifier", nullable = false, updatable = false)
    private byte[] pendingVerifier;

    @Column(name = "operation_id", nullable = false, updatable = false)
    private UUID operationId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "initiating_session_id", nullable = true, updatable = false)
    private SubjectSession initiatingSession;

    @Column(name = "initiating_session_generation", nullable = true, updatable = false)
    private Long initiatingSessionGeneration;

    @Column(name = "switch_intent", nullable = false, updatable = false)
    private boolean switchIntent;

    @Column(name = "expected_context_epoch", nullable = false, updatable = false)
    private long expectedContextEpoch;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false, updatable = false)
    private Instant expiresAt;

    @Column(name = "consumed_at", nullable = true, updatable = true)
    private Instant consumedAt;

    @Column(name = "invalidated_at", nullable = true, updatable = true)
    private Instant invalidatedAt;

    @Column(name = "failed_confirmations", nullable = false, updatable = true)
    private int failedConfirmations;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "result_session_id", nullable = true, updatable = true)
    private SubjectSession resultSession;

    @Column(name = "result_session_generation", nullable = true, updatable = true)
    private Long resultSessionGeneration;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "result_slot_id", nullable = true, updatable = true)
    private BrowserCookieSlot resultSlot;

    @Column(name = "result_context_epoch", nullable = true, updatable = true)
    private Long resultContextEpoch;

    @Column(name = "receipt_expires_at", nullable = true, updatable = true)
    private Instant receiptExpiresAt;

    protected SubjectRecoveryAttempt() {
    }

    public SubjectRecoveryAttempt(
            AnonymousSubject subject,
            BrowserContextChannel contextChannel,
            RecoveryPurpose purpose,
            long expectedGeneration,
            SubjectRecoveryCredential currentCredential,
            String provisionalSelector,
            byte[] provisionalVerifier,
            String pendingSelector,
            byte[] pendingVerifier,
            UUID operationId,
            SubjectSession initiatingSession,
            Long initiatingSessionGeneration,
            boolean switchIntent,
            long expectedContextEpoch,
            Instant createdAt,
            Instant expiresAt
    ) {
        this.subject = Objects.requireNonNull(subject);
        this.contextChannel = Objects.requireNonNull(contextChannel);
        this.contextPurpose = Objects.requireNonNull(ContextPurpose.SUBJECT);
        this.purpose = Objects.requireNonNull(purpose);
        this.expectedGeneration = expectedGeneration;
        this.currentCredential = currentCredential;
        this.provisionalSelector = Objects.requireNonNull(provisionalSelector);
        this.provisionalVerifier = Objects.requireNonNull(provisionalVerifier).clone();
        this.pendingSelector = Objects.requireNonNull(pendingSelector);
        this.pendingVerifier = Objects.requireNonNull(pendingVerifier).clone();
        this.operationId = Objects.requireNonNull(operationId);
        this.initiatingSession = initiatingSession;
        this.initiatingSessionGeneration = initiatingSessionGeneration;
        this.switchIntent = switchIntent;
        this.expectedContextEpoch = expectedContextEpoch;
        this.createdAt = Objects.requireNonNull(createdAt);
        this.expiresAt = Objects.requireNonNull(expiresAt);
        this.failedConfirmations = 0;
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

    public RecoveryPurpose getPurpose() {
        return purpose;
    }

    public long getExpectedGeneration() {
        return expectedGeneration;
    }

    public SubjectRecoveryCredential getCurrentCredential() {
        return currentCredential;
    }

    public String getProvisionalSelector() {
        return provisionalSelector;
    }

    public byte[] getProvisionalVerifier() {
        return provisionalVerifier == null ? null : provisionalVerifier.clone();
    }

    public String getPendingSelector() {
        return pendingSelector;
    }

    public byte[] getPendingVerifier() {
        return pendingVerifier == null ? null : pendingVerifier.clone();
    }

    public UUID getOperationId() {
        return operationId;
    }

    public SubjectSession getInitiatingSession() {
        return initiatingSession;
    }

    public Long getInitiatingSessionGeneration() {
        return initiatingSessionGeneration;
    }

    public boolean isSwitchIntent() {
        return switchIntent;
    }

    public long getExpectedContextEpoch() {
        return expectedContextEpoch;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getConsumedAt() {
        return consumedAt;
    }

    public Instant getInvalidatedAt() {
        return invalidatedAt;
    }

    public int getFailedConfirmations() {
        return failedConfirmations;
    }

    public SubjectSession getResultSession() {
        return resultSession;
    }

    public Long getResultSessionGeneration() {
        return resultSessionGeneration;
    }

    public BrowserCookieSlot getResultSlot() {
        return resultSlot;
    }

    public Long getResultContextEpoch() {
        return resultContextEpoch;
    }

    public Instant getReceiptExpiresAt() {
        return receiptExpiresAt;
    }
}
