package com.splitmate.identity.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import com.splitmate.identity.domain.SubjectRecoveryAttempt;

import jakarta.persistence.LockModeType;

public interface SubjectRecoveryAttemptRepository extends JpaRepository<SubjectRecoveryAttempt, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<SubjectRecoveryAttempt> findForUpdateById(UUID id);
}
