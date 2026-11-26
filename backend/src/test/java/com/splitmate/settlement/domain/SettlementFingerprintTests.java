package com.splitmate.settlement.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.splitmate.settlement.domain.SettlementCalculation.Expense;
import com.splitmate.settlement.domain.SettlementCalculation.Member;
import com.splitmate.settlement.domain.SettlementCalculation.Participant;

class SettlementFingerprintTests {

    private final SettlementFingerprint fingerprint = new SettlementFingerprint();

    @Test
    void matchesIndependentCanonicalEmptyVector() {
        assertThat(fingerprint.calculate(1, List.of()))
                .isEqualTo("0f35deb172a956d79e344cfca26784f2acd3f6cd56bf56e5e9294e600c2cabc4");
    }

    @Test
    void monthlyFingerprintUsesDistinctDomainAndCanonicalMonthBytes() {
        assertThat(fingerprint.calculate(10, List.of(), "2026-09"))
                .isEqualTo("2e9da7654978e6434e5209922c8edd229de47eebb0fcd6ee3f9414c737feac77");
        assertThat(fingerprint.calculate(10, List.of(), "2026-10"))
                .isNotEqualTo(fingerprint.calculate(10, List.of(), "2026-09"));
        assertThat(fingerprint.calculate(10, List.of()))
                .isNotEqualTo(fingerprint.calculate(10, List.of(), "2026-09"));
    }

    @Test
    void canonicalizesExpenseAndParticipantOrdering() {
        Member payer = member("ffffffff-ffff-ffff-ffff-ffffffffffff", 3);
        Member first = member("00000000-0000-0000-0000-000000000001", 1);
        Member second = member("80000000-0000-0000-0000-000000000000", 2);
        Expense lower = expense(
                "00000000-0000-0000-0000-000000000010",
                payer,
                100,
                new Participant(second, 40, 2),
                new Participant(first, 60, 1)
        );
        Expense higher = expense(
                "ffffffff-ffff-ffff-ffff-ffffffffffff",
                first,
                5,
                new Participant(first, 5, 1)
        );

        String forward = fingerprint.calculate(10, List.of(lower, higher));
        String reversed = fingerprint.calculate(
                10,
                List.of(
                        higher,
                        expense(
                                "00000000-0000-0000-0000-000000000010",
                                payer,
                                100,
                                new Participant(first, 60, 1),
                                new Participant(second, 40, 2)
                        )
                )
        );

        assertThat(forward)
                .isEqualTo("f1f2276ddadf1ddfdb38b278c888ecebe59af362dcee7e8bbf9e39892f2c8f02");
        assertThat(reversed).isEqualTo(forward);
        assertThat(forward).hasSize(64).matches("[0-9a-f]{64}");
        assertThat(fingerprint.calculate(100, List.of(lower, higher))).isNotEqualTo(forward);
    }

    @Test
    void excludesPresentationFieldsRepresentedByDisplayOrder() {
        Member payerOne = member("00000000-0000-0000-0000-000000000001", 1);
        Member participantOne = member("00000000-0000-0000-0000-000000000002", 2);
        Member payerChangedDisplay = new Member(payerOne.id(), 20);
        Member participantChangedDisplay = new Member(participantOne.id(), 10);

        assertThat(fingerprint.calculate(
                1,
                List.of(expense(
                        "00000000-0000-0000-0000-000000000003",
                        payerOne,
                        7,
                        new Participant(participantOne, 7, 1)
                ))
        )).isEqualTo(fingerprint.calculate(
                1,
                List.of(expense(
                        "00000000-0000-0000-0000-000000000003",
                        payerChangedDisplay,
                        7,
                        new Participant(participantChangedDisplay, 7, 1)
                ))
        ));
    }

    private Expense expense(
            String id,
            Member payer,
            long amount,
            Participant... participants
    ) {
        return new Expense(UUID.fromString(id), payer, amount, List.of(participants));
    }

    private Member member(String id, int displayOrder) {
        return new Member(UUID.fromString(id), displayOrder);
    }
}
