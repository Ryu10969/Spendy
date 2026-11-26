package com.splitmate.settlement.domain;

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import com.splitmate.settlement.domain.SettlementCalculation.Expense;
import com.splitmate.settlement.domain.SettlementCalculation.Participant;

public final class SettlementFingerprint {

    private static final byte[] DOMAIN =
            "SPLITMATE-EVENT-SETTLEMENT-V1".getBytes(java.nio.charset.StandardCharsets.US_ASCII);
    private static final byte[] MONTHLY_DOMAIN =
            "SPLITMATE-CONTINUOUS-YEAR-MONTH-SETTLEMENT-V1"
                    .getBytes(java.nio.charset.StandardCharsets.US_ASCII);

    public String calculate(int roundingUnit, List<Expense> expenses) {
        return calculate(roundingUnit, expenses, null);
    }

    public String calculate(int roundingUnit, List<Expense> expenses, String month) {
        try {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (DataOutputStream output = new DataOutputStream(bytes)) {
                output.write(month == null ? DOMAIN : MONTHLY_DOMAIN);
                if (month != null) {
                    output.write(month.getBytes(java.nio.charset.StandardCharsets.US_ASCII));
                }
                output.writeInt(roundingUnit);

                List<Expense> orderedExpenses = new ArrayList<>(expenses);
                orderedExpenses.sort(
                        Comparator.comparing(Expense::id, SettlementCalculator.UUID_ORDER)
                );
                output.writeInt(orderedExpenses.size());
                for (Expense expense : orderedExpenses) {
                    writeUuid(output, expense.id());
                    writeUuid(output, expense.payer().id());
                    output.writeLong(expense.amount());

                    List<Participant> orderedParticipants = new ArrayList<>(expense.participants());
                    orderedParticipants.sort(
                            Comparator.comparingInt(Participant::allocationOrder)
                                    .thenComparing(
                                            participant -> participant.member().id(),
                                            SettlementCalculator.UUID_ORDER
                                    )
                    );
                    output.writeInt(orderedParticipants.size());
                    for (Participant participant : orderedParticipants) {
                        writeUuid(output, participant.member().id());
                        output.writeLong(participant.allocatedShare());
                        output.writeInt(participant.allocationOrder());
                    }
                }
                output.flush();
            }
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(bytes.toByteArray())
            );
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to write settlement fingerprint.", exception);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable.", exception);
        }
    }

    private void writeUuid(DataOutputStream output, UUID id) throws IOException {
        output.writeLong(id.getMostSignificantBits());
        output.writeLong(id.getLeastSignificantBits());
    }
}
