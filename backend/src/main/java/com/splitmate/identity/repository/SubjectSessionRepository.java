package com.splitmate.identity.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import com.splitmate.identity.domain.SubjectSession;

import jakarta.persistence.LockModeType;

public interface SubjectSessionRepository extends JpaRepository<SubjectSession, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<SubjectSession> findForUpdateById(UUID id);
}
