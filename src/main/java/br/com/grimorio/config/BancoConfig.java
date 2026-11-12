package br.com.grimorio.config;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

import javax.sql.DataSource;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Descobre o banco sozinho:
 *  1. DATABASE_URL no formato do Railway (postgresql://usuario:senha@host:porta/base)
 *  2. JDBC_URL + JDBC_USER + JDBC_SENHA, se preferir montar na mao
 *  3. nada disso -> H2 em arquivo, para rodar na sua maquina sem instalar banco
 */
@Configuration
public class BancoConfig {

    private static final Logger log = LoggerFactory.getLogger(BancoConfig.class);

    @Bean
    public DataSource dataSource(Environment env, AppProps props) throws Exception {
        HikariConfig cfg = new HikariConfig();
        cfg.setPoolName("grimorio");
        cfg.setMaximumPoolSize(Integer.parseInt(primeiroOu(env, "5", "DB_POOL")));

        String databaseUrl = primeiro(env, "DATABASE_URL", "POSTGRES_URL", "DATABASE_PRIVATE_URL");
        String jdbcUrl = primeiro(env, "JDBC_URL");

        if (jdbcUrl != null) {
            cfg.setJdbcUrl(jdbcUrl);
            cfg.setUsername(primeiro(env, "JDBC_USER"));
            cfg.setPassword(primeiro(env, "JDBC_SENHA", "JDBC_PASSWORD"));
            log.info("Banco: JDBC_URL informada na mao.");

        } else if (databaseUrl != null && databaseUrl.startsWith("postgres")) {
            Pg pg = Pg.de(databaseUrl);
            cfg.setJdbcUrl(pg.jdbc);
            cfg.setUsername(pg.usuario);
            cfg.setPassword(pg.senha);
            cfg.setDriverClassName("org.postgresql.Driver");
            log.info("Banco: PostgreSQL em {}", pg.jdbc);

        } else {
            Path dir = Paths.get(props.getMidiaDir()).toAbsolutePath().normalize().resolveSibling("banco");
            Files.createDirectories(dir);
            cfg.setJdbcUrl("jdbc:h2:file:" + dir.resolve("grimorio")
                    + ";AUTO_SERVER=TRUE;DB_CLOSE_DELAY=-1");
            cfg.setUsername("sa");
            cfg.setPassword("");
            cfg.setDriverClassName("org.h2.Driver");
            log.info("Banco: H2 em arquivo ({})", dir);
        }

        return new HikariDataSource(cfg);
    }

    private String primeiro(Environment env, String... chaves) {
        for (String k : chaves) {
            String v = env.getProperty(k);
            if (v != null && !v.isBlank()) return v.trim();
        }
        return null;
    }

    private String primeiroOu(Environment env, String padrao, String... chaves) {
        String v = primeiro(env, chaves);
        return v == null ? padrao : v;
    }

    /**
     * Parse na mao em vez de java.net.URI: senha gerada pode ter caractere que
     * quebra o URI, e o lastIndexOf('@') resolve senha com arroba.
     */
    static final class Pg {
        final String jdbc, usuario, senha;

        private Pg(String jdbc, String usuario, String senha) {
            this.jdbc = jdbc; this.usuario = usuario; this.senha = senha;
        }

        static Pg de(String url) {
            String resto = url.substring(url.indexOf("://") + 3);

            String consulta = "";
            int q = resto.indexOf('?');
            if (q >= 0) { consulta = resto.substring(q + 1); resto = resto.substring(0, q); }

            String cred = "", hostBase = resto;
            int at = resto.lastIndexOf('@');
            if (at >= 0) { cred = resto.substring(0, at); hostBase = resto.substring(at + 1); }

            String usuario = cred, senha = "";
            int dp = cred.indexOf(':');
            if (dp >= 0) { usuario = cred.substring(0, dp); senha = cred.substring(dp + 1); }

            String base = "railway";
            int barra = hostBase.indexOf('/');
            if (barra >= 0) {
                String b = hostBase.substring(barra + 1);
                if (!b.isBlank()) base = b;
                hostBase = hostBase.substring(0, barra);
            }

            String host = hostBase, porta = "5432";
            int dp2 = hostBase.lastIndexOf(':');
            if (dp2 >= 0) { host = hostBase.substring(0, dp2); porta = hostBase.substring(dp2 + 1); }

            String jdbc = "jdbc:postgresql://" + host + ":" + porta + "/" + base
                    + (consulta.isBlank() ? "" : "?" + consulta);
            return new Pg(jdbc, dec(usuario), dec(senha));
        }

        private static String dec(String s) {
            try {
                return java.net.URLDecoder.decode(s, java.nio.charset.StandardCharsets.UTF_8);
            } catch (Exception e) {
                return s;
            }
        }
    }
}
