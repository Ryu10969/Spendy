package com.splitmate.expense.repository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import com.splitmate.expense.domain.ExpenseParticipant;

public interface ExpenseParticipantRepository extends JpaRepository<ExpenseParticipant, UUID> {

    @EntityGraph(attributePaths = "member")
    List<ExpenseParticipant> findByExpense_Project_IdAndExpense_PaidOnBetween(
            UUID projectId, LocalDate start, LocalDate end);

    @EntityGraph(attributePaths = "member")
    List<ExpenseParticipant> findByExpense_Project_IdInAndExpense_PaidOnBetween(
            List<UUID> projectIds, LocalDate start, LocalDate end);

    @EntityGraph(attributePaths = "member")
    List<ExpenseParticipant> findByExpense_Project_DeletedAtIsNullAndExpense_PaidOnBetween(
            LocalDate start, LocalDate end);

    List<ExpenseParticipant> findAllByExpense_IdOrderByAllocationOrderAsc(UUID expenseId);

    void deleteAllByExpense_Id(UUID expenseId);
}
