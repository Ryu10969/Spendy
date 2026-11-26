package com.splitmate.demo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.exception.FlywayValidateException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

@EnabledIfEnvironmentVariable(named = "SPLITMATE_POSTGRES_INTEGRATION_TEST", matches = "true")
class DemoBootstrapIntegrationTests {
    private JdbcTemplate admin;
    private String database;
    private DriverManagerDataSource source;
    private JdbcTemplate jdbc;

    @BeforeEach
    void createDisposableDatabase() {
        String port = System.getenv("SPLITMATE_P1B_TEST_PORT");
        String testDatabase = System.getenv("SPLITMATE_P1B_TEST_DATABASE");
        String prefix = "jdbc:postgresql://127.0.0.1:" + port + "/";
        String url = System.getenv("SPRING_DATASOURCE_URL");
        assertThat(port).matches("[0-9]{4,5}").isNotEqualTo("5432");
        assertThat(testDatabase).matches("p1b_[a-f0-9]{16}");
        assertThat(url).isEqualTo(prefix + testDatabase);
        String username = System.getenv("SPRING_DATASOURCE_USERNAME");
        String password = System.getenv("SPRING_DATASOURCE_PASSWORD");
        admin = new JdbcTemplate(new DriverManagerDataSource(url, username, password));
        assertThat(admin.queryForObject("SELECT current_database()", String.class)).isEqualTo(testDatabase);
        database = "demo_preflight_" + UUID.randomUUID().toString().replace("-", "");
        admin.execute("CREATE DATABASE " + database + " TEMPLATE template0");
        source = new DriverManagerDataSource(prefix + database, username, password);
        jdbc = new JdbcTemplate(source);
    }

    @AfterEach
    void dropDisposableDatabase() {
        if (database != null) admin.execute("DROP DATABASE " + database);
    }

