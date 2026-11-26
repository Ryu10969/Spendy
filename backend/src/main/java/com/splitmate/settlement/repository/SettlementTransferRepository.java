package com.splitmate.settlement.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.splitmate.settlement.domain.SettlementTransfer;

public interface SettlementTransferRepository extends JpaRepository<SettlementTransfer, UUID> {

    List<SettlementTransfer> findAllBySettlementRun_IdOrderByTransferOrderAsc(UUID settlementRunId);
}
