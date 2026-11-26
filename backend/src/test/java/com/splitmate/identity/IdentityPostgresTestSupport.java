package com.splitmate.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;

import javax.sql.DataSource;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContextInitializer;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest
@ActiveProfiles("local")
@ContextConfiguration(initializers = IdentityPostgresTestSupport.IsolatedDatabase.class)
@EnabledIfEnvironmentVariable(named = "SPLITMATE_POSTGRES_INTEGRATION_TEST", matches = "true")
abstract class IdentityPostgresTestSupport {

    static final Instant NOW = Instant.parse("2026-11-06T00:00:00Z");
    static final UUID A = UUID.fromString("7fffffff-ffff-4fff-8000-000000000000");
    static final UUID B = UUID.fromString("80000000-0000-4000-8000-000000000000");
    static final List<String> TABLES = List.of("anonymous_subjects", "browser_context_roots",
            "browser_context_channels", "subject_sessions", "share_sessions",
            "subject_recovery_credentials", "subject_recovery_attempts", "browser_cookie_slots");

    @Autowired DataSource dataSource;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactionManager;

    String schema;

    /** Runs before datasource/Flyway auto-configuration, never using local-profile defaults. */
    public static final class IsolatedDatabase implements ApplicationContextInitializer<ConfigurableApplicationContext> {
        @Override
        public void initialize(ConfigurableApplicationContext context) {
            String db = required("SPLITMATE_P1B_TEST_DATABASE");
            String port = required("SPLITMATE_P1B_TEST_PORT");
            String url = required("SPRING_DATASOURCE_URL");
            if (!db.matches("p1b_[a-f0-9]{16}") || !port.matches("[0-9]{4,5}")
                    || port.equals("5432") || !url.equals("jdbc:postgresql://127.0.0.1:" + port + "/" + db)) {
                throw new IllegalStateException("P1b requires the explicitly verified isolated loopback database.");
            }
            try (var connection = DriverManager.getConnection(url, required("SPRING_DATASOURCE_USERNAME"),
                    required("SPRING_DATASOURCE_PASSWORD")); var statement = connection.createStatement();
                    var rows = statement.executeQuery("SELECT current_database(), current_setting('server_version_num')::int")) {
                if (!rows.next() || !rows.getString(1).equals(db)
                        || rows.getInt(2) < 170000 || rows.getInt(2) >= 180000) {
                    throw new IllegalStateException("P1b requires the designated PostgreSQL 17 database.");
                }
            } catch (SQLException failure) {
                throw new IllegalStateException("Could not verify the isolated P1b database.", failure);
            }
        }

        private static String required(String name) {
            String value = System.getenv(name);
            if (value == null || value.isBlank()) {
                throw new IllegalStateException("Missing explicit P1b test setting: " + name);
            }
            return value;
        }
    }

    @BeforeEach
    void createFixtureSchema() {
        schema = "identity_test_" + UUID.randomUUID().toString().replace("-", "");
        flyway(null).migrate();
    }

    @AfterEach
    void removeOwnFixtureSchema() {
        if (schema != null && schema.matches("identity_test_[a-f0-9]{32}")) {
            jdbc.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        }
    }