    @Test
    void initializesAnEmptyDatabaseAndAcceptsCompletedDemoWithoutRewritingEdits() throws Exception {
        DemoDatabase.bootstrap(source);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM flyway_schema_history WHERE success", Integer.class)).isEqualTo(6);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM expenses", Integer.class)).isEqualTo(5);
        jdbc.update("UPDATE projects SET description = 'edited demo'");
        var before = snapshot();
        DemoDatabase.bootstrap(source);
        assertThat(snapshot()).isEqualTo(before);
    }

    @Test
    void refusesV5WithExistingProjectBeforeV6OrAnyOtherWrite() {
        Flyway.configure().dataSource(source).target("5").load().migrate();
        jdbc.update("""
                INSERT INTO projects(id, public_token, name, type, currency, rounding_unit, status, created_at, updated_at)
                VALUES (gen_random_uuid(), ?, 'existing ledger', 'CONTINUOUS', 'JPY', 1, 'ACTIVE', now(), now())
                """, "a".repeat(43));
        assertRefusedWithoutChanges();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM flyway_schema_history", Integer.class)).isEqualTo(5);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM projects", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT to_regclass('public.anonymous_subjects')::text", String.class)).isNull();
    }

    @Test
    void refusesUnrecognizedSchemaAndIncompleteSeedWithoutChanges() {
        jdbc.execute("CREATE SCHEMA unrecognized");
        assertRefusedWithoutChanges();
        jdbc.execute("DROP SCHEMA unrecognized");
        Flyway.configure().dataSource(source).target("6").load().migrate();
        assertRefusedWithoutChanges();
    }

    @Test
    void refusesUnknownIdentityDataAndAnInvalidCompletedHistoryWithoutChanges() throws Exception {
        DemoDatabase.bootstrap(source);
        jdbc.update("INSERT INTO browser_context_roots VALUES (gen_random_uuid(), now())");
        assertRefusedWithoutChanges();
        jdbc.update("DELETE FROM browser_context_roots");
        jdbc.update("UPDATE flyway_schema_history SET checksum = checksum + 1 WHERE version = '5'");
        var before = snapshot();
        assertThatThrownBy(() -> DemoDatabase.bootstrap(source)).isInstanceOf(FlywayValidateException.class);
        assertThat(snapshot()).isEqualTo(before);
    }

    @Test
    void refusesLargeObjectsInOtherwiseEmptyOrCompletedDatabaseWithoutChanges() throws Exception {
        Long oid = jdbc.queryForObject("SELECT lo_from_bytea(0, decode('010203', 'hex'))::bigint", Long.class);
        assertRefusedWithoutChanges();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM pg_tables WHERE schemaname = 'public'", Integer.class)).isZero();
        jdbc.queryForObject("SELECT lo_unlink(?::oid)", Integer.class, oid);

        DemoDatabase.bootstrap(source);
        jdbc.queryForObject("SELECT lo_from_bytea(0, decode('040506', 'hex'))::bigint", Long.class);
        assertRefusedWithoutChanges();
    }

    @Test
    void refusesCompletedDemoWithMissingColumnOrChangedColumnAndConstraintDefinitions() throws Exception {
        DemoDatabase.bootstrap(source);
        jdbc.execute("ALTER TABLE projects DROP COLUMN description");
        assertRefusedWithoutChanges();
        jdbc.execute("ALTER TABLE projects ADD COLUMN description varchar(1000)");
        DemoDatabase.bootstrap(source);

        jdbc.execute("ALTER TABLE projects ALTER COLUMN description TYPE text");
        assertRefusedWithoutChanges();
        jdbc.execute("ALTER TABLE projects ALTER COLUMN description TYPE varchar(1000)");
        jdbc.execute("ALTER TABLE projects ALTER COLUMN name DROP NOT NULL");
        assertRefusedWithoutChanges();
        jdbc.execute("ALTER TABLE projects ALTER COLUMN name SET NOT NULL");
        jdbc.execute("ALTER TABLE projects DROP CONSTRAINT chk_projects_currency");
        assertRefusedWithoutChanges();
    }

    @Test
    void refusesPublicationInOtherwiseEmptyDatabaseWithoutChanges() {
        jdbc.execute("CREATE PUBLICATION demo_unexpected");
        assertRefusedWithoutChanges();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM pg_tables WHERE schemaname = 'public'", Integer.class)).isZero();
    }

    @Test
    void refusesCompletedDemoWithRowSecurityOrPolicyWithoutChanges() throws Exception {
        DemoDatabase.bootstrap(source);
        jdbc.execute("ALTER TABLE projects ENABLE ROW LEVEL SECURITY");
        assertRefusedWithoutChanges();
        jdbc.execute("ALTER TABLE projects DISABLE ROW LEVEL SECURITY");
        jdbc.execute("ALTER TABLE projects FORCE ROW LEVEL SECURITY");
        assertRefusedWithoutChanges();
        jdbc.execute("ALTER TABLE projects NO FORCE ROW LEVEL SECURITY");
        jdbc.execute("CREATE POLICY demo_unexpected ON projects USING (false)");
        assertRefusedWithoutChanges();
    }

    @Test
    void refusesCompletedDemoWithDisabledForeignKeyTriggersWithoutChanges() throws Exception {
        DemoDatabase.bootstrap(source);
        jdbc.execute("ALTER TABLE project_members DISABLE TRIGGER ALL");
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM pg_trigger t JOIN pg_constraint c ON c.oid = t.tgconstraint
                WHERE t.tgrelid = 'public.project_members'::regclass AND c.contype = 'f' AND t.tgenabled = 'D'
                """, Integer.class)).isPositive();
        assertRefusedWithoutChanges();
    }

    private void assertRefusedWithoutChanges() {
        var before = snapshot();
        assertThatThrownBy(() -> DemoDatabase.bootstrap(source))
                .isInstanceOf(SQLException.class).hasMessageContaining("completed demo ledger");
        assertThat(snapshot()).isEqualTo(before);
    }

    private Map<String, Object> snapshot() {
        var state = new LinkedHashMap<String, Object>();
        state.put("namespaces", jdbc.queryForList("SELECT nspname FROM pg_namespace ORDER BY nspname", String.class));
        state.put("relations", jdbc.queryForList("""
                SELECT relname, relkind, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace ORDER BY relname
                """));
        state.put("publications", jdbc.queryForList("SELECT * FROM pg_publication ORDER BY pubname"));
        state.put("policies", jdbc.queryForList("""
                SELECT p.oid, p.polname, pg_get_expr(p.polqual, p.polrelid) AS using_expr
                FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                WHERE c.relnamespace = 'public'::regnamespace ORDER BY p.oid
                """));
        state.put("triggers", jdbc.queryForList("""
                SELECT t.oid, t.tgenabled, pg_get_triggerdef(t.oid)
                FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
                WHERE c.relnamespace = 'public'::regnamespace ORDER BY t.oid
                """));
        state.put("columns", jdbc.queryForList("""
                SELECT table_name, column_name, data_type, column_default, is_nullable
                FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position
                """));
        state.put("constraints", jdbc.queryForList("""
                SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
                WHERE connamespace = 'public'::regnamespace ORDER BY conname
                """));
        for (String table : jdbc.queryForList("SELECT tablename FROM pg_tables WHERE schemaname = 'public'", String.class)) {
            state.put(table, jdbc.queryForList("SELECT row_to_json(t)::text FROM public." + table + " t ORDER BY 1", String.class));
        }
        state.put("largeObjects", jdbc.queryForList("""
                SELECT oid, lomowner, lomacl, encode(lo_get(oid), 'hex') AS contents
                FROM pg_largeobject_metadata ORDER BY oid
                """));
        return state;
    }
}
