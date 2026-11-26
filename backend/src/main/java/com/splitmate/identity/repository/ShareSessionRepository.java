package com.splitmate.identity.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import com.splitmate.identity.domain.ShareSession;

import jakarta.persistence.LockModeType;

public interface ShareSessionRepository extends JpaRepository<ShareSession, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<ShareSession> findForUpdateById(UUID id);
}
