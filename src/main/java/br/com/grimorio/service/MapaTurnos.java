package br.com.grimorio.service;

import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * O turno da campanha, como o mestre o informa a partir da iniciativa: se ha iniciativa em
 * andamento, em que turno (a rodada) ela esta, de quem e a vez e quem esta nela. A iniciativa mora
 * no guia, que o servidor nao le; o navegador do mestre manda este resumo a cada mudanca.
 *
 * Com iniciativa em andamento, um token que uma entrada da ordem aponta so se move na vez dessa entrada.
 * O elo e o id do proprio token: a entrada da ordem escolhe o token (formulario da iniciativa). Token que
 * nenhuma entrada aponta, ou apontado por quem nao esta na ordem, continua livre, senao quem ficou de fora travaria para sempre.
 *
 * Fica na tabela {@code config} (uma chave por campanha) e em memoria: a instancia e unica.
 */
@Component
public class MapaTurnos {

    /** {@code vez} e o id do token de quem tem a vez; {@code ids}, os tokens de todos na ordem que apontam para um */
    public record Turno(boolean ativo, int rodada, String vez, Set<String> ids) {
        public static final Turno PARADO = new Turno(false, 0, "", Set.of());
    }

    private static final String CHAVE = "mapa.turno.c";
    private static final String K_ATIVO = "ativo";
    private static final String K_RODADA = "rodada";
    private static final String K_VEZ = "vez";
    private static final String K_IDS = "ids";

    private final ConfigService config;
    private final ObjectMapper om = JsonMapper.builder().build();
    private final Map<Long, Turno> cache = new ConcurrentHashMap<>();

    public MapaTurnos(ConfigService config) {
        this.config = config;
    }

    static String id(String s) {
        return s == null ? "" : s.trim();
    }

    public Turno de(long cid) {
        return cache.computeIfAbsent(cid, this::le);
    }

    private Turno le(long cid) {
        String json = config.get(CHAVE + cid, "");
        if (json.isBlank()) return Turno.PARADO;
        try {
            JsonNode n = om.readTree(json);
            Set<String> ids = new LinkedHashSet<>();
            for (JsonNode x : n.path(K_IDS)) ids.add(x.asString(""));
            return new Turno(n.path(K_ATIVO).asBoolean(false), n.path(K_RODADA).asInt(0), n.path(K_VEZ).asString(""), ids);
        } catch (JacksonException _) {
            return Turno.PARADO;
        }
    }

    public void grava(long cid, Turno t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put(K_ATIVO, t.ativo());
        m.put(K_RODADA, t.rodada());
        m.put(K_VEZ, t.vez());
        m.put(K_IDS, List.copyOf(t.ids()));
        config.set(CHAVE + cid, om.writeValueAsString(m));
        cache.put(cid, t);
    }

    public void apaga(long cid) {
        config.apaga(CHAVE + cid);
        cache.remove(cid);
    }

    /** O token espera a vez dele: ha iniciativa, ele esta vinculado a alguem da ordem e a vez e de outro. */
    public boolean espera(long cid, String elencoId) {
        Turno t = de(cid);
        String n = id(elencoId);
        return t.ativo() && !n.isEmpty() && t.ids().contains(n) && !n.equals(t.vez());
    }

    /** E a vez do token: ha iniciativa e ele esta vinculado a quem tem a vez. */
    public boolean daVez(long cid, String elencoId) {
        Turno t = de(cid);
        String n = id(elencoId);
        return t.ativo() && !n.isEmpty() && n.equals(t.vez());
    }
}
