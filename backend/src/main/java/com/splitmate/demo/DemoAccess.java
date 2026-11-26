package com.splitmate.demo;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.HexFormat;
import java.util.Map;

import org.springframework.core.env.Environment;
import org.springframework.http.HttpHeaders;
import org.springframework.web.filter.GenericFilterBean;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

final class DemoAccess extends GenericFilterBean {
    private final boolean publicAccess;
    private final Map<String, byte[]> reviewers;
    private final String origin;

    DemoAccess(Environment env) {
        origin = env.getProperty("DEMO_PUBLIC_ORIGIN", "");
        boolean local = "local-test".equals(env.getProperty("DEMO_DB_TARGET"));
        if (local ? !origin.matches("http://127\\.0\\.0\\.1:[1-9][0-9]{0,4}")
                : !origin.matches("https://[a-z0-9-]+\\.onrender\\.com")) {
            throw new IllegalStateException("Demo public origin is missing or invalid.");
        }

        publicAccess = "true".equals(env.getProperty("DEMO_PUBLIC_ACCESS_ENABLED"));
        if (publicAccess) {
            reviewers = Map.of();
            return;
        }

        var entries = new HashMap<String, byte[]>();
        var hashes = new HashSet<String>();
        for (String entry : env.getProperty("DEMO_REVIEWER_HASHES", "").split(",", -1)) {
            if (!entry.matches("[a-z][a-z0-9_-]{0,31}:[a-f0-9]{64}")) {
                throw new IllegalStateException("Demo reviewer configuration is missing or invalid.");
            }
            var parts = entry.split(":");
            if (entries.putIfAbsent(parts[0], HexFormat.of().parseHex(parts[1])) != null || !hashes.add(parts[1])) {
                throw new IllegalStateException("Demo reviewer configuration has duplicates.");
            }
        }
        reviewers = Map.copyOf(entries);
    }

    @Override
    public void doFilter(ServletRequest incoming, ServletResponse outgoing, FilterChain chain)
            throws IOException, ServletException {
        var request = (HttpServletRequest) incoming;
        var response = (HttpServletResponse) outgoing;
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("X-Frame-Options", "DENY");
        response.setHeader("X-Robots-Tag", "noindex, nofollow");
        if (publicAccess) {
            response.setHeader("X-Spendingmate-Demo-Access", "public");
        } else if (!authenticated(singleHeader(request, HttpHeaders.AUTHORIZATION))) {
            response.setHeader(HttpHeaders.WWW_AUTHENTICATE, "Basic realm=\"SPENDINGMATE demo\", charset=\"UTF-8\"");
            reject(response, 401);
            return;
        }
        String method = request.getMethod();
        if (!method.equals("GET") && !method.equals("HEAD")
                && (!hasRequestProof(request) || !origin.equals(singleHeader(request, HttpHeaders.ORIGIN))
                    || !hasJsonBodyOrNoBody(request))) {
            reject(response, 403);
            return;
        }
        chain.doFilter(request, response);
    }

    private static boolean hasJsonBodyOrNoBody(HttpServletRequest request) {
        if (request.getContentLengthLong() <= 0 && request.getHeader(HttpHeaders.TRANSFER_ENCODING) == null) {
            return true;
        }
        String type = singleHeader(request, HttpHeaders.CONTENT_TYPE);
        return type != null && type.split(";", 2)[0].strip().toLowerCase(Locale.ROOT).equals("application/json");
    }

    boolean hasRequestProof(HttpServletRequest request) {
        if (!"1".equals(singleHeader(request, "X-Spendingmate-Demo"))) {
            return false;
        }
        String source = singleHeader(request, HttpHeaders.ORIGIN);
        String fetchSite = singleHeader(request, "Sec-Fetch-Site");
        if (request.getHeader(HttpHeaders.ORIGIN) != null && !origin.equals(source)) {
            return false;
        }
        if (request.getHeader("Sec-Fetch-Site") != null && !"same-origin".equals(fetchSite)) {
            return false;
        }
        return origin.equals(source) || "same-origin".equals(fetchSite);
    }

    private boolean authenticated(String authorization) {
        if (authorization == null || authorization.length() > 140
                || !authorization.regionMatches(true, 0, "Basic ", 0, 6)) {
            return false;
        }
        try {
            String credentials = new String(Base64.getDecoder().decode(authorization.substring(6)), StandardCharsets.US_ASCII);
            if (!credentials.matches("[a-z][a-z0-9_-]{0,31}:[a-f0-9]{64}")) {
                return false;
            }
            String[] parts = credentials.split(":");
            byte[] expected = reviewers.get(parts[0]);
            byte[] actual = MessageDigest.getInstance("SHA-256").digest(parts[1].getBytes(StandardCharsets.US_ASCII));
            return MessageDigest.isEqual(expected, actual);
        } catch (IllegalArgumentException failure) {
            return false;
        } catch (NoSuchAlgorithmException failure) {
            throw new IllegalStateException("SHA-256 unavailable.", failure);
        }
    }

    private static String singleHeader(HttpServletRequest request, String name) {
        var values = request.getHeaders(name);
        if (!values.hasMoreElements()) {
            return null;
        }
        String value = values.nextElement();
        return values.hasMoreElements() ? null : value;
    }

    static void reject(HttpServletResponse response, int status) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.getWriter().write(status == 401
                ? "{\"code\":\"DEMO_AUTH_REQUIRED\",\"message\":\"Reviewer authentication required.\"}"
                : "{\"code\":\"DEMO_REQUEST_FORBIDDEN\",\"message\":\"Request origin or proof rejected.\"}");
    }
}
