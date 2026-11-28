package br.com.grimorio.service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * O resumo de uma linha que o cartao da lista de campanhas mostra embaixo do nome: qual sessao
 * foi a ultima, ou, para quem mestra e ainda nao encerrou nenhuma, qual e a proxima.
 *
 * <p>Sai um JSON pequeno ({@code tipo}, {@code rotulo}, {@code n}, {@code titulo}) guardado na
 * propria campanha a cada gravacao do guia ou da mesa, e "" quando nao ha o que mostrar. O rotulo
 * e a palavra que a campanha usa para "sessao" (o vocabulario e dela, nao do codigo).
 */
public final class UltimaSessao {

    private static final ObjectMapper JSON = JsonMapper.builder().build();
    private static final int MAX_TITULO = 120;

    private UltimaSessao() { }

    /** Do guia (quem mestra): a ultima sessao encerrada; sem nenhuma, a primeira em aberto. */
    public static String doGuia(String conteudo) {
        JsonNode raiz = le(conteudo);
        if (raiz == null) return "";
        String rotulo = raiz.path("campanha").path("vocab").path("sessao").asString("");
        JsonNode ultima = null;
        JsonNode proxima = null;
        for (JsonNode s : raiz.path("sessoes")) {
            boolean encerrada = "encerrada".equals(s.path("status").asString(""));
            if (encerrada && (ultima == null || s.path("numero").asInt() >= ultima.path("numero").asInt())) ultima = s;
            if (!encerrada && proxima == null) proxima = s;
        }
        if (ultima != null) return monta("ultima", rotulo, ultima.path("numero").asInt(), ultima.path("titulo").asString(""));
        if (proxima != null) return monta("proxima", rotulo, proxima.path("numero").asInt(), proxima.path("titulo").asString(""));
        return "";
    }

    /** Da mesa (quem joga): o resumo publicado de numero mais alto. */
    public static String daMesa(String conteudo) {
        JsonNode raiz = le(conteudo);
        if (raiz == null) return "";
        String rotulo = raiz.path("vocab").path("sessao").asString("");
        JsonNode ultima = null;
        for (JsonNode r : raiz.path("resumos")) {
            if (ultima == null || r.path("n").asInt() >= ultima.path("n").asInt()) ultima = r;
        }
        return ultima == null ? "" : monta("ultima", rotulo, ultima.path("n").asInt(), ultima.path("titulo").asString(""));
    }

    private static JsonNode le(String conteudo) {
        if (conteudo == null || conteudo.isBlank()) return null;
        try {
            JsonNode n = JSON.readTree(conteudo);
            return n != null && n.isObject() ? n : null;
        } catch (RuntimeException e) {
            // documento ilegivel nao derruba a gravacao nem a lista: o cartao so fica sem a linha
            return null;
        }
    }

    private static String monta(String tipo, String rotulo, int n, String titulo) {
        ObjectNode o = JSON.createObjectNode();
        o.put("tipo", tipo);
        o.put("rotulo", corta(rotulo, 40));
        o.put("n", n);
        o.put("titulo", corta(titulo, MAX_TITULO));
        return JSON.writeValueAsString(o);
    }

    private static String corta(String s, int max) {
        String t = s == null ? "" : s.strip();
        return t.length() <= max ? t : t.substring(0, max - 1) + "…";
    }
}
