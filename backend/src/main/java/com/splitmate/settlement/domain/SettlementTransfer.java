package com.splitmate.settlement.domain;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

import com.splitmate.project.domain.ProjectMember;

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
@Table(name = "settlement_transfers")
public class SettlementTransfer {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "settlement_run_id", nullable = false)
    private SettlementRun settlementRun;

    @Column(name = "project_id", nullable = false)
    private UUID projectId;

    @Column(name = "transfer_order", nullable = false)
    private int transferOrder;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "from_member_id", nullable = false)
    private ProjectMember fromMember;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "to_member_id", nullable = false)
    private ProjectMember toMember;

    @Column(name = "exact_amount", nullable = false)
    private long exactAmount;

    @Column(name = "initially_rounded_amount", nullable = false)
    private long initiallyRoundedAmount;

    @Column(name = "final_rounded_amount", nullable = false)
    private long finalRoundedAmount;

    @Column(name = "rounding_adjustment", nullable = false)
    private long roundingAdjustment;

    @Enumerated(EnumType.STRING)
    @Column(name = "explanation_kind", nullable = false, length = 30)
    private SettlementExplanationKind explanationKind;

    @Column(name = "from_exact_balance_before", nullable = false)
    private long fromExactBalanceBefore;

    @Column(name = "to_exact_balance_before", nullable = false)
    private long toExactBalanceBefore;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private SettlementTransferStatus status;

    @Column(name = "completed_at")
    private Instant completedAt;

    protected SettlementTransfer() {
    }

    public SettlementTransfer(
            SettlementRun settlementRun,
            int transferOrder,
            ProjectMember fromMember,
            ProjectMember toMember,
            long exactAmount,
            long initiallyRoundedAmount,
            long finalRoundedAmount,
            long roundingAdjustment,
            long fromExactBalanceBefore,
            long toExactBalanceBefore
    ) {
        this.settlementRun = Objects.requireNonNull(settlementRun);
        this.projectId = settlementRun.getProject().getId();
        this.transferOrder = transferOrder;
        this.fromMember = Objects.requireNonNull(fromMember);
        this.toMember = Objects.requireNonNull(toMember);
        this.exactAmount = exactAmount;
        this.initiallyRoundedAmount = initiallyRoundedAmount;
        this.finalRoundedAmount = finalRoundedAmount;
        this.roundingAdjustment = roundingAdjustment;
        this.explanationKind = SettlementExplanationKind.NET_BALANCE_MATCH;
        this.fromExactBalanceBefore = fromExactBalanceBefore;
        this.toExactBalanceBefore = toExactBalanceBefore;
        this.status = SettlementTransferStatus.OUTSTANDING;
    }

    public UUID getId() {
        return id;
    }

    public SettlementRun getSettlementRun() {
        return settlementRun;
    }

    public UUID getProjectId() {
        return projectId;
    }

    public int getTransferOrder() {
        return transferOrder;
    }

    public ProjectMember getFromMember() {
        return fromMember;
    }

    public ProjectMember getToMember() {
        return toMember;
    }

    public long getExactAmount() {
        return exactAmount;
    }

    public long getInitiallyRoundedAmount() {
        return initiallyRoundedAmount;
    }

    public long getFinalRoundedAmount() {
        return finalRoundedAmount;
    }

    public long getRoundingAdjustment() {
        return roundingAdjustment;
    }

    public SettlementExplanationKind getExplanationKind() {
        return explanationKind;
    }

    public long getFromExactBalanceBefore() {
        return fromExactBalanceBefore;
    }

    public long getToExactBalanceBefore() {
        return toExactBalanceBefore;
    }

    public SettlementTransferStatus getStatus() {
        return status;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }
}
