package com.splitmate;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.splitmate.expense.repository.ExpenseParticipantRepository;
import com.splitmate.expense.repository.ExpenseRepository;
import com.splitmate.project.repository.ProjectMemberRepository;
import com.splitmate.project.repository.ProjectRepository;
import com.splitmate.settlement.repository.SettlementBalanceRepository;
import com.splitmate.settlement.repository.SettlementRunRepository;
import com.splitmate.settlement.repository.SettlementTransferRepository;

@ActiveProfiles("test")
@SpringBootTest
class SplitMateApplicationTests {

    @MockitoBean
    private ProjectRepository projectRepository;

    @MockitoBean
    private ProjectMemberRepository projectMemberRepository;

    @MockitoBean
    private ExpenseRepository expenseRepository;

    @MockitoBean
    private ExpenseParticipantRepository expenseParticipantRepository;

    @MockitoBean
    private SettlementRunRepository settlementRunRepository;

    @MockitoBean
    private SettlementBalanceRepository settlementBalanceRepository;

    @MockitoBean
    private SettlementTransferRepository settlementTransferRepository;

    @Test
    void contextLoads() {
    }
}
