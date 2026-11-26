package com.splitmate.settlement.controller;

import java.time.YearMonth;
import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.splitmate.settlement.domain.SettlementStrategy;
import com.splitmate.settlement.dto.SettlementResponse;
import com.splitmate.settlement.service.SettlementService;
import com.splitmate.expense.service.MonthQuery;

import jakarta.validation.constraints.Pattern;

@RestController
@RequestMapping("/api/projects/{publicToken}/settlements")
public class SettlementController {

    private final SettlementService settlementService;

    public SettlementController(SettlementService settlementService) {
        this.settlementService = settlementService;
    }

    @GetMapping
    public SettlementResponse getSettlement(
            @PathVariable
            @Pattern(
                    regexp = "[A-Za-z0-9_-]{43}",
                    message = "Public token must be a 43-character Base64url value."
            )
            String publicToken,
            @RequestParam(required = false)
            @Pattern(
                    regexp = "FEWER_TRANSFERS|UNDERSTANDABLE",
                    message = "Strategy must be FEWER_TRANSFERS or UNDERSTANDABLE."
            )
            String strategy,
            @RequestParam(name = "month", required = false) List<String> month
    ) {
        YearMonth selectedMonth = MonthQuery.parse(month);
        SettlementStrategy selectedStrategy = strategy == null
                ? SettlementStrategy.FEWER_TRANSFERS
                : SettlementStrategy.valueOf(strategy);
        return selectedMonth == null
                ? settlementService.getSettlement(publicToken, selectedStrategy)
                : settlementService.getSettlement(publicToken, selectedStrategy, selectedMonth);
    }
}
