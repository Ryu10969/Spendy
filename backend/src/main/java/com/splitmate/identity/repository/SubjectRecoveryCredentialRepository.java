package com.splitmate.identity.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import com.splitmate.identity.domain.SubjectRecoveryCredential;

import jakarta.persistence.LockModeType;

public interface SubjectRecoveryCredentialRepository extends JpaRepository<SubjectRecoveryCredential, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<SubjectRecoveryCredential> findForUpdateById(UUID id);
}
