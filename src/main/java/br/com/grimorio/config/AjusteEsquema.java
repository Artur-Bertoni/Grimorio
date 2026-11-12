package br.com.grimorio.config;

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
 * Se a coluna ou a tabela nao existir, o aviso fica no log e a vida segue.
 */
@Configuration
public class AjusteEsquema {

    private static final Logger log = LoggerFactory.getLogger(AjusteEsquema.class);

    @Bean
    @Order(0)
    public ApplicationRunner realinhaChecks(JdbcTemplate jdbc) {
        return args -> {
            int ok = 0;
            ok += realinhar(jdbc, "midia", "tipo", Midia.Tipo.values());
            ok += realinhar(jdbc, "membro", "papel", Papel.values());
            ok += realinhar(jdbc, "convite", "papel", Papel.values());
            ok += realinhar(jdbc, "usuario", "papel", Papel.values());
        };
    }

    private int realinhar(JdbcTemplate jdbc, String tabela, String coluna, Enum<?>[] valores) {
        String nome = tabela + "_" + coluna + "_check";
        String lista = Arrays.stream(valores)
                .map(v -> "'" + v.name() + "'")
                .collect(Collectors.joining(", "));
        try {
            jdbc.execute("alter table " + tabela + " drop constraint if exists " + nome);
        } catch (Exception e) {
            log.warn("Nao consegui remover {}: {}", nome, e.getMessage());
            return 0;
        }
        try {
            jdbc.execute("alter table " + tabela + " add constraint " + nome
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
