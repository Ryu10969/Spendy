package com.splitmate.identity.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import com.splitmate.identity.domain.BrowserContextRoot;

import jakarta.persistence.LockModeType;

public interface BrowserContextRootRepository extends JpaRepository<BrowserContextRoot, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<BrowserContextRoot> findForUpdateById(UUID id);
}
