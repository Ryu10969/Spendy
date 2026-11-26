package com.splitmate.settlement.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.splitmate.settlement.domain.SettlementBalance;

public interface SettlementBalanceRepository extends JpaRepository<SettlementBalance, UUID> {

    List<SettlementBalance> findAllBySettlementRun_Id(UUID settlementRunId);
}