    Flyway flyway(String target) {
        var configuration = Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema)
                .locations("classpath:db/migration");
        if (target != null) {
            configuration.target(target);
        }
        return configuration.load();
    }

    String q(String table) {
        if (!table.matches("[a-z_]+")) {
            throw new IllegalArgumentException("Invalid test table.");
        }
        return schema + "." + table;
    }

    <T> T tx(Supplier<T> operation) {
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        transaction.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        transaction.setTimeout(15);
        return transaction.execute(status -> {
            jdbc.execute("SET LOCAL search_path TO " + schema);
            jdbc.execute("SET LOCAL lock_timeout = '5s'");
            return operation.get();
        });
    }

    UUID insert(String table, Map<String, Object> values) {
        Map<String, Object> columns = new LinkedHashMap<>(values);
        columns.putIfAbsent("id", UUID.randomUUID());
        String marks = String.join(",", java.util.Collections.nCopies(columns.size(), "?"));
        jdbc.update("INSERT INTO " + q(table) + " (" + String.join(",", columns.keySet())
                + ") VALUES (" + marks + ")", columns.values().toArray());
        return (UUID) columns.get("id");
    }

    Map<String, Object> values(Object... pairs) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) {
            result.put((String) pairs[i], pairs[i + 1]);
        }
        return result;
    }

    UUID subject(String status, long generation) {
        return insert("anonymous_subjects", values("status", status, "recovery_generation", generation, "created_at", at(NOW)));
    }

    UUID root() {
        return insert("browser_context_roots", values("created_at", at(NOW)));
    }

    UUID channel(UUID root, String purpose) {
        return insert("browser_context_channels", values("root_id", root, "purpose", purpose,
                "epoch", 1L, "state", "OPEN", "created_at", at(NOW)));
    }

    UUID session(UUID subject, UUID channel) {
        return insert("subject_sessions", sessionValues(subject, channel));
    }

    Map<String, Object> sessionValues(UUID subject, UUID channel) {
        return values("subject_id", subject, "context_channel_id", channel,
                "selector", UUID.randomUUID().toString(), "secret_verifier", verifier(),
                "credential_generation", 0L, "created_at", at(NOW),
                "idle_expires_at", at(NOW.plusSeconds(3600)), "absolute_expires_at", at(NOW.plusSeconds(7200)));
    }

    UUID shareSession(UUID channel) {
        return insert("share_sessions", values("context_channel_id", channel,
                "selector", UUID.randomUUID().toString(), "secret_verifier", verifier(),
                "credential_generation", 0L, "created_at", at(NOW),
                "idle_expires_at", at(NOW.plusSeconds(3600)), "absolute_expires_at", at(NOW.plusSeconds(7200))));
    }

    UUID credential(UUID subject, long generation) {
        return insert("subject_recovery_credentials", values("subject_id", subject,
                "selector", UUID.randomUUID().toString(), "secret_verifier", verifier(),
                "generation", generation, "activated_at", at(NOW)));
    }

    UUID slot(UUID channel, String kind, UUID owner, long generation, long epoch) {
        String purpose = kind.equals("SHARE") ? "SHARE" : "SUBJECT";
        String ownerColumn = switch (kind) {
            case "SUBJECT" -> "subject_session_id";
            case "SHARE" -> "share_session_id";
            case "PROVISIONAL" -> "attempt_id";
            default -> throw new IllegalArgumentException("Unknown test slot kind.");
        };
        return insert("browser_cookie_slots", values("context_channel_id", channel, "purpose", purpose,
                "kind", kind, ownerColumn, owner, "credential_generation", generation, "issued_epoch", epoch,
                "created_at", at(NOW), "cookie_expires_at", at(NOW.plusSeconds(3600))));
    }

    Fixture fixture() {
        UUID root = root();
        UUID subject = subject("ACTIVE", 1);
        UUID channel = channel(root, "SUBJECT");
        UUID session = session(subject, channel);
        UUID code = credential(subject, 1);
        UUID slot = slot(channel, "SUBJECT", session, 0, 1);
        jdbc.update("UPDATE " + q("browser_context_channels") + " SET current_slot_id=? WHERE id=?", slot, channel);
        return new Fixture(root, subject, channel, session, code, slot);
    }

    UUID attempt(Fixture f) {
        UUID attempt = insert("subject_recovery_attempts", values("subject_id", f.subject(),
                "context_channel_id", f.channel(), "purpose", "ADD_DEVICE", "expected_generation", 1L,
                "current_credential_id", f.code(), "provisional_selector", UUID.randomUUID().toString(),
                "provisional_verifier", verifier(), "pending_selector", UUID.randomUUID().toString(),
                "pending_verifier", verifier(), "operation_id", UUID.randomUUID(),
                "initiating_session_id", f.session(), "initiating_session_generation", 0L,
                "switch_intent", false, "expected_context_epoch", 1L,
                "created_at", at(NOW), "expires_at", at(NOW.plusSeconds(600))));
        jdbc.update("UPDATE " + q("browser_context_channels") + " SET pending_attempt_id=? WHERE id=?", attempt, f.channel());
        return attempt;
    }

    Completion complete(Fixture f, UUID attempt) {
        return tx(() -> {
            jdbc.update("UPDATE " + q("subject_recovery_credentials") + " SET consumed_at=? WHERE id=?", at(NOW.plusSeconds(1)), f.code());
            UUID newCode = credential(f.subject(), 2);
            UUID session = session(f.subject(), f.channel());
            UUID slot = slot(f.channel(), "SUBJECT", session, 0, 2);
            jdbc.update("UPDATE " + q("anonymous_subjects") + " SET recovery_generation=2 WHERE id=?", f.subject());
            jdbc.update("UPDATE " + q("browser_cookie_slots") + " SET terminal_at=? WHERE id=?", at(NOW.plusSeconds(1)), f.slot());
            jdbc.update("UPDATE " + q("browser_cookie_slots") + " SET terminal_at=? WHERE attempt_id=?", at(NOW.plusSeconds(1)), attempt);
            jdbc.update("UPDATE " + q("subject_recovery_attempts")
                    + " SET consumed_at=?,result_session_id=?,result_session_generation=0,result_slot_id=?,"
                    + "result_context_epoch=2,receipt_expires_at=? WHERE id=?",
                    at(NOW.plusSeconds(1)), session, slot, at(NOW.plusSeconds(300)), attempt);
            jdbc.update("UPDATE " + q("browser_context_channels")
                    + " SET current_slot_id=?,pending_attempt_id=NULL,epoch=2 WHERE id=?", slot, f.channel());
            return new Completion(session, slot, newCode);
        });
    }

    List<String> snapshot() {
        return TABLES.stream().flatMap(table -> jdbc.queryForList(
                "SELECT row_to_json(t)::text FROM " + q(table) + " t ORDER BY id", String.class).stream()).toList();
    }

    void rejected(String sql, String state, Object... args) {
        List<String> before = snapshot();
        assertThatThrownBy(() -> tx(() -> jdbc.update(sql, args)))
                .satisfies(failure -> assertThat(sqlState(failure)).isEqualTo(state));
        assertThat(snapshot()).isEqualTo(before);
    }

    static String sqlState(Throwable failure) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sql) {
                return sql.getSQLState();
            }
        }
        return null;
    }

    static Timestamp at(Instant instant) {
        return Timestamp.from(instant);
    }

    static byte[] verifier() {
        return UUID.randomUUID().toString().getBytes(java.nio.charset.StandardCharsets.US_ASCII);
    }

    record Fixture(UUID root, UUID subject, UUID channel, UUID session, UUID code, UUID slot) { }
    record Completion(UUID session, UUID slot, UUID code) { }
}
