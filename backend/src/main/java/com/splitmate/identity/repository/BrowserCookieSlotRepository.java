package com.splitmate.identity.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import com.splitmate.identity.domain.BrowserCookieSlot;

import jakarta.persistence.LockModeType;

public interface BrowserCookieSlotRepository extends JpaRepository<BrowserCookieSlot, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<BrowserCookieSlot> findForUpdateById(UUID id);
}
