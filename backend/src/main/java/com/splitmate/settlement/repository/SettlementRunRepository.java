package com.splitmate.settlement.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.splitmate.settlement.domain.SettlementRun;
import com.splitmate.settlement.domain.SettlementRunState;
import com.splitmate.settlement.domain.SettlementScopeType;
import com.splitmate.settlement.domain.SettlementStrategy;

public interface SettlementRunRepository extends JpaRepository<SettlementRun, UUID> {

    Optional<SettlementRun> findByProject_IdAndStrategyAndState(
            UUID projectId,
            SettlementStrategy strategy,
            SettlementRunState state
    );

    List<SettlementRun> findAllByProject_IdAndState(
            UUID projectId,
            SettlementRunState state
    );

    List<SettlementRun> findAllByProject_IdAndScopeTypeAndScopeKeyAndState(
            UUID projectId,
            SettlementScopeType scopeType,
            String scopeKey,
            SettlementRunState state
    );

    Optional<SettlementRun> findFirstByProject_IdOrderByRunSequenceDesc(UUID projectId);
}
