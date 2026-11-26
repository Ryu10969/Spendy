package com.splitmate.analytics.controller;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.util.Arrays;

import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.context.annotation.Conditional;
import org.springframework.core.type.AnnotatedTypeMetadata;

@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Conditional(LocalLoopbackOnly.ExplicitLocalLoopback.class)
@interface LocalLoopbackOnly {

    final class ExplicitLocalLoopback implements Condition {
        @Override
        public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
            var environment = context.getEnvironment();
            var profiles = Arrays.asList(environment.getActiveProfiles());
            // Default profiles do not opt in. A configured address must be the exact IPv4 loopback.
            return profiles.contains("local") && !profiles.contains("production")
                    && "127.0.0.1".equals(environment.getProperty("server.address"));
        }
    }
}
