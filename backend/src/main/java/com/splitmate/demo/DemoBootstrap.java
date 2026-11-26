package com.splitmate.demo;

import org.springframework.core.env.StandardEnvironment;

/** Offline entry point. The Render web service only receives the runtime credential. */
public final class DemoBootstrap {
    private DemoBootstrap() {}

    public static void main(String[] args) {
        var environment = new StandardEnvironment();
        if (environment.getProperty("RENDER") != null || !"true".equals(environment.getProperty("DEMO_DB_BOOTSTRAP"))) {
            throw new IllegalStateException("Demo database bootstrap requires explicit opt-in.");
        }
        try {
            DemoDatabase.bootstrap(environment);
            System.out.println("Demo database migrations and seed verified.");
        } catch (Exception failure) {
            System.err.println("Demo bootstrap failed. Check target, TLS, database identity, role, and seed preconditions.");
            System.exit(1);
        }
    }
}
