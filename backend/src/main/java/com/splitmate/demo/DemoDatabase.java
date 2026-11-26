package com.splitmate.demo;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import javax.sql.DataSource;

import org.flywaydb.core.Flyway;
import org.springframework.core.env.Environment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

final class DemoDatabase {
    private static final String MIGRATOR = "spendingmate_demo_migrator";
    private static final String RUNTIME = "spendingmate_demo_runtime";

    private static final Set<String> IDENTITY_TABLES = Set.of("browser_context_roots", "browser_context_channels",
            "anonymous_subjects", "subject_sessions", "share_sessions", "subject_recovery_credentials",
            "subject_recovery_attempts", "browser_cookie_slots");
    private static final Set<String> LEDGER_TABLES = Set.of("projects", "project_members", "expenses",
            "expense_participants", "settlement_runs", "settlement_balances", "settlement_transfers",
            "flyway_schema_history", "demo_seed");

    // Catalog fingerprint of V1–V6, Flyway history and the demo seed receipt on a clean DB.
    private static final String COMPLETED_SCHEMA = "312fbe9559d736bdbe86249ae4819049ed103e3f9e947790e25fe231a85455fa";

    private DemoDatabase() {}

    static DataSource dataSource(Environment env, boolean bootstrap) {
        boolean local = "local-test".equals(env.getProperty("DEMO_DB_TARGET"));
        if (!local && !"neon".equals(env.getProperty("DEMO_DB_TARGET"))) {
            throw new IllegalStateException("Demo database target must be explicitly selected.");
        }
        if (local && env.getProperty("RENDER") != null) {
            throw new IllegalStateException("Local demo database is forbidden on Render.");
        }

        String host = env.getProperty("DEMO_DB_HOST", "");
        String db = env.getProperty("DEMO_DB_NAME", "");
        if (local ? !host.equals("demo-postgres") || !db.equals("spendingmate_demo_test")
                : !host.matches("ep-[a-z0-9-]+\\.[a-z0-9.-]+\\.neon\\.tech")
                    || host.contains("-pooler.") || !db.equals("spendingmate_demo")) {
            throw new IllegalStateException("Demo database endpoint is outside the approved target.");
        }

        String marker = env.getProperty("DEMO_DB_ID", "");
        if (!marker.matches("[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}")) {
            throw new IllegalStateException("Demo database ID must be a random UUID v4.");
        }
        String role = bootstrap ? MIGRATOR : RUNTIME;
        String password = env.getProperty(bootstrap ? "DEMO_DB_MIGRATOR_PASSWORD" : "DEMO_DB_RUNTIME_PASSWORD", "");
        if (password.isBlank()) {
            throw new IllegalStateException("Demo database credential is required.");
        }
        String trust = local ? "sslrootcert=/run/demo-tls/ca.crt" : "sslfactory=org.postgresql.ssl.DefaultJavaSSLFactory";
        String url = "jdbc:postgresql://" + host + ":5432/" + db
                + "?sslmode=verify-full&" + trust + "&connectTimeout=5&socketTimeout=15&currentSchema=public";

        return new DriverManagerDataSource(url, role, password) {
            @Override
            protected Connection getConnectionFromDriver(java.util.Properties properties) throws SQLException {
                Connection connection = super.getConnectionFromDriver(properties);
                try {
                    verify(connection, db, UUID.fromString(marker), role, bootstrap);
                    return connection;
                } catch (SQLException | RuntimeException failure) {
                    connection.close();
                    throw failure;
                }
            }
        };
    }

    private static void verify(Connection connection, String db, UUID marker, String role, boolean bootstrap)
            throws SQLException {
        try (var statement = connection.createStatement();
             var rows = statement.executeQuery("""
                 SELECT current_database(), current_user, shobj_description(pg_database.oid, 'pg_database'),
                        has_schema_privilege(current_user, 'public', 'CREATE'),
                        pg_has_role(current_user, 'spendingmate_demo_migrator', 'MEMBER'),
                        datdba = role.oid,
                        role.rolsuper OR role.rolcreatedb OR role.rolcreaterole,
                        has_database_privilege(current_user, current_database(), 'CREATE,TEMP')
                 FROM pg_database JOIN pg_roles role ON role.rolname = current_user
                 WHERE datname = current_database()
                 """)) {
            if (!rows.next() || !db.equals(rows.getString(1)) || !role.equals(rows.getString(2))
                    || !("spendingmate-demo:" + marker).equals(rows.getString(3))
                    || rows.getBoolean(4) != bootstrap || rows.getBoolean(5) != bootstrap
                    || rows.getBoolean(6) != bootstrap || rows.getBoolean(7)
                    || (!bootstrap && rows.getBoolean(8))) {
                throw new SQLException("Demo database identity or privilege check failed.");
            }
        }
        if (!bootstrap) {
            try (var statement = connection.createStatement();
                 var rows = statement.executeQuery("""
                     SELECT seed_version FROM public.demo_seed
                     WHERE seed_version = 1
                       AND NOT has_table_privilege(current_user, 'public.demo_seed', 'INSERT,UPDATE,DELETE,TRUNCATE')
                       AND NOT has_table_privilege(current_user, 'public.flyway_schema_history', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
                       AND NOT has_table_privilege(current_user, 'public.anonymous_subjects', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
                     """)) {
                if (!rows.next()) {
                    throw new SQLException("Demo database bootstrap is incomplete.");
                }
            }
        }
    }

