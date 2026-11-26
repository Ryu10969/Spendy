package com.splitmate.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

class IdentityMigrationIntegrationTests extends IdentityPostgresTestSupport {
    private static final List<String> LEDGER = List.of("projects", "project_members", "expenses",
            "expense_participants", "settlement_runs", "settlement_balances", "settlement_transfers");

    @Test
    void t8MigratesAnEmptySchemaAndValidatesAllSixChecksumsWithoutReplay() {
        // This schema was created by this test's setup and contains no external data.
        jdbc.execute("DROP SCHEMA " + schema + " CASCADE");
        var first = flyway(null).migrate();
        assertThat(first.migrationsExecuted).isEqualTo(6);
        flyway(null).validate();
        assertThat(flyway(null).migrate().migrationsExecuted).isZero();
        assertThat(flyway(null).info().applied()).filteredOn(migration -> migration.getVersion() != null).hasSize(6);
        for (String table : TABLES) {
            assertThat(jdbc.queryForObject("SELECT count(*) FROM " + q(table), Integer.class)).isZero();
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM information_schema.columns WHERE table_schema=?"
                + " AND table_name='projects' AND column_name='administrator_subject_id'", Integer.class, schema)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM " + q("flyway_schema_history")
                + " WHERE version IN ('1','2','3','4','5','6') AND checksum IS NOT NULL AND success", Integer.class)).isEqualTo(6);
    }

    @Test
    void t8ExpandsPopulatedV5WithoutChangingAnyLedgerDefinitionDataOrChecksum() {
        jdbc.execute("DROP SCHEMA " + schema + " CASCADE");
        assertThat(flyway("5").migrate().migrationsExecuted).isEqualTo(5);
        seedFinancialHistory("EVENT", true, false);
        seedFinancialHistory("CONTINUOUS", false, true);
        List<String> data = ledgerData();
        List<String> definitions = ledgerDefinitions();
        List<String> checksums = history();
        List<String> tablesBefore = tableNames();

        assertThat(flyway(null).migrate().migrationsExecuted).isEqualTo(1);
        assertThat(ledgerData()).isEqualTo(data);
        assertThat(ledgerDefinitions()).isEqualTo(definitions);
        assertThat(history().subList(0, 5)).isEqualTo(checksums);
        assertThat(tableNames().stream().filter(name -> !tablesBefore.contains(name)).toList())
                .containsExactlyInAnyOrderElementsOf(TABLES);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM " + q("settlement_runs") + " WHERE state='CURRENT'", Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM " + q("settlement_runs") + " WHERE state='STALE'", Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM " + q("projects") + " WHERE archived_at IS NOT NULL", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM " + q("projects") + " WHERE deleted_at IS NOT NULL", Integer.class)).isEqualTo(1);
        flyway(null).validate();
        assertThat(flyway(null).migrate().migrationsExecuted).isZero();
        assertThat(ledgerData()).isEqualTo(data);
        assertThat(ledgerDefinitions()).isEqualTo(definitions);
    }

    private void seedFinancialHistory(String type, boolean archived, boolean deleted) {
        UUID project = insert("projects", values("public_token", UUID.randomUUID().toString().replace("-", "") + "A".repeat(11),
                "name", "Fictional " + type, "type", type, "currency", "JPY", "rounding_unit", 10,
                "status", archived ? "ARCHIVED" : "ACTIVE", "archived_at", archived ? at(NOW.plusSeconds(1)) : null,
                "deleted_at", deleted ? at(NOW.plusSeconds(2)) : null, "version", 7L,
                "created_at", at(NOW), "updated_at", at(NOW)));
        UUID payer = insert("project_members", values("project_id", project, "name", "Fixture payer", "display_order", 1,
                "active", true, "created_at", at(NOW), "updated_at", at(NOW)));
        UUID debtor = insert("project_members", values("project_id", project, "name", "Fixture participant", "display_order", 2,
                "active", false, "created_at", at(NOW), "updated_at", at(NOW)));
        UUID expense = insert("expenses", values("project_id", project, "payer_member_id", payer, "amount", 100L,
                "content", "Fictional shared purchase", "category", "FOOD", "note", "P1b fixture only",
                "paid_on", java.sql.Date.valueOf("2026-11-06"), "version", 3L, "created_at", at(NOW), "updated_at", at(NOW)));
        int order = 0;
        for (UUID member : List.of(payer, debtor)) {
            insert("expense_participants", values("expense_id", expense, "member_id", member,
                    "allocated_share", 50L, "allocation_order", ++order));
        }
        for (int sequence = 1; sequence <= 2; sequence++) {
            boolean stale = sequence == 1;
            UUID run = insert("settlement_runs", values("project_id", project, "run_sequence", sequence,
                    "scope_type", type.equals("EVENT") ? "PROJECT" : "YEAR_MONTH",
                    "scope_key", type.equals("EVENT") ? "PROJECT" : "2026-11",
                    "strategy", "FEWER_TRANSFERS", "source_state_fingerprint", (stale ? "a" : "b").repeat(64),
                    "state", stale ? "STALE" : "CURRENT", "generated_at", at(NOW),
                    "staled_at", stale ? at(NOW.plusSeconds(1)) : null));
            for (UUID member : List.of(payer, debtor)) {
                long exact = member.equals(payer) ? 50 : -50;
                insert("settlement_balances", values("settlement_run_id", run, "project_id", project,
                        "member_id", member, "paid_amount", member.equals(payer) ? 100L : 0L,
                        "burden_amount", 50L, "exact_balance", exact, "rounded_transfer_net", exact, "rounding_difference", 0L));
            }
            insert("settlement_transfers", values("settlement_run_id", run, "project_id", project, "transfer_order", 1,
                    "from_member_id", debtor, "to_member_id", payer, "exact_amount", 50L,
                    "initially_rounded_amount", 50L, "final_rounded_amount", 50L, "rounding_adjustment", 0L,
                    "explanation_kind", "NET_BALANCE_MATCH", "from_exact_balance_before", -50L,
                    "to_exact_balance_before", 50L, "status", stale ? "COMPLETED" : "OUTSTANDING",
                    "completed_at", stale ? at(NOW.plusSeconds(1)) : null));
        }
    }

    private List<String> ledgerData() {
        return LEDGER.stream().flatMap(table -> jdbc.queryForList("SELECT row_to_json(t)::text FROM "
                + q(table) + " t ORDER BY id", String.class).stream()).toList();
    }

    private List<String> history() {
        return jdbc.queryForList("SELECT version||':'||checksum||':'||script||':'||success FROM "
                + q("flyway_schema_history") + " WHERE version IS NOT NULL ORDER BY installed_rank", String.class);
    }

    private List<String> tableNames() {
        return jdbc.queryForList("SELECT table_name FROM information_schema.tables WHERE table_schema=?"
                + " AND table_type='BASE TABLE' ORDER BY table_name", String.class, schema);
    }

    private List<String> ledgerDefinitions() {
        List<String> result = new ArrayList<>();
        for (String table : LEDGER) {
            result.addAll(jdbc.queryForList("SELECT row_to_json(t)::text FROM (SELECT column_name,ordinal_position,"
                    + "column_default,is_nullable,data_type,udt_name,character_maximum_length FROM information_schema.columns"
                    + " WHERE table_schema=? AND table_name=? ORDER BY ordinal_position) t", String.class, schema, table));
            result.addAll(jdbc.queryForList("SELECT indexdef FROM pg_indexes WHERE schemaname=? AND tablename=? ORDER BY indexname",
                    String.class, schema, table));
            result.addAll(jdbc.queryForList("SELECT c.conname||':'||pg_get_constraintdef(c.oid) FROM pg_constraint c"
                    + " JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace"
                    + " WHERE n.nspname=? AND t.relname=? ORDER BY c.conname", String.class, schema, table));
        }
        return result;
    }
}
