package com.splitmate.settlement.domain;

import java.util.Objects;
import java.util.UUID;

import com.splitmate.project.domain.ProjectMember;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "settlement_balances")
public class SettlementBalance {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "settlement_run_id", nullable = false)
    private SettlementRun settlementRun;

    @Column(name = "project_id", nullable = false)
    private UUID projectId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private ProjectMember member;

    @Column(name = "paid_amount", nullable = false)
    private long paidAmount;

    @Column(name = "burden_amount", nullable = false)
    private long burdenAmount;

    @Column(name = "exact_balance", nullable = false)
    private long exactBalance;

    @Column(name = "rounded_transfer_net", nullable = false)
    private long roundedTransferNet;

    @Column(name = "rounding_difference", nullable = false)
    private long roundingDifference;

    protected SettlementBalance() {
    }

    public SettlementBalance(
            SettlementRun settlementRun,
            ProjectMember member,
            long paidAmount,
            long burdenAmount,
            long exactBalance,
            long roundedTransferNet,
            long roundingDifference
    ) {
        this.settlementRun = Objects.requireNonNull(settlementRun);
        this.projectId = settlementRun.getProject().getId();
        this.member = Objects.requireNonNull(member);
        this.paidAmount = paidAmount;
        this.burdenAmount = burdenAmount;
        this.exactBalance = exactBalance;
        this.roundedTransferNet = roundedTransferNet;
        this.roundingDifference = roundingDifference;
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

    public ProjectMember getMember() {
        return member;
    }

    public long getPaidAmount() {
        return paidAmount;
    }

    public long getBurdenAmount() {
        return burdenAmount;
    }

    public long getExactBalance() {
        return exactBalance;
    }

    public long getRoundedTransferNet() {
        return roundedTransferNet;
    }

    public long getRoundingDifference() {
        return roundingDifference;
    }
}
