package com.splitmate.project.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import com.splitmate.project.domain.Project;
import com.splitmate.project.domain.ProjectStatus;

import jakarta.persistence.LockModeType;

public interface ProjectRepository extends JpaRepository<Project, UUID> {

    List<Project> findAllByDeletedAtIsNullOrderByUpdatedAtDescCreatedAtDescIdAsc();

    long countByDeletedAtIsNull();

    Page<Project> findByDeletedAtIsNull(Pageable pageable);

    Page<Project> findByStatusAndDeletedAtIsNull(ProjectStatus status, Pageable pageable);

    Page<Project> findByDeletedAtIsNullAndNameContainingIgnoreCase(String name, Pageable pageable);

    Page<Project> findByStatusAndDeletedAtIsNullAndNameContainingIgnoreCase(
            ProjectStatus status, String name, Pageable pageable);

    Optional<Project> findByPublicTokenAndDeletedAtIsNull(String publicToken);

    List<Project> findByPublicTokenInAndDeletedAtIsNull(List<String> publicTokens);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Project> findForUpdateByPublicTokenAndDeletedAtIsNull(String publicToken);
}