    static void bootstrap(Environment env) throws IOException, SQLException {
        bootstrap(dataSource(env, true));
    }

    static void bootstrap(DataSource source) throws IOException, SQLException {
        // Serialize the entire bootstrap, including Flyway, across concurrent invocations.
        try (var lock = source.getConnection(); var statement = lock.createStatement()) {
            statement.execute("SELECT pg_advisory_lock(528119065)");
            boolean empty = checkBootstrapState(statement);
            var flyway = Flyway.configure().dataSource(source).target("6").cleanDisabled(true)
                    .ignoreMigrationPatterns(new String[0]).load();
            if (!empty) {
                flyway.validate();
                return;
            }
            flyway.migrate();
            lock.setAutoCommit(false);
            statement.execute(new ClassPathResource("demo/seed.sql").getContentAsString(StandardCharsets.UTF_8));
            lock.commit();
        }
    }

    private static boolean checkBootstrapState(Statement statement) throws SQLException {
        // A completed demo can contain reviewer edits. Only the seed receipt and complete,
        // validated migration history identify it as an allowed rerun.
        try (var rows = statement.executeQuery("""
                SELECT EXISTS (SELECT FROM pg_largeobject_metadata)
                    OR EXISTS (SELECT FROM pg_publication)
                    OR EXISTS (SELECT FROM pg_namespace
                    WHERE nspname NOT IN ('public', 'information_schema') AND nspname !~ '^pg_')
                    OR EXISTS (SELECT FROM pg_proc WHERE pronamespace = 'public'::regnamespace)
                    OR EXISTS (SELECT FROM pg_type WHERE typnamespace = 'public'::regnamespace
                        AND typrelid = 0 AND NOT (typcategory = 'A' AND typelem <> 0))
                    OR EXISTS (SELECT FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace
                        AND (c.relrowsecurity OR c.relforcerowsecurity))
                    OR EXISTS (SELECT FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                        WHERE c.relnamespace = 'public'::regnamespace)
                    OR EXISTS (SELECT FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
                        WHERE c.relnamespace = 'public'::regnamespace
                            AND (NOT t.tgisinternal OR t.tgenabled <> 'O'))
                """)) {
            if (!rows.next() || rows.getBoolean(1)) {
                throw unrecognizedState();
            }
        }
        var tables = new HashSet<String>();
        try (var rows = statement.executeQuery("""
                SELECT relname, relkind FROM pg_class
                WHERE relnamespace = 'public'::regnamespace AND relkind <> 'i'
                """)) {
            while (rows.next()) {
                if (!"r".equals(rows.getString(2))) {
                    throw unrecognizedState();
                }
                tables.add(rows.getString(1));
            }
        }
        if (tables.isEmpty()) {
            return true;
        }
        var expected = new HashSet<>(LEDGER_TABLES);
        expected.addAll(IDENTITY_TABLES);
        if (!tables.equals(expected) || !COMPLETED_SCHEMA.equals(schemaFingerprint(statement))) {
            throw unrecognizedState();
        }
        try (var rows = statement.executeQuery("""
                SELECT (SELECT array_agg(version ORDER BY installed_rank) FROM public.flyway_schema_history)
                        = ARRAY['1','2','3','4','5','6']::varchar[]
                    AND (SELECT bool_and(success) FROM public.flyway_schema_history)
                    AND (SELECT array_agg(seed_version) FROM public.demo_seed) = ARRAY[1]
                """)) {
            if (!rows.next() || !rows.getBoolean(1)) {
                throw unrecognizedState();
            }
        }
        for (String table : IDENTITY_TABLES) {
            try (var rows = statement.executeQuery("SELECT EXISTS (SELECT FROM public." + table + ")")) {
                if (!rows.next() || rows.getBoolean(1)) {
                    throw unrecognizedState();
                }
            }
        }
        return false;
    }

    private static String schemaFingerprint(Statement statement) throws SQLException {
        // Column nullability comes from pg_attribute on both PostgreSQL 17 and 18.
        try (var rows = statement.executeQuery("""
                SELECT encode(sha256(convert_to(string_agg(entry, E'\\n' ORDER BY entry COLLATE "C"), 'UTF8')), 'hex')
                FROM (
                    SELECT jsonb_build_array('column', c.relname, a.attname,
                        format_type(a.atttypid, a.atttypmod), a.attnotnull)::text AS entry
                    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
                    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
                        AND a.attnum > 0 AND NOT a.attisdropped
                    UNION ALL
                    SELECT jsonb_build_array('constraint', c.relname, k.conname,
                        pg_get_constraintdef(k.oid), k.convalidated)::text
                    FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
                    WHERE c.relnamespace = 'public'::regnamespace AND k.contype IN ('p', 'u', 'f', 'c', 'x')
                    UNION ALL
                    SELECT jsonb_build_array('unique index', pg_get_indexdef(i.indexrelid), i.indisvalid)::text
                    FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid
                    WHERE c.relnamespace = 'public'::regnamespace AND i.indisunique
                ) AS schema_entries
                """)) {
            rows.next();
            return rows.getString(1);
        }
    }

    private static SQLException unrecognizedState() {
        return new SQLException("Demo bootstrap requires an empty database or a completed demo ledger.");
    }
}
