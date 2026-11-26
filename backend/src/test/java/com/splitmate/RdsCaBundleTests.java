package com.splitmate;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

import org.junit.jupiter.api.Test;

class RdsCaBundleTests {

    @Test
    void committedBundleMatchesRecordedSha256AndLooksLikeAnRdsTrustStore() throws Exception {
        Path certsDir = resolveCertsDir();
        Path pem = certsDir.resolve("rds-global-bundle.pem");
        Path checksum = certsDir.resolve("rds-global-bundle.pem.sha256");

        assertThat(pem).exists();
        assertThat(checksum).exists();

        String checksumLine = Files.readString(checksum).trim();
        assertThat(checksumLine).isEqualTo(sha256(pem) + "  rds-global-bundle.pem");

        String pemText = Files.readString(pem);
        assertThat(pemText).startsWith("-----BEGIN CERTIFICATE-----");
        assertThat(pemText).contains("-----END CERTIFICATE-----");
        assertThat(pemText.split("-----BEGIN CERTIFICATE-----").length - 1).isGreaterThan(1);
    }

    private static Path resolveCertsDir() {
        Path modulePath = Path.of("docker/certs");
        if (Files.isDirectory(modulePath)) {
            return modulePath;
        }
        return Path.of("backend/docker/certs");
    }

    private static String sha256(Path pem) throws IOException, NoSuchAlgorithmException {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(pem));
        return HexFormat.of().formatHex(digest);
    }
}
