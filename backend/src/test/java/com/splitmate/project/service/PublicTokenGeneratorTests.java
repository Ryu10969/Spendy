package com.splitmate.project.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.Set;

import org.junit.jupiter.api.Test;

class PublicTokenGeneratorTests {

    private final PublicTokenGenerator generator = new PublicTokenGenerator();

    @Test
    void generatesUnpaddedBase64UrlTokenWithApprovedLength() {
        String token = generator.generate();

        assertThat(token).hasSize(43);
        assertThat(token).matches("[A-Za-z0-9_-]{43}");
        assertThat(token).doesNotContain("=");
    }

    @Test
    void generatesDifferentValuesAcrossMultipleCalls() {
        Set<String> tokens = new HashSet<>();

        for (int index = 0; index < 100; index++) {
            tokens.add(generator.generate());
        }

        assertThat(tokens).hasSize(100);
    }
}
