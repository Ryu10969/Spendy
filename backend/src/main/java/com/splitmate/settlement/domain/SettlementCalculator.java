package com.splitmate.settlement.domain;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.splitmate.settlement.domain.SettlementCalculation.Balance;
import com.splitmate.settlement.domain.SettlementCalculation.Expense;
import com.splitmate.settlement.domain.SettlementCalculation.Member;
import com.splitmate.settlement.domain.SettlementCalculation.Transfer;

public final class SettlementCalculator {

    public static final Comparator<UUID> UUID_ORDER = (left, right) -> {
        int mostSignificantComparison = Long.compareUnsigned(
                left.getMostSignificantBits(),
                right.getMostSignificantBits()
        );
        if (mostSignificantComparison != 0) {
            return mostSignificantComparison;
        }
        return Long.compareUnsigned(left.getLeastSignificantBits(), right.getLeastSignificantBits());
    };

    private static final Comparator<Member> MEMBER_ORDER =
            Comparator.comparingInt(Member::displayOrder).thenComparing(Member::id, UUID_ORDER);

    public SettlementCalculation calculate(
            List<Expense> expenses,
            SettlementStrategy strategy,
            int roundingUnit
    ) {
        if (!Set.of(1, 10, 100, 1000).contains(roundingUnit)) {
            throw new IllegalArgumentException("Unsupported rounding unit.");
        }

        Map<UUID, MutableBalance> mutableBalances = calculateExactBalances(expenses);
        List<MutableParty> debtors = mutableBalances.values().stream()
                .filter(balance -> balance.exactBalance < 0)
                .map(balance -> new MutableParty(
                        balance.member,
                        Math.negateExact(balance.exactBalance)
                ))
                .toList();
        List<MutableParty> creditors = mutableBalances.values().stream()
                .filter(balance -> balance.exactBalance > 0)
                .map(balance -> new MutableParty(balance.member, balance.exactBalance))
                .toList();

        List<Transfer> transfers = switch (strategy) {
            case FEWER_TRANSFERS -> matchByRemainingAmount(debtors, creditors, roundingUnit);
            case UNDERSTANDABLE -> matchByMemberOrder(debtors, creditors, roundingUnit);
        };

        Map<UUID, Long> roundedNets = new HashMap<>();
        for (UUID memberId : mutableBalances.keySet()) {
            roundedNets.put(memberId, 0L);
        }
        for (Transfer transfer : transfers) {
            roundedNets.compute(
                    transfer.fromMemberId(),
                    (ignored, amount) -> Math.subtractExact(amount, transfer.finalRoundedAmount())
            );
            roundedNets.compute(
                    transfer.toMemberId(),
                    (ignored, amount) -> Math.addExact(amount, transfer.finalRoundedAmount())
            );
        }

        List<Balance> balances = mutableBalances.values().stream()
                .sorted(Comparator.comparing(balance -> balance.member, MEMBER_ORDER))
                .map(balance -> {
                    long roundedTransferNet = roundedNets.get(balance.member.id());
                    return new Balance(
                            balance.member,
                            balance.paidAmount,
                            balance.burdenAmount,
                            balance.exactBalance,
                            roundedTransferNet,
                            Math.subtractExact(balance.exactBalance, roundedTransferNet)
                    );
                })
                .toList();
        if (balances.stream().anyMatch(balance -> balance.roundingDifference() != 0)) {
            throw new IllegalArgumentException("Rounded transfers do not reconcile balances.");
        }
        return new SettlementCalculation(balances, transfers);
    }

    private Map<UUID, MutableBalance> calculateExactBalances(List<Expense> expenses) {
        Map<UUID, MutableBalance> balances = new HashMap<>();
        for (Expense expense : expenses) {
            MutableBalance payerBalance = findOrCreate(balances, expense.payer());
            payerBalance.paidAmount = Math.addExact(payerBalance.paidAmount, expense.amount());

            long allocatedTotal = 0;
            Set<UUID> participantIds = new HashSet<>();
            Set<Integer> allocationOrders = new HashSet<>();
            for (var participant : expense.participants()) {
                if (!participantIds.add(participant.member().id())) {
                    throw new IllegalArgumentException("Duplicate participant member.");
                }
                if (!allocationOrders.add(participant.allocationOrder())) {
                    throw new IllegalArgumentException("Duplicate participant allocation order.");
                }
                allocatedTotal = Math.addExact(allocatedTotal, participant.allocatedShare());
                MutableBalance participantBalance = findOrCreate(balances, participant.member());
                participantBalance.burdenAmount = Math.addExact(
                        participantBalance.burdenAmount,
                        participant.allocatedShare()
                );
            }
            if (allocatedTotal != expense.amount()) {
                throw new IllegalArgumentException("Expense allocations do not equal its amount.");
            }
        }

        long balanceTotal = 0;
        for (MutableBalance balance : balances.values()) {
            balance.exactBalance = Math.subtractExact(
                    balance.paidAmount,
                    balance.burdenAmount
            );
            balanceTotal = Math.addExact(balanceTotal, balance.exactBalance);
        }
        if (balanceTotal != 0) {
            throw new IllegalArgumentException("Exact balances do not sum to zero.");
        }
        return balances;
    }

