package com.splitmate.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class IdentitySchemaIntegrationTests extends IdentityPostgresTestSupport {

    @Test
    void t1RejectsMissingParentsAndRestrictsDeletesForAllReferencePaths() {
        Fixture f = fixture();
        UUID attempt = attempt(f);
        UUID provisional = slot(f.channel(), "PROVISIONAL", attempt, 0, 1);
        Completion result = complete(f, attempt);
        UUID shareChannel = channel(f.root(), "SHARE");
        UUID share = shareSession(shareChannel);
        UUID shareSlot = slot(shareChannel, "SHARE", share, 0, 1);
        List<Object[]> references = List.of(
                new Object[]{"browser_context_channels", f.channel(), "root_id"},
                new Object[]{"browser_context_channels", f.channel(), "current_slot_id"},
                new Object[]{"browser_context_channels", f.channel(), "pending_attempt_id"},
                new Object[]{"subject_sessions", f.session(), "subject_id"},
                new Object[]{"subject_sessions", f.session(), "context_channel_id"},
                new Object[]{"share_sessions", share, "context_channel_id"},
                new Object[]{"subject_recovery_credentials", f.code(), "subject_id"},
                new Object[]{"subject_recovery_attempts", attempt, "subject_id"},
                new Object[]{"subject_recovery_attempts", attempt, "context_channel_id"},
                new Object[]{"subject_recovery_attempts", attempt, "current_credential_id"},
                new Object[]{"subject_recovery_attempts", attempt, "initiating_session_id"},
                new Object[]{"subject_recovery_attempts", attempt, "result_session_id"},
                new Object[]{"subject_recovery_attempts", attempt, "result_slot_id"},
                new Object[]{"browser_cookie_slots", f.slot(), "context_channel_id"},
                new Object[]{"browser_cookie_slots", f.slot(), "subject_session_id"},
                new Object[]{"browser_cookie_slots", shareSlot, "share_session_id"},
                new Object[]{"browser_cookie_slots", provisional, "attempt_id"});
        for (Object[] reference : references) {
            rejected("UPDATE " + q((String) reference[0]) + " SET " + reference[2] + "=? WHERE id=?",
                    "23503", UUID.randomUUID(), reference[1]);
        }
        for (Object[] parent : List.of(
                new Object[]{"browser_context_roots", f.root()},
                new Object[]{"browser_context_channels", f.channel()},
                new Object[]{"anonymous_subjects", f.subject()},
                new Object[]{"subject_sessions", f.session()},
                new Object[]{"subject_sessions", result.session()},
                new Object[]{"subject_recovery_credentials", f.code()},
                new Object[]{"subject_recovery_attempts", attempt},
                new Object[]{"browser_cookie_slots", result.slot()},
                new Object[]{"share_sessions", share})) {
            rejected("DELETE FROM " + q((String) parent[0]) + " WHERE id=?", "23503", parent[1]);
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace"
                + " WHERE n.nspname=? AND c.contype='f' AND (c.confdeltype<>'a' OR c.condeferrable)",
                Integer.class, schema)).isZero();
    }

    @Test
    void t1RejectsCrossContextPurposeSubjectAndResultIssuance() {
        Fixture f = fixture();
        Fixture other = fixture();
        UUID attempt = attempt(f);
        UUID provisional = slot(f.channel(), "PROVISIONAL", attempt, 0, 1);
        UUID otherAttempt = attempt(other);
        rejected("UPDATE " + q("browser_context_channels") + " SET current_slot_id=? WHERE id=?", "23503", other.slot(), f.channel());
        rejected("UPDATE " + q("browser_context_channels") + " SET current_slot_id=? WHERE id=?", "23503", provisional, f.channel());
        rejected("UPDATE " + q("browser_context_channels") + " SET pending_attempt_id=? WHERE id=?", "23503", otherAttempt, f.channel());
        rejected("UPDATE " + q("browser_cookie_slots") + " SET subject_session_id=?,credential_generation=99 WHERE id=?", "23503", other.session(), f.slot());
        rejected("UPDATE " + q("browser_cookie_slots") + " SET attempt_id=? WHERE id=?", "23503", otherAttempt, provisional);
        rejected("UPDATE " + q("subject_recovery_attempts") + " SET current_credential_id=? WHERE id=?", "23503", other.code(), attempt);
        rejected("UPDATE " + q("subject_recovery_attempts") + " SET initiating_session_id=? WHERE id=?", "23503", other.session(), attempt);
        UUID shareChannel = channel(f.root(), "SHARE");
        UUID share = shareSession(shareChannel);
        UUID shareSlot = slot(shareChannel, "SHARE", share, 0, 1);
        rejected("UPDATE " + q("subject_sessions") + " SET context_channel_id=? WHERE id=?", "23503", shareChannel, f.session());
        rejected("UPDATE " + q("share_sessions") + " SET context_channel_id=? WHERE id=?", "23503", f.channel(), share);
        rejected("UPDATE " + q("browser_context_channels") + " SET pending_attempt_id=? WHERE id=?", "23514", attempt, shareChannel);
        rejected("UPDATE " + q("browser_context_channels") + " SET current_slot_id=? WHERE id=?", "23503", shareSlot, f.channel());

        Completion result = complete(f, attempt);
        rejected("UPDATE " + q("subject_recovery_attempts") + " SET result_session_id=? WHERE id=?", "23503", other.session(), attempt);
        UUID foreignSubjectSession = session(other.subject(), f.channel());
        rejected("UPDATE " + q("subject_recovery_attempts") + " SET result_session_id=? WHERE id=?", "23503", foreignSubjectSession, attempt);
        rejected("UPDATE " + q("subject_recovery_attempts") + " SET result_slot_id=? WHERE id=?", "23503", f.slot(), attempt);
        rejected("UPDATE " + q("subject_recovery_attempts") + " SET result_context_epoch=3 WHERE id=?", "23503", attempt);
        rejected("UPDATE " + q("subject_recovery_attempts") + " SET result_session_generation=1 WHERE id=?", "23503", attempt);
        assertThat(result.slot()).isNotNull();
    }

    @ParameterizedTest
    @CsvSource({"PENDING,0,true", "PENDING,1,false", "ACTIVE,0,false", "ACTIVE,1,true",
            "DISABLED,0,true", "DISABLED,1,true", "PENDING,-1,false", "ACTIVE,-1,false",
            "DISABLED,-1,false", "UNKNOWN,0,false"})
    void t2SeparatesSubjectStateAndGeneration(String status, long generation, boolean accepted) {
        if (accepted) {
            UUID id = subject(status, generation);
            assertThat(jdbc.queryForObject("SELECT recovery_generation FROM " + q("anonymous_subjects")
                    + " WHERE id=?", Long.class, id)).isEqualTo(generation);
        } else {
            rejected("INSERT INTO " + q("anonymous_subjects")
                    + " (id,status,recovery_generation,created_at) VALUES (?,?,?,?)",
                    "23514", UUID.randomUUID(), status, generation, at(NOW));
        }
    }

    @ParameterizedTest
    @CsvSource({"subject_sessions,idle_expires_at", "subject_sessions,absolute_expires_at",
            "share_sessions,idle_expires_at", "share_sessions,absolute_expires_at",
            "subject_recovery_attempts,expires_at", "subject_recovery_attempts,receipt_expires_at",
            "browser_cookie_slots,cookie_expires_at"})
    void t2RejectsBothInfinitiesOnInsertAndUpdateAndKeepsFiniteOrdering(String table, String column) {
        Fixture f = fixture();
        UUID attempt = attempt(f);
        complete(f, attempt);
        UUID share = shareSession(channel(f.root(), "SHARE"));
        UUID id = switch (table) {
            case "subject_sessions" -> f.session();
            case "share_sessions" -> share;
            case "subject_recovery_attempts" -> attempt;
            case "browser_cookie_slots" -> f.slot();
            default -> throw new IllegalArgumentException();
        };
        assertThat(jdbc.queryForList("SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c"
                + " JOIN pg_namespace n ON n.oid=c.connamespace JOIN pg_class t ON t.oid=c.conrelid"
                + " WHERE n.nspname=? AND t.relname=? AND c.contype='c'", String.class, schema, table))
                .anyMatch(def -> def.contains("isfinite(" + column + ")"));
        List<String> columns = jdbc.queryForList("SELECT column_name FROM information_schema.columns"
                + " WHERE table_schema=? AND table_name=? ORDER BY ordinal_position", String.class, schema, table);
        for (String infinity : List.of("infinity", "-infinity")) {
            String literal = "'" + infinity + "'::timestamptz";
            rejected("UPDATE " + q(table) + " SET " + column + "=" + literal + " WHERE id=?", "23514", id);
            List<String> copied = columns.stream().map(c -> {
                if (c.equals(column)) return literal;
                if (c.equals("id") || c.equals("operation_id")) return "'" + UUID.randomUUID() + "'::uuid";
                if (c.endsWith("selector")) return "'" + UUID.randomUUID() + "'";
                if (c.endsWith("verifier")) return "decode('" + UUID.randomUUID().toString().replace("-", "") + "','hex')";
                if (table.equals("browser_cookie_slots") && c.equals("credential_generation")) return "credential_generation+1";
                return c;
            }).toList();
            rejected("INSERT INTO " + q(table) + " (" + String.join(",", columns) + ") SELECT "
                    + String.join(",", copied) + " FROM " + q(table) + " WHERE id=?", "23514", id);
        }
        if (!column.equals("receipt_expires_at")) {
            rejected("UPDATE " + q(table) + " SET " + column + "=NULL WHERE id=?", "23502", id);
        }
        rejected("UPDATE " + q(table) + " SET " + column + "=? WHERE id=?", "23514", at(NOW.minusSeconds(1)), id);
        long seconds = column.equals("absolute_expires_at") ? 10000 : 300;
        jdbc.update("UPDATE " + q(table) + " SET " + column + "=? WHERE id=?", at(NOW.plusSeconds(seconds)), id);
    }

    @Test
    void t2IsfiniteRejectsInfinityEvenWhenTemporalOrderingWouldPermitIt() {
        Fixture f = fixture();
        rejected("UPDATE " + q("subject_sessions") + " SET idle_expires_at='infinity',absolute_expires_at='infinity' WHERE id=?", "23514", f.session());
        rejected("UPDATE " + q("subject_sessions") + " SET absolute_expires_at='infinity' WHERE id=?", "23514", f.session());
        UUID attempt = attempt(f);
        assertThat(jdbc.queryForObject("SELECT receipt_expires_at IS NULL FROM " + q("subject_recovery_attempts") + " WHERE id=?", Boolean.class, attempt)).isTrue();
        rejected("UPDATE " + q("subject_recovery_attempts") + " SET expires_at='infinity' WHERE id=?", "23514", attempt);
        complete(f, attempt);
        rejected("UPDATE " + q("subject_recovery_attempts") + " SET receipt_expires_at='infinity' WHERE id=?", "23514", attempt);
        rejected("UPDATE " + q("browser_cookie_slots") + " SET cookie_expires_at='infinity' WHERE id=?", "23514", f.slot());
    }

    @Test
    void t2RejectsXorPartialResultsUnknownNegativeAndEmptyValues() {
        Fixture f = fixture();
        UUID attempt = attempt(f);
        rejected("UPDATE " + q("browser_cookie_slots") + " SET subject_session_id=NULL WHERE id=?", "23514", f.slot());
        rejected("UPDATE " + q("browser_cookie_slots") + " SET attempt_id=? WHERE id=?", "23514", attempt, f.slot());
        for (String field : List.of("credential_generation", "issued_epoch")) {
            rejected("UPDATE " + q("browser_cookie_slots") + " SET " + field + "=-1 WHERE id=?", "23514", f.slot());
        }
        rejected("UPDATE " + q("browser_context_channels") + " SET epoch=-1 WHERE id=?", "23514", f.channel());
        rejected("UPDATE " + q("subject_sessions") + " SET credential_generation=-1 WHERE id=?", "23514", f.session());
        rejected("UPDATE " + q("subject_recovery_attempts") + " SET failed_confirmations=-1 WHERE id=?", "23514", attempt);
        rejected("UPDATE " + q("subject_recovery_attempts") + " SET expected_context_epoch=0 WHERE id=?", "23514", attempt);
        rejected("UPDATE " + q("browser_cookie_slots") + " SET kind='UNKNOWN' WHERE id=?", "23514", f.slot());
        rejected("UPDATE " + q("browser_context_channels") + " SET state='UNKNOWN' WHERE id=?", "23514", f.channel());
        rejected("UPDATE " + q("browser_context_channels") + " SET state='RETIRED' WHERE id=?", "23514", f.channel());
        rejected("UPDATE " + q("subject_recovery_attempts") + " SET purpose='REPLACE_CODE',initiating_session_id=NULL,initiating_session_generation=NULL WHERE id=?", "23514", attempt);
        for (Object[] row : List.of(new Object[]{"subject_sessions", f.session()},
                new Object[]{"subject_recovery_credentials", f.code()})) {
            rejected("UPDATE " + q((String) row[0]) + " SET selector=' ' WHERE id=?", "23514", row[1]);
            rejected("UPDATE " + q((String) row[0]) + " SET secret_verifier=''::bytea WHERE id=?", "23514", row[1]);
        }
        for (String prefix : List.of("provisional", "pending")) {
            rejected("UPDATE " + q("subject_recovery_attempts") + " SET " + prefix + "_selector='' WHERE id=?", "23514", attempt);
            rejected("UPDATE " + q("subject_recovery_attempts") + " SET " + prefix + "_verifier=''::bytea WHERE id=?", "23514", attempt);
        }
        complete(f, attempt);
        List<String> resultColumns = List.of("consumed_at", "result_session_id", "result_session_generation",
                "result_slot_id", "result_context_epoch", "receipt_expires_at");
        for (int mask = 1; mask < 63; mask++) {
            List<String> nulled = new java.util.ArrayList<>();
            for (int i = 0; i < resultColumns.size(); i++) {
                if ((mask & 1 << i) != 0) nulled.add(resultColumns.get(i) + "=NULL");
            }
            rejected("UPDATE " + q("subject_recovery_attempts") + " SET " + String.join(",", nulled) + " WHERE id=?", "23514", attempt);
        }
    }

    @Test
    void t2RejectsDuplicateKeysIssuanceSelectorsVerifiersAndActiveCode() {
        Fixture f = fixture();
        UUID attempt = attempt(f);
        slot(f.channel(), "PROVISIONAL", attempt, 0, 1);
        rejected("INSERT INTO " + q("browser_context_roots") + " (id,created_at) VALUES (?,?)", "23505", f.root(), at(NOW));
        rejected("INSERT INTO " + q("browser_context_channels")
                + " (id,root_id,purpose,epoch,state,created_at) VALUES (?,?,'SUBJECT',0,'OPEN',?)", "23505", UUID.randomUUID(), f.root(), at(NOW));
        rejected("INSERT INTO " + q("browser_cookie_slots")
                + " (id,context_channel_id,purpose,kind,subject_session_id,credential_generation,issued_epoch,created_at,cookie_expires_at)"
                + " VALUES (?,?,'SUBJECT','SUBJECT',?,0,1,?,?)", "23505", UUID.randomUUID(), f.channel(), f.session(), at(NOW), at(NOW.plusSeconds(10)));
        rejected("INSERT INTO " + q("browser_cookie_slots")
                + " (id,context_channel_id,purpose,kind,attempt_id,credential_generation,issued_epoch,created_at,cookie_expires_at)"
                + " VALUES (?,?,'SUBJECT','PROVISIONAL',?,0,1,?,?)", "23505", UUID.randomUUID(), f.channel(), attempt, at(NOW), at(NOW.plusSeconds(10)));
        rejected("INSERT INTO " + q("subject_recovery_credentials")
                + " (id,subject_id,selector,secret_verifier,generation,activated_at) VALUES (?,?,?,?,2,?)",
                "23505", UUID.randomUUID(), f.subject(), "new-code", verifier(), at(NOW));
        UUID second = session(f.subject(), f.channel());
        for (String column : List.of("selector", "secret_verifier")) {
            rejected("UPDATE " + q("subject_sessions") + " SET " + column + "=(SELECT " + column + " FROM "
                    + q("subject_sessions") + " WHERE id=?) WHERE id=?", "23505", f.session(), second);
        }
        Fixture other = fixture();
        UUID otherAttempt = attempt(other);
        for (String column : List.of("operation_id", "provisional_selector", "provisional_verifier", "pending_selector", "pending_verifier")) {
            rejected("UPDATE " + q("subject_recovery_attempts") + " SET " + column + "=(SELECT " + column + " FROM "
                    + q("subject_recovery_attempts") + " WHERE id=?) WHERE id=?", "23505", attempt, otherAttempt);
        }
    }
}
