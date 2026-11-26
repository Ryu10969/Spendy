package com.splitmate.identity.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import com.splitmate.identity.domain.AnonymousSubject;

import jakarta.persistence.LockModeType;

public interface AnonymousSubjectRepository extends JpaRepository<AnonymousSubject, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<AnonymousSubject> findForUpdateById(UUID id);
}
