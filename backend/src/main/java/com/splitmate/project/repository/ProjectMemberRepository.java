package com.splitmate.project.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.splitmate.project.domain.ProjectMember;

public interface ProjectMemberRepository extends JpaRepository<ProjectMember, UUID> {

    List<ProjectMember> findAllByProject_IdOrderByDisplayOrderAsc(UUID projectId);

    Optional<ProjectMember> findByIdAndProject_Id(UUID id, UUID projectId);

    @Query("""
            SELECT MAX(member.displayOrder)
            FROM ProjectMember member
            WHERE member.project.id = :projectId
            """)
    Optional<Integer> findMaximumDisplayOrderByProjectId(@Param("projectId") UUID projectId);
}
