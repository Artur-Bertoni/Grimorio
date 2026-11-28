package br.com.grimorio.config;

import br.com.grimorio.model.MapaElemento;
import br.com.grimorio.model.Midia;
import br.com.grimorio.model.Papel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Arrays;
import java.util.stream.Collectors;

/**
 * Realinha os CHECK de coluna enum com os valores que existem hoje no Java.
 *
 * Motivo: o Hibernate cria "check (tipo in ('PDF','AUDIO'))" quando a tabela
 * nasce, e o ddl-auto=update NUNCA volta para mexer nesse check. Quando um
 * valor novo entra no enum (IMG, por exemplo), o insert passa pela validacao
 * do Java e morre no banco com 23514. Isso roda no boot, antes de qualquer
 * requisicao, e e idempotente: dropa e recria com a lista atual.
 *
 * Se a coluna ou a tabela nao existir, o aviso fica no log e a vida segue. Coluna enum nova
 * entra na lista abaixo.
 *
 * No H2 (o banco local) o check e so removido, nunca recriado: no H2 2.4 a restricao fica presa a
 * conexao que a criou, e quando o pool aposenta essa conexao (uns 30 minutos depois do boot) todo
 * insert e update da tabela passa a falhar com "Check constraint invalid" / "database has been
 * closed", ate reiniciar. Vale tambem para o check que o Hibernate cria junto com a tabela, por
 * isso ele sai. O enum do Java continua barrando valor invalido; no Postgres nada muda.
 */
@Configuration
public class AjusteEsquema {

    private static final Logger log = LoggerFactory.getLogger(AjusteEsquema.class);
    private static final String COLUNA_PAPEL = "papel";
    private static final java.util.regex.Pattern IDENTIFICADOR = java.util.regex.Pattern.compile("[a-z_][a-z0-9_]*");

    @Bean
    @Order(0)
    ApplicationRunner realinhaChecks(JdbcTemplate jdbc) {
        return args -> {
            boolean h2 = ehH2(jdbc);
            realinhar(jdbc, h2, "midia", "tipo", Midia.Tipo.values());
            realinhar(jdbc, h2, "membro", COLUNA_PAPEL, Papel.values());
            realinhar(jdbc, h2, "convite", COLUNA_PAPEL, Papel.values());
            realinhar(jdbc, h2, "usuario", COLUNA_PAPEL, Papel.values());
            realinhar(jdbc, h2, "mapa_elemento", "tipo", MapaElemento.Tipo.values());
        };
    }

    private static boolean ehH2(JdbcTemplate jdbc) {
        try {
            String nome = jdbc.execute((java.sql.Connection c) -> c.getMetaData().getDatabaseProductName());
            return nome != null && nome.toUpperCase(java.util.Locale.ROOT).contains("H2");
        } catch (Exception e) {
            log.warn("Nao consegui saber qual e o banco: {}", e.getMessage());
            return false;
        }
    }

    private int realinhar(JdbcTemplate jdbc, boolean h2, String tabela, String coluna, Enum<?>[] valores) {
        /* DDL nao aceita parametro: nome de tabela e coluna entram no texto. Vem de constantes
           deste arquivo, e a conferencia abaixo garante que nunca seja outra coisa. */
        if (!IDENTIFICADOR.matcher(tabela).matches() || !IDENTIFICADOR.matcher(coluna).matches())
            throw new IllegalArgumentException("identificador invalido: " + tabela + "." + coluna);
        String nome = tabela + "_" + coluna + "_check";
        String lista = Arrays.stream(valores)
                .map(v -> "'" + v.name() + "'")
                .collect(Collectors.joining(", "));
        try {
            jdbc.execute("alter table " + tabela + " drop constraint if exists " + nome); // NOSONAR: identificadores validados acima
        } catch (Exception e) {
            log.warn("Nao consegui remover {}: {}", nome, e.getMessage());
            return 0;
        }
        if (h2) return 0;
        try {
            // a lista vem de Enum.name(); identificadores validados acima
            jdbc.execute("alter table " + tabela + " add constraint " + nome // NOSONAR
                    + " check (" + coluna + " in (" + lista + "))");
            return 1;
        } catch (Exception e) {
            // Sem o check a coluna fica sem restricao no banco, mas o enum do
            // Java continua barrando valor invalido. Melhor isso do que travar.
            log.warn("Check {} ficou sem restricao: {}", nome, e.getMessage());
            return 0;
        }
    }
}
