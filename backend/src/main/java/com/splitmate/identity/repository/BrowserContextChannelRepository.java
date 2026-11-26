package com.splitmate.identity.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import com.splitmate.identity.domain.BrowserContextChannel;

import jakarta.persistence.LockModeType;

public interface BrowserContextChannelRepository extends JpaRepository<BrowserContextChannel, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<BrowserContextChannel> findForUpdateById(UUID id);
}
