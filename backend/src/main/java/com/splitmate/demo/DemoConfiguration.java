package com.splitmate.demo;

import java.io.IOException;
import java.util.Arrays;
import javax.sql.DataSource;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.Ordered;
import org.springframework.core.env.Environment;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import com.splitmate.settlement.controller.SettlementController;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Configuration(proxyBeanMethods = false)
@Profile("demo")
class DemoConfiguration {
    @Bean
    HikariDataSource demoDataSource(Environment env) {
        if (!Arrays.equals(env.getActiveProfiles(), new String[]{"demo"})
                || !"none".equals(env.getProperty("spring.jpa.hibernate.ddl-auto"))
                || !"never".equals(env.getProperty("spring.sql.init.mode"))) {
            throw new IllegalStateException("Demo requires its own profile with application DDL disabled.");
        }
        DataSource source = DemoDatabase.dataSource(env, false);
        var config = new HikariConfig();
        config.setDataSource(source);
        config.setMaximumPoolSize(4);
        config.setMinimumIdle(0);
        config.setIdleTimeout(60_000);
        config.setConnectionTimeout(25_000);
        config.setValidationTimeout(2_000);
        return new HikariDataSource(config);
    }

    @Bean
    DemoAccess demoAccess(Environment env) {
        return new DemoAccess(env);
    }

    @Bean
    FilterRegistrationBean<DemoAccess> demoAccessFilter(DemoAccess access) {
        var registration = new FilterRegistrationBean<>(access);
        registration.setDispatcherTypes(DispatcherType.REQUEST, DispatcherType.ERROR,
                DispatcherType.FORWARD, DispatcherType.ASYNC, DispatcherType.INCLUDE);
        registration.addUrlPatterns("/*");
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return registration;
    }

    @Bean
    WebMvcConfigurer demoWebMvc(DemoAccess access) {
        return new WebMvcConfigurer() {
            @Override
            public void addViewControllers(ViewControllerRegistry registry) {
                for (String path : new String[]{"/", "/archives", "/analytics", "/projects/new", "/expenses/new",
                        "/p/{token:[A-Za-z0-9_-]{43}}", "/p/{token:[A-Za-z0-9_-]{43}}/edit",
                        "/p/{token:[A-Za-z0-9_-]{43}}/expenses/new"}) {
                    registry.addViewController(path).setViewName("forward:/index.html");
                    if (!path.equals("/")) {
                        registry.addViewController(path + "/").setViewName("forward:/index.html");
                    }
                }
            }

            @Override
            public void addInterceptors(InterceptorRegistry registry) {
                registry.addInterceptor(new HandlerInterceptor() {
                    @Override
                    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
                            throws IOException {
                        if (!(handler instanceof HandlerMethod method) || method.getBeanType() != SettlementController.class) {
                            return true;
                        }
                        if (!"GET".equals(request.getMethod())) {
                            response.setHeader("Allow", "GET");
                            response.setStatus(405);
                            return false;
                        }
                        if (!access.hasRequestProof(request)) {
                            DemoAccess.reject(response, 403);
                            return false;
                        }
                        return true;
                    }
                });
            }
        };
    }
}
