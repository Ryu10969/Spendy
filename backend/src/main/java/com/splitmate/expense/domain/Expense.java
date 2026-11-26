package com.splitmate.expense.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;

import com.splitmate.project.domain.Project;
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
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

@Entity
@Table(name = "expenses")
public class Expense {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "payer_member_id", nullable = false)
    private ProjectMember payerMember;

    @Column(nullable = false)
    private long amount;

    @Column(nullable = false, length = 100)
    private String content;

    @Enumerated(EnumType.STRING)
    private ExpenseCategory category;

    @Column(length = 1000)
    private String note;

    @Column(name = "paid_on", nullable = false)
    private LocalDate paidOn;

    @Version
    @Column(nullable = false)
    private long version;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Expense() {
    }

    public Expense(
            Project project,
            ProjectMember payerMember,
            long amount,
            String content,
            ExpenseCategory category,
            String note,
            LocalDate paidOn
    ) {
        this.project = Objects.requireNonNull(project);
        this.payerMember = Objects.requireNonNull(payerMember);
        this.amount = amount;
        this.content = Objects.requireNonNull(content);
        this.category = category;
        this.note = note;
        this.paidOn = Objects.requireNonNull(paidOn);
    }

    public void update(
            ProjectMember payerMember,
            long amount,
            String content,
            ExpenseCategory category,
            String note,
            LocalDate paidOn
    ) {
        this.payerMember = Objects.requireNonNull(payerMember);
        this.amount = amount;
        this.content = Objects.requireNonNull(content);
        this.category = category;
        this.note = note;
        this.paidOn = Objects.requireNonNull(paidOn);
    }

    public void markAllocationsChanged() {
        updatedAt = Instant.now();
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

    public Project getProject() {
        return project;
    }

    public ProjectMember getPayerMember() {
        return payerMember;
    }

    public long getAmount() {
        return amount;
    }

    public String getContent() {
        return content;
    }

    public ExpenseCategory getCategory() {
        return category;
    }

    public String getNote() {
        return note;
    }

    public LocalDate getPaidOn() {
        return paidOn;
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