    private MutableBalance findOrCreate(Map<UUID, MutableBalance> balances, Member member) {
        MutableBalance existing = balances.get(member.id());
        if (existing != null) {
            if (existing.member.displayOrder() != member.displayOrder()) {
                throw new IllegalArgumentException("Member display order is inconsistent.");
            }
            return existing;
        }
        MutableBalance created = new MutableBalance(member);
        balances.put(member.id(), created);
        return created;
    }

    private List<Transfer> matchByRemainingAmount(
            List<MutableParty> initialDebtors,
            List<MutableParty> initialCreditors,
            int roundingUnit
    ) {
        List<MutableParty> debtors = mutableCopies(initialDebtors);
        List<MutableParty> creditors = mutableCopies(initialCreditors);
        Comparator<MutableParty> amountOrder = Comparator
                .comparingLong(MutableParty::remaining)
                .reversed()
                .thenComparing(MutableParty::member, MEMBER_ORDER);
        List<Transfer> transfers = new ArrayList<>();

        while (!debtors.isEmpty() && !creditors.isEmpty()) {
            debtors.sort(amountOrder);
            creditors.sort(amountOrder);
            MutableParty debtor = debtors.getFirst();
            MutableParty creditor = creditors.getFirst();
            addTransfer(transfers, debtor, creditor, roundingUnit);
            debtors.removeIf(party -> party.remaining == 0);
            creditors.removeIf(party -> party.remaining == 0);
        }
        assertFullyMatched(debtors, creditors);
        return List.copyOf(transfers);
    }

    private List<Transfer> matchByMemberOrder(
            List<MutableParty> initialDebtors,
            List<MutableParty> initialCreditors,
            int roundingUnit
    ) {
        List<MutableParty> debtors = mutableCopies(initialDebtors);
        List<MutableParty> creditors = mutableCopies(initialCreditors);
        Comparator<MutableParty> memberOrder =
                Comparator.comparing(MutableParty::member, MEMBER_ORDER);
        debtors.sort(memberOrder);
        creditors.sort(memberOrder);
        List<Transfer> transfers = new ArrayList<>();
        int debtorIndex = 0;
        int creditorIndex = 0;

        while (debtorIndex < debtors.size() && creditorIndex < creditors.size()) {
            MutableParty debtor = debtors.get(debtorIndex);
            MutableParty creditor = creditors.get(creditorIndex);
            addTransfer(transfers, debtor, creditor, roundingUnit);
            if (debtor.remaining == 0) {
                debtorIndex++;
            }
            if (creditor.remaining == 0) {
                creditorIndex++;
            }
        }
        assertFullyMatched(
                debtors.subList(debtorIndex, debtors.size()),
                creditors.subList(creditorIndex, creditors.size())
        );
        return List.copyOf(transfers);
    }

    private void addTransfer(
            List<Transfer> transfers,
            MutableParty debtor,
            MutableParty creditor,
            int roundingUnit
    ) {
        long exactAmount = Math.min(debtor.remaining, creditor.remaining);
        if (exactAmount <= 0) {
            throw new IllegalArgumentException("Settlement transfer must be positive.");
        }
        long fromBalanceBefore = Math.negateExact(debtor.remaining);
        long toBalanceBefore = creditor.remaining;
        long initiallyRoundedAmount = roundHalfUp(exactAmount, roundingUnit);
        long roundingAdjustment = Math.subtractExact(exactAmount, initiallyRoundedAmount);
        long finalRoundedAmount = Math.addExact(initiallyRoundedAmount, roundingAdjustment);

        transfers.add(new Transfer(
                transfers.size() + 1,
                debtor.member.id(),
                creditor.member.id(),
                exactAmount,
                initiallyRoundedAmount,
                finalRoundedAmount,
                roundingAdjustment,
                fromBalanceBefore,
                toBalanceBefore
        ));
        debtor.remaining = Math.subtractExact(debtor.remaining, exactAmount);
        creditor.remaining = Math.subtractExact(creditor.remaining, exactAmount);
    }

    private long roundHalfUp(long amount, int unit) {
        long quotient = amount / unit;
        long remainder = amount % unit;
        long roundedQuotient = remainder < unit - remainder
                ? quotient
                : Math.addExact(quotient, 1);
        return Math.multiplyExact(roundedQuotient, unit);
    }

    private List<MutableParty> mutableCopies(List<MutableParty> parties) {
        return parties.stream()
                .map(party -> new MutableParty(party.member, party.remaining))
                .collect(java.util.stream.Collectors.toCollection(ArrayList::new));
    }

    private void assertFullyMatched(List<MutableParty> debtors, List<MutableParty> creditors) {
        boolean debtRemains = debtors.stream().anyMatch(party -> party.remaining != 0);
        boolean creditRemains = creditors.stream().anyMatch(party -> party.remaining != 0);
        if (debtRemains || creditRemains) {
            throw new IllegalArgumentException("Debtors and creditors did not fully match.");
        }
    }

    private static final class MutableBalance {
        private final Member member;
        private long paidAmount;
        private long burdenAmount;
        private long exactBalance;

        private MutableBalance(Member member) {
            this.member = member;
        }
    }

    private static final class MutableParty {
        private final Member member;
        private long remaining;

        private MutableParty(Member member, long remaining) {
            this.member = member;
            this.remaining = remaining;
        }

        private Member member() {
            return member;
        }

        private long remaining() {
            return remaining;
        }
    }
}
