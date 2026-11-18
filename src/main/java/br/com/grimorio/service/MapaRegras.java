package br.com.grimorio.service;

import br.com.grimorio.model.Mapa;
import tools.jackson.databind.node.ObjectNode;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * O que pode entrar no grid, nas regras e nos dados de um token. Tudo que vem da tela passa por
 * aqui antes de ir para o banco: chave desconhecida cai, numero e preso a uma faixa e texto e
 * cortado. Assim o JSON livre das colunas continua tendo uma forma que o resto do codigo conhece.
 */
final class MapaRegras {

    static final Set<String> TIPOS_GRID = Set.of("quadrado", "hex", "nenhum");
    static final Set<String> DIAGONAIS = Set.of("1", "121", "eu");
    static final Set<String> QUEM_MOVE = Set.of("dono", "todos");
    static final Set<String> LIMITES = Set.of("aviso", "bloqueio");
    private static final String K_TIPO = "tipo";
    private static final String K_UNIDADE = "unidade";
    private static final String K_DIAGONAL = "diagonal";
    private static final String K_LIVRE = "livre";
    private static final String K_VINCULO = "vinculo";
    private static final String K_FICHA = "fichaId";
    private static final String K_NPC = "npcId";

    private MapaRegras() { /* so funcoes estaticas */ }

    static String corta(String s, int n) {
        if (s == null) return "";
        return s.length() > n ? s.substring(0, n) : s;
    }

    /** Grid com todos os campos: o que veio, preso a faixa, e o padrao no que faltou. */
    static Map<String, Object> grid(Map<String, Object> in) {
        Map<String, Object> g = new LinkedHashMap<>();
        g.put(K_TIPO, escolha(in, K_TIPO, TIPOS_GRID, "quadrado"));
        g.put("tam", num(in, "tam", 70, 8, 1000));
        g.put("ox", num(in, "ox", 0, -1000, 1000));
        g.put("oy", num(in, "oy", 0, -1000, 1000));
        g.put("opac", num(in, "opac", 0.35, 0, 1));
        g.put("escala", num(in, "escala", 1.5, 0.01, 10000));
        g.put(K_UNIDADE, corta(texto(in, K_UNIDADE, "m"), 12));
        g.put(K_DIAGONAL, escolha(in, K_DIAGONAL, DIAGONAIS, "121"));
        return g;
    }

    static Map<String, Object> regras(Map<String, Object> in) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("quem", escolha(in, "quem", QUEM_MOVE, "dono"));
        r.put("limite", escolha(in, "limite", LIMITES, "aviso"));
        return r;
    }

    /**
     * Mescla em {@code d} os dados de token que vieram. Num token novo preenche o padrao (no meio do
     * mapa, uma casa, sem rotacao). O vinculo com a ficha nasce ligado quando o token vem de uma.
     */
    static ObjectNode dadosToken(ObjectNode d, Map<String, Object> in, Mapa m) {
        boolean novo = d.isEmpty();
        Map<String, Object> x = in == null ? Map.of() : in;
        posicao(d, x, m);
        if (novo && !d.has("x")) { d.put("x", m.getLargura() / 2.0); d.put("y", m.getAltura() / 2.0); }
        aparencia(d, x, novo);
        if (x.containsKey(K_LIVRE)) d.put(K_LIVRE, bool(x, K_LIVRE));
        /* a quem do elenco o token pertence: e por ai que a iniciativa libera o movimento na vez dele */
        if (x.containsKey("elencoId")) {
            String e = corta(texto(x, "elencoId", "").trim(), 80);
            if (e.isEmpty()) d.remove("elencoId"); else d.put("elencoId", e);
        }
        /* deslocamento por turno, na unidade do mapa; 0 e sem limite. O gasto (usado) so o servidor escreve. */
        if (x.containsKey("desl")) d.put("desl", Math.round(num(x, "desl", 0, 0, 100000) * 100) / 100.0);
        vinculo(d, x, novo);
        return d;
    }

    /** tamanho, rotacao, nome e imagem: no token novo vem o padrao do que nao veio */
    private static void aparencia(ObjectNode d, Map<String, Object> x, boolean novo) {
        if (x.containsKey("tam") || novo) d.put("tam", num(x, "tam", 1, 0.25, 12));
        if (x.containsKey("rot") || novo) d.put("rot", ((num(x, "rot", 0, -3600, 3600) % 360) + 360) % 360);
        if (x.containsKey("nome") || novo) {
            String n = texto(x, "nome", "").trim();
            d.put("nome", corta(n.isEmpty() ? "Token" : n, 80));
        }
        if (x.containsKey("img") || novo) d.put("img", caminhoImagem(texto(x, "img", "")));
    }

    /** de onde o token veio (ficha ou NPC) so se define ao nascer; o vinculo com a ficha liga e desliga */
    private static void vinculo(ObjectNode d, Map<String, Object> x, boolean novo) {
        if (novo && x.get(K_FICHA) instanceof Number f) {
            d.put(K_FICHA, f.longValue());
            d.put(K_VINCULO, !x.containsKey(K_VINCULO) || bool(x, K_VINCULO));
        } else if (x.containsKey(K_VINCULO) && d.has(K_FICHA)) {
            d.put(K_VINCULO, bool(x, K_VINCULO));
        }
        if (novo && x.containsKey(K_NPC)) d.put(K_NPC, corta(texto(x, K_NPC, ""), 80));
    }

    /** So x e y, presos a uma margem em volta do mapa (o token pode ficar na borda, nao no infinito). */
    static void posicao(ObjectNode d, Map<String, Object> in, Mapa m) {
        if (in == null) return;
        double w = Math.max(1, m.getLargura());
        double h = Math.max(1, m.getAltura());
        if (in.containsKey("x")) d.put("x", Math.round(num(in, "x", w / 2, -w, w * 2) * 10) / 10.0);
        if (in.containsKey("y")) d.put("y", Math.round(num(in, "y", h / 2, -h, h * 2) * 10) / 10.0);
    }

    /**
     * Caminho de imagem da campanha, relativo e dentro de {@code img/}. URL de fora nao entra: a
     * imagem do token aparece na tela de todos os jogadores, e um endereco externo contaria a um
     * terceiro quem abriu o mapa.
     */
    static String caminhoImagem(String s) {
        String p = s == null ? "" : s.trim();
        if (p.isEmpty()) return "";
        if (!p.startsWith("img/") || p.contains("..") || p.contains("\\") || p.contains(":") || p.length() > 400)
            throw new IllegalArgumentException("imagem inválida");
        return p;
    }

    private static double num(Map<String, Object> in, String k, double padrao, double min, double max) {
        Object v = in == null ? null : in.get(k);
        double x = padrao;
        if (v instanceof Number n) x = n.doubleValue();
        else if (v instanceof String s && !s.isBlank()) {
            try {
                x = Double.parseDouble(s.trim().replace(',', '.'));
            } catch (NumberFormatException _) {
                x = padrao;
            }
        }
        if (!Double.isFinite(x)) x = padrao;
        return Math.clamp(x, min, max);
    }

    private static String texto(Map<String, Object> in, String k, String padrao) {
        Object v = in == null ? null : in.get(k);
        return v == null ? padrao : String.valueOf(v);
    }

    private static boolean bool(Map<String, Object> in, String k) {
        Object v = in.get(k);
        return v instanceof Boolean b ? b : "true".equals(String.valueOf(v));
    }

    private static String escolha(Map<String, Object> in, String k, Set<String> ops, String padrao) {
        String v = texto(in, k, padrao);
        return ops.contains(v) ? v : padrao;
    }
}
