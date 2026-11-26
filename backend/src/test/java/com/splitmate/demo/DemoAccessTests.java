package com.splitmate.demo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.HexFormat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class DemoAccessTests {
    private static final String ORIGIN = "http://127.0.0.1:10000";
    private static final String PASSWORD = "a".repeat(64);

    @Test
    void rejectsMissingMalformedAndRevokedCredentialsBeforeDispatch() throws Exception {
        var filter = new DemoAccess(environment("reviewer", PASSWORD));
        assertThat(status(filter, new MockHttpServletRequest("GET", "/assets/main.js"))).isEqualTo(401);
        var request = authorized("GET");
        assertThat(status(filter, request)).isEqualTo(200);
        assertThat(status(new DemoAccess(environment("other", PASSWORD)), request)).isEqualTo(401);
        request.addHeader("Authorization", "Basic invalid");
        assertThat(status(filter, request)).isEqualTo(401);
    }

    @Test
    void publicDemoNeedsNoReviewersAndStillChecksWriteProof() throws Exception {
        var env = new MockEnvironment().withProperty("DEMO_DB_TARGET", "local-test")
                .withProperty("DEMO_PUBLIC_ORIGIN", ORIGIN)
                .withProperty("DEMO_PUBLIC_ACCESS_ENABLED", "true");
        var filter = new DemoAccess(env);
        var get = new MockHttpServletRequest("GET", "/actuator/health");
        var response = new MockHttpServletResponse();
        filter.doFilter(get, response, new MockFilterChain());
        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getHeader("X-Spendingmate-Demo-Access")).isEqualTo("public");
        assertThat(response.getHeader("WWW-Authenticate")).isNull();
        assertThat(response.getHeader("X-Robots-Tag")).isEqualTo("noindex, nofollow");
        assertThat(response.getHeader("X-Content-Type-Options")).isEqualTo("nosniff");

        var write = new MockHttpServletRequest("DELETE", "/api/projects/example");
        write.addHeader("Origin", ORIGIN);
        assertThat(status(filter, write)).isEqualTo(403);
        write.addHeader("X-Spendingmate-Demo", "1");
        assertThat(status(filter, write)).isEqualTo(200);
        write.addHeader("Origin", "https://untrusted.example");
        assertThat(status(filter, write)).isEqualTo(403);

        env.setProperty("DEMO_PUBLIC_ACCESS_ENABLED", "TRUE");
        assertThatThrownBy(() -> new DemoAccess(env)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void requiresExplicitOriginAndProofForWrites() throws Exception {
        var filter = new DemoAccess(environment("reviewer", PASSWORD));
        var request = authorized("PATCH");
        request.addHeader("Sec-Fetch-Site", "same-origin");
        assertThat(status(filter, request)).isEqualTo(403);
        request.addHeader("X-Spendingmate-Demo", "1");
        assertThat(filter.hasRequestProof(request)).isTrue();
        assertThat(status(filter, request)).isEqualTo(403);
        request.addHeader("Origin", ORIGIN);
        request.setContent("{\"name\":\"fixture\"}".getBytes(StandardCharsets.US_ASCII));
        request.setContentType("text/plain");
        assertThat(status(filter, request)).isEqualTo(403);
        request.setContentType("application/json");
        assertThat(status(filter, request)).isEqualTo(200);
        request.addHeader("Origin", "https://untrusted.example");
        assertThat(status(filter, request)).isEqualTo(403);
    }

    @Test
    void refusesInvalidStartupConfiguration() throws Exception {
        var config = environment("reviewer", PASSWORD);
        config.setProperty("DEMO_REVIEWER_HASHES", "");
        assertThatThrownBy(() -> new DemoAccess(config)).isInstanceOf(IllegalStateException.class);
        config.setProperty("DEMO_DB_HOST", "postgres");
        config.setProperty("DEMO_DB_NAME", "splitmate");
        assertThatThrownBy(() -> DemoDatabase.dataSource(config, true)).isInstanceOf(IllegalStateException.class);
    }

    private static MockEnvironment environment(String username, String password) throws Exception {
        var hash = MessageDigest.getInstance("SHA-256").digest(password.getBytes(StandardCharsets.US_ASCII));
        return new MockEnvironment().withProperty("DEMO_DB_TARGET", "local-test")
                .withProperty("DEMO_PUBLIC_ORIGIN", ORIGIN)
                .withProperty("DEMO_REVIEWER_HASHES", username + ":" + HexFormat.of().formatHex(hash));
    }

    private static MockHttpServletRequest authorized(String method) {
        var request = new MockHttpServletRequest(method, "/api/projects");
        var encoded = Base64.getEncoder().encodeToString(("reviewer:" + PASSWORD).getBytes(StandardCharsets.US_ASCII));
        request.addHeader("Authorization", "Basic " + encoded);
        return request;
    }

    private static int status(DemoAccess filter, MockHttpServletRequest request) throws Exception {
        var response = new MockHttpServletResponse();
        var chain = new MockFilterChain();
        filter.doFilter(request, response, chain);
        assertThat(response.getHeader("Cache-Control")).isEqualTo("no-store");
        assertThat(chain.getRequest() != null).isEqualTo(response.getStatus() == 200);
        return response.getStatus();
    }
}
