# ---------- build ----------
FROM maven:3.9.11-eclipse-temurin-25 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -B -q dependency:go-offline || true
COPY src ./src
RUN mvn -B -DskipTests package

# ---------- runtime ----------
FROM eclipse-temurin:25-jre
WORKDIR /app
ENV MIDIA_DIR=/data/midia
ENV JAVA_OPTS="-Xms128m -Xmx512m -XX:MaxMetaspaceSize=192m -XX:+UseSerialGC -Djava.security.egd=file:/dev/./urandom"
COPY --from=build /app/target/grimorio.jar app.jar
EXPOSE 8080
ENTRYPOINT ["sh","-c","exec java $JAVA_OPTS -jar app.jar"]
