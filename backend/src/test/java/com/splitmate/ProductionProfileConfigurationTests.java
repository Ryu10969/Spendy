package com.splitmate;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;

class ProductionProfileConfigurationTests {

    @Test
    void productionProfileRequiresDatasourcePlaceholdersWithoutLocalFallbacks() throws Exception {
        YamlPropertySourceLoader loader = new YamlPropertySourceLoader();
        List<PropertySource<?>> sources = loader.load(
                "application-production",
                new ClassPathResource("application-production.yml"));

        assertThat(sources).isNotEmpty();
        PropertySource<?> source = sources.get(0);

        assertThat(source.getProperty("spring.datasource.url")).isEqualTo("${SPRING_DATASOURCE_URL}");
        assertThat(source.getProperty("spring.datasource.username")).isEqualTo("${SPRING_DATASOURCE_USERNAME}");
        assertThat(source.getProperty("spring.datasource.password")).isEqualTo("${SPRING_DATASOURCE_PASSWORD}");
        assertThat(source.getProperty("spring.flyway.enabled")).isEqualTo(Boolean.TRUE);
        assertThat(source.getProperty("spring.jpa.hibernate.ddl-auto")).isEqualTo("none");
        assertThat(source.getProperty("spring.jpa.open-in-view")).isEqualTo(Boolean.FALSE);
        assertThat(source.getProperty("server.port")).isEqualTo(8080);
    }
}
