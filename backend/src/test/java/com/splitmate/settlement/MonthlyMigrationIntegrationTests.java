package com.splitmate.settlement;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import javax.sql.DataSource;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("local")
@EnabledIfEnvironmentVariable(
        named = "SPLITMATE_POSTGRES_INTEGRATION_TEST",
        matches = "true",
        disabledReason = "Requires the Docker PostgreSQL integration-test environment."
)
class MonthlyMigrationIntegrationTests {

    @Autowired
    private DataSource dataSource;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void upgradesPersistedV3EventRunAndKeepsItsChildren() {
        String schema = "monthly_migration_" + UUID.randomUUID().toString().replace("-", "");
        jdbcTemplate.execute("CREATE SCHEMA " + schema);
        try {
            Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema)
                    .locations("classpath:db/migration").target("3").load().migrate();
            UUID project = UUID.randomUUID();
            UUID payer = UUID.randomUUID();
            UUID debtor = UUID.randomUUID();
            UUID run = UUID.randomUUID();
            UUID transfer = UUID.randomUUID();
            jdbcTemplate.update("""
                    INSERT INTO %s.projects (id, public_token, name, type, currency,
                        rounding_unit, status, created_at, updated_at)
                    VALUES (?, ?, 'Event', 'EVENT', 'JPY', 10, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    """.formatted(schema), project, "A".repeat(43));
            for (UUID member : new UUID[] {payer, debtor}) {
                jdbcTemplate.update("""
                        INSERT INTO %s.project_members (id, project_id, name, display_order,
                            created_at, updated_at)
                        VALUES (?, ?, 'Member', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        """.formatted(schema), member, project, member.equals(payer) ? 1 : 2);
            }
            jdbcTemplate.update("""
                    INSERT INTO %s.settlement_runs (id, project_id, run_sequence,
                        scope_type, strategy, source_state_fingerprint, state, generated_at)
                    VALUES (?, ?, 1, 'PROJECT', 'FEWER_TRANSFERS', ?, 'CURRENT', CURRENT_TIMESTAMP)
                    """.formatted(schema), run, project, "a".repeat(64));
            jdbcTemplate.update("""
                    INSERT INTO %s.settlement_balances (id, settlement_run_id, project_id,
                        member_id, paid_amount, burden_amount, exact_balance,
                        rounded_transfer_net, rounding_difference)
                    VALUES (?, ?, ?, ?, 100, 0, 100, 100, 0)
                    """.formatted(schema), UUID.randomUUID(), run, project, payer);
            jdbcTemplate.update("""
                    INSERT INTO %s.settlement_transfers (id, settlement_run_id, project_id,
                        transfer_order, from_member_id, to_member_id, exact_amount,
                        initially_rounded_amount, final_rounded_amount, rounding_adjustment,
                        explanation_kind, from_exact_balance_before, to_exact_balance_before,
                        status)
                    VALUES (?, ?, ?, 1, ?, ?, 100, 100, 100, 0,
                        'NET_BALANCE_MATCH', -100, 100, 'OUTSTANDING')
                    """.formatted(schema), transfer, run, project, debtor, payer);

            Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema)
                    .locations("classpath:db/migration").load().migrate();

            assertThat(jdbcTemplate.queryForObject("SELECT scope_key FROM " + schema
                    + ".settlement_runs WHERE id = ?", String.class, run)).isEqualTo("PROJECT");
            assertThat(jdbcTemplate.queryForObject("SELECT run_sequence FROM " + schema
                    + ".settlement_runs WHERE id = ?", Long.class, run)).isEqualTo(1L);
            assertThat(jdbcTemplate.queryForObject("SELECT source_state_fingerprint FROM " + schema
                    + ".settlement_runs WHERE id = ?", String.class, run).trim())
                    .isEqualTo("a".repeat(64));
            assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM " + schema
                    + ".settlement_balances WHERE settlement_run_id = ?", Integer.class, run))
                    .isEqualTo(1);
            assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM " + schema
                    + ".settlement_transfers WHERE id = ? AND settlement_run_id = ?",
                    Integer.class, transfer, run)).isEqualTo(1);
            assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM " + schema
                    + ".flyway_schema_history WHERE version = '5' AND success", Integer.class))
                    .isEqualTo(1);
        } finally {
            jdbcTemplate.execute("DROP SCHEMA " + schema + " CASCADE");
        }
    }
}
