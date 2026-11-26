package com.splitmate.expense.repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import com.splitmate.expense.domain.Expense;

public interface ExpenseRepository extends JpaRepository<Expense, UUID> {

    @EntityGraph(attributePaths = "payerMember")
    List<Expense> findByProject_IdAndPaidOnBetween(UUID projectId, LocalDate start, LocalDate end);

    @EntityGraph(attributePaths = "payerMember")
    List<Expense> findByProject_IdInAndPaidOnBetween(List<UUID> projectIds, LocalDate start, LocalDate end);

    @EntityGraph(attributePaths = {"project", "payerMember"})
    List<Expense> findByProject_DeletedAtIsNullAndPaidOnBetween(LocalDate start, LocalDate end);

    List<Expense> findAllByProject_Id(UUID projectId);

    List<Expense> findAllByProject_IdAndPaidOnGreaterThanEqualAndPaidOnLessThan(
            UUID projectId, LocalDate start, LocalDate end);

    List<Expense> findAllByProject_IdOrderByPaidOnDescCreatedAtDescIdAsc(UUID projectId);

    List<Expense> findAllByProject_IdAndPaidOnGreaterThanEqualAndPaidOnLessThanOrderByPaidOnDescCreatedAtDescIdAsc(
            UUID projectId, LocalDate start, LocalDate end);

    Optional<Expense> findByIdAndProject_Id(UUID id, UUID projectId);
}
