FROM node:22-bookworm-slim AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/index.html frontend/tsconfig.json frontend/tsconfig.app.json frontend/tsconfig.node.json frontend/vite.config.ts ./
COPY frontend/src/ src/
RUN npm run build -- --mode portfolio-demo

FROM eclipse-temurin:21-jdk-jammy AS backend
WORKDIR /build
COPY backend/gradlew backend/settings.gradle backend/build.gradle ./
COPY backend/gradle/ gradle/
COPY backend/src/main/ src/main/
COPY --from=frontend /build/dist/ src/main/resources/static/
RUN --mount=type=cache,target=/root/.gradle \
    ./gradlew bootJar --no-daemon && cp build/libs/splitmate-backend-0.0.1-SNAPSHOT.jar /build/app.jar

FROM eclipse-temurin:21-jre-jammy
WORKDIR /opt/spendingmate
COPY --from=backend --chmod=444 /build/app.jar ./app.jar
USER 10001:10001
EXPOSE 10000
ENTRYPOINT ["java", "-Xms48m", "-Xmx176m", "-Xss512k", "-XX:+UseSerialGC", "-XX:TieredStopAtLevel=1", "-XX:ActiveProcessorCount=2", "-XX:ReservedCodeCacheSize=48m", "-XX:MaxDirectMemorySize=32m", "-XX:+ExitOnOutOfMemoryError", "-Duser.timezone=Asia/Tokyo", "-jar", "/opt/spendingmate/app.jar", "--spring.profiles.active=demo"]
