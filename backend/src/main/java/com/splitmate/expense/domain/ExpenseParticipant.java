package com.splitmate.expense.domain;

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
@Table(name = "expense_participants")
public class ExpenseParticipant {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "expense_id", nullable = false)
    private Expense expense;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private ProjectMember member;

    @Column(name = "allocated_share", nullable = false)
    private long allocatedShare;

    @Column(name = "allocation_order", nullable = false)
    private int allocationOrder;

    protected ExpenseParticipant() {
    }

    public ExpenseParticipant(
            Expense expense,
            ProjectMember member,
            long allocatedShare,
            int allocationOrder
    ) {
        this.expense = Objects.requireNonNull(expense);
        this.member = Objects.requireNonNull(member);
        this.allocatedShare = allocatedShare;
        this.allocationOrder = allocationOrder;
    }

    public UUID getId() {
        return id;
    }

    public Expense getExpense() {
        return expense;
    }

    public ProjectMember getMember() {
        return member;
    }

    public long getAllocatedShare() {
        return allocatedShare;
    }

    public int getAllocationOrder() {
        return allocationOrder;
    }
}
