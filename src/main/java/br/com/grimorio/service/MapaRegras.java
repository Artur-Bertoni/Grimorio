package br.com.grimorio.service;

import br.com.grimorio.model.Mapa;
import tools.jackson.databind.node.ObjectNode;

import tools.jackson.databind.node.ArrayNode;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * O que pode entrar no grid, nas regras e nos dados de um token. Tudo que vem da tela passa por
 * aqui antes de ir para o banco: chave desconhecida cai, numero e preso a uma faixa e texto e
 * cortado. Assim o JSON livre das colunas continua tendo uma forma que o resto do codigo conhece.
 */
final class MapaRegras {

    private static final String NENHUM = "nenhum";
    private static final String AVISO = "aviso";
    private static final String MARCA = "marca";
    private static final String POLIGONO = "poligono";
    private static final String PAREDE = "parede";
    private static final String K_VISAO = "visao";
    static final String K_VISAO_FICHA = "visaoFicha";
    /** Regras da nevoa que o mapa guarda: se lembra o que ja foi explorado, a versao dessa memoria e o alcance padrao da visao. */
    static final String K_FOG_MEMORIA = "fogMemoria";
    static final String K_FOG_VER = "fogVer";
    static final String K_VISAO_PADRAO = "visaoPadrao";
    static final double VISAO_PADRAO = 6;
    private static final String K_ENCAIXE = "encaixe";
    private static final String K_ELENCO = "elencoId";
    private static final String K_VIDA_PUBLICA = "vidaPublica";
    private static final String K_VIDA_CAMPO = "vidaCampo";
    private static final String K_PREENCH = "preench";
    private static final String K_ROTULO = "rotulo";
    private static final String K_ABERTA = "aberta";
    private static final String K_REVELA = "revela";
    private static final String QUADRADO = "quadrado";
    private static final String K_PONTA = "ponta";
    private static final String K_SUAVE = "suave";
    static final Set<String> TIPOS_GRID = Set.of(QUADRADO, "hex", NENHUM);
    static final Set<String> DIAGONAIS = Set.of("1", "121", "eu");
    static final Set<String> QUEM_MOVE = Set.of("dono", "todos");
    static final Set<String> LIMITES = Set.of(AVISO, "bloqueio");
    private static final int MAX_TRAJETO = 60;
    /** Da de baixo para a de cima: e a ordem em que a tela desenha. */
    static final List<String> CAMADAS = List.of("cenario", "objetos", "personagens", "npcs", "decoracao");
    static final Set<String> FORMAS = Set.of("linha", "circulo", "retangulo", POLIGONO, MARCA);
    /** Nomes de cor, nao cores: a tela traduz cada um para um token do tema (ouro, sangue, texto, ok, aviso). */
    static final Set<String> CORES = Set.of("ouro", "sangue", "neutro", "ok", AVISO);
    /** Nevoa do mapa: nenhuma, so as areas que o mestre revela, ou tambem a visao dos tokens dos jogadores. */
    static final Set<String> FOGS = Set.of(NENHUM, "manual", K_VISAO);
    /** Parede barra movimento e visao; janela so o movimento; porta, so fechada. */
    static final Set<String> PAREDES = Set.of(PAREDE, "janela", "porta");
    /** "traco" e o que o pincel pinta: um caminho com a largura do pincel, a ponta (formato) e a borda macia ou firme. */
    static final String TRACO = "traco";
    static final Set<String> PONTAS = Set.of("redondo", QUADRADO, "losango");
    static final Set<String> FORMAS_FOG = Set.of("retangulo", "circulo", POLIGONO, TRACO);
    private static final int MAX_MARCAS = 12;
    private static final int MAX_PONTOS = 100;
    private static final String K_TIPO = "tipo";
    private static final String K_COR = "cor";
    private static final String K_VIDA = "vida";
    private static final String K_VIDA_MAX = "vidaMax";
    private static final String K_MARCAS = "marcas";
    private static final String K_PTS = "pts";
    private static final String K_FORMA = "forma";
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
        g.put(K_TIPO, escolha(in, K_TIPO, TIPOS_GRID, QUADRADO));
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
        r.put("limite", escolha(in, "limite", LIMITES, AVISO));
        /* encaixar na grade: o mestre escolhe e vale para todos (token, regua, moldes e desenhos) */
        r.put(K_ENCAIXE, in == null || !in.containsKey(K_ENCAIXE) || bool(in, K_ENCAIXE));
        r.put("trancadas", trancadas(in));
        r.put("fog", escolha(in, "fog", FOGS, NENHUM));
        r.put(K_FOG_MEMORIA, in != null && bool(in, K_FOG_MEMORIA));
        /* "esquecer o explorado" so soma um: cada navegador guarda a memoria com esse numero e ignora a de versao velha */
        r.put(K_FOG_VER, Math.round(num(in, K_FOG_VER, 0, 0, 1000000)));
        r.put(K_VISAO_PADRAO, Math.round(num(in, K_VISAO_PADRAO, VISAO_PADRAO, 1, 100) * 10) / 10.0);
        return r;
    }

    /** Pontos do caminho que o jogador andou (ate 60, presos a margem do mapa); lista vazia se vier torta. */
    static List<double[]> trajeto(List<List<Double>> in, Mapa m) {
        List<double[]> out = new ArrayList<>();
        if (in == null || in.size() > MAX_TRAJETO) return out;
        double w = Math.max(1, m.getLargura());
        double h = Math.max(1, m.getAltura());
        for (List<Double> p : in) {
            if (p == null || p.size() < 2 || p.get(0) == null || p.get(1) == null) return new ArrayList<>();
            out.add(new double[]{Math.clamp(p.get(0), -w, w * 2), Math.clamp(p.get(1), -h, h * 2)});
        }
        return out;
    }

    /** Camadas trancadas do mapa: ninguem mexe no que esta nelas (nem o mestre) ate destrancar. */
    static List<String> trancadas(Map<String, Object> in) {
        List<String> out = new ArrayList<>();
        if (in != null && in.get("trancadas") instanceof Collection<?> c) {
            for (Object o : c) {
                String s = String.valueOf(o);
                if (CAMADAS.contains(s) && !out.contains(s)) out.add(s);
            }
        }
        return out;
    }

    static String camada(String pedida, String padrao) {
        return pedida != null && CAMADAS.contains(pedida.trim()) ? pedida.trim() : padrao;
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
        if (x.containsKey(K_ELENCO)) {
            String e = corta(texto(x, K_ELENCO, "").trim(), 80);
            if (e.isEmpty()) d.remove(K_ELENCO); else d.put(K_ELENCO, e);
        }
        /* deslocamento por turno, na unidade do mapa; 0 e sem limite. O gasto (usado) so o servidor escreve. */
        if (x.containsKey("desl")) d.put("desl", Math.round(num(x, "desl", 0, 0, 100000) * 100) / 100.0);
        /* alcance da visao, em casas; vazio tira o campo e vale o da ficha ou o padrao do mapa, 0 e cego. A copia da
           ficha (visaoFicha) o servidor mantem quando a ficha muda; aqui so entra o valor de quem cria o token a partir dela. */
        alcance(d, x, K_VISAO);
        alcance(d, x, K_VISAO_FICHA);
        vinculo(d, x, novo);
        marcadores(d, x);
        return d;
    }

    private static void alcance(ObjectNode d, Map<String, Object> x, String k) {
        if (!x.containsKey(k)) return;
        Object v = x.get(k);
        if (v == null || String.valueOf(v).isBlank()) d.remove(k);
        else d.put(k, Math.round(num(x, k, VISAO_PADRAO, 0, 100) * 10) / 10.0);
    }

    /**
     * Vida (valor proprio do token; vidaMax 0 tira a barra), se os jogadores a veem, de qual campo da
     * ficha ela veio e as marcas (condicao, efeito, status) com o nome de uma cor.
     */
    private static void marcadores(ObjectNode d, Map<String, Object> x) {
        if (x.containsKey(K_VIDA_MAX)) {
            double max = (double) Math.round(num(x, K_VIDA_MAX, 0, 0, 99999));
            if (max <= 0) { d.remove(K_VIDA_MAX); d.remove(K_VIDA); } else d.put(K_VIDA_MAX, max);
        }
        if (x.containsKey(K_VIDA) && d.has(K_VIDA_MAX)) d.put(K_VIDA, Math.round(num(x, K_VIDA, 0, 0, 99999)));
        if (x.containsKey(K_VIDA_PUBLICA)) d.put(K_VIDA_PUBLICA, bool(x, K_VIDA_PUBLICA));
        if (x.containsKey(K_VIDA_CAMPO)) d.put(K_VIDA_CAMPO, corta(texto(x, K_VIDA_CAMPO, "").trim(), 80));
        marcas(d, x);
    }

    /** O que o dono do token muda sozinho: a vida atual (ate o maximo) e as marcas. */
    static void vidaEMarcas(ObjectNode d, Map<String, Object> x) {
        if (x.containsKey(K_VIDA) && d.has(K_VIDA_MAX)) d.put(K_VIDA, Math.round(num(x, K_VIDA, 0, 0, d.path(K_VIDA_MAX).asDouble(0))));
        marcas(d, x);
    }

    private static void marcas(ObjectNode d, Map<String, Object> x) {
        if (!x.containsKey(K_MARCAS)) return;
        ArrayNode a = d.putArray(K_MARCAS);
        if (x.get(K_MARCAS) instanceof Collection<?> c) {
            for (Object o : c) {
                if (a.size() < MAX_MARCAS) umaMarca(a, o);
            }
        }
        if (a.isEmpty()) d.remove(K_MARCAS);
    }

    /** Uma marca: o texto (cortado) e o nome de uma cor da paleta; texto vazio nao entra. */
    private static void umaMarca(ArrayNode a, Object o) {
        Map<?, ?> m = o instanceof Map<?, ?> mm ? mm : null;
        String t = corta(String.valueOf(m == null ? o : m.get("t")).trim(), 30);
        if (t.isEmpty() || "null".equals(t)) return;
        String cor = m != null && CORES.contains(String.valueOf(m.get("c"))) ? String.valueOf(m.get("c")) : AVISO;
        a.addObject().put("t", t).put("c", cor);
    }

    /**
     * Dados de um desenho: a forma (so se define ao nascer), os pontos, a cor (um nome da paleta), a
     * espessura, o quanto preenche e o rotulo. Mesma regra do token: o que nao e conhecido cai.
     */
    static ObjectNode dadosDesenho(ObjectNode d, Map<String, Object> in, Mapa m) {
        boolean novo = d.isEmpty();
        Map<String, Object> x = in == null ? Map.of() : in;
        if (novo) {
            String f = escolha(x, K_FORMA, FORMAS, "");
            if (f.isEmpty()) throw new IllegalArgumentException("forma de desenho inválida");
            d.put(K_FORMA, f);
        }
        if (novo || x.containsKey(K_PTS)) d.set(K_PTS, pontos(d, x.get(K_PTS), d.path(K_FORMA).asString(""), m));
        if (novo || x.containsKey(K_COR)) d.put(K_COR, escolha(x, K_COR, CORES, "ouro"));
        if (novo || x.containsKey("esp")) d.put("esp", Math.round(num(x, "esp", 3, 1, 12)));
        if (novo || x.containsKey(K_PREENCH)) d.put(K_PREENCH, Math.round(num(x, K_PREENCH, 0, 0, 0.8) * 100) / 100.0);
        if (novo || x.containsKey(K_ROTULO)) d.put(K_ROTULO, corta(texto(x, K_ROTULO, "").trim(), 80));
        return d;
    }

    /**
     * Dados de uma parede: o tipo (parede, janela ou porta), se a porta esta aberta e a linha de
     * pontos por onde ela passa (cada par de pontos seguidos e um trecho).
     */
    static ObjectNode dadosParede(ObjectNode d, Map<String, Object> in, Mapa m) {
        boolean novo = d.isEmpty();
        Map<String, Object> x = in == null ? Map.of() : in;
        if (novo || x.containsKey("kind")) d.put("kind", escolha(x, "kind", PAREDES, d.path("kind").asString(PAREDE)));
        /* so porta abre e fecha: trocar o tipo para outro fecha de vez */
        boolean aberta = x.containsKey(K_ABERTA) ? bool(x, K_ABERTA) : d.path(K_ABERTA).asBoolean(false);
        d.put(K_ABERTA, "porta".equals(d.path("kind").asString("")) && aberta);
        if (novo || x.containsKey(K_PTS)) d.set(K_PTS, pontos(d, x.get(K_PTS), PAREDE, m));
        return d;
    }

    /** Dados de uma area de nevoa: a forma (so ao nascer), os pontos e se ela revela ou cobre. */
    static ObjectNode dadosFog(ObjectNode d, Map<String, Object> in, Mapa m) {
        boolean novo = d.isEmpty();
        Map<String, Object> x = in == null ? Map.of() : in;
        if (novo) {
            String f = escolha(x, K_FORMA, FORMAS_FOG, "");
            if (f.isEmpty()) throw new IllegalArgumentException("forma de névoa inválida");
            d.put(K_FORMA, f);
        }
        if (novo || x.containsKey(K_PTS)) d.set(K_PTS, pontos(d, x.get(K_PTS), d.path(K_FORMA).asString(""), m));
        if (novo || x.containsKey(K_REVELA)) d.put(K_REVELA, !x.containsKey(K_REVELA) || bool(x, K_REVELA));
        if (TRACO.equals(d.path(K_FORMA).asString(""))) pincel(d, x, novo);
        return d;
    }

    /** Largura (em pixels do mapa), ponta e borda do pincel; so a mudanca de quem mandou, o resto fica como estava. */
    private static void pincel(ObjectNode d, Map<String, Object> x, boolean novo) {
        if (novo || x.containsKey("larg")) d.put("larg", Math.round(num(x, "larg", 70, 4, 1000)));
        if (novo || x.containsKey(K_PONTA)) d.put(K_PONTA, escolha(x, K_PONTA, PONTAS, "redondo"));
        if (novo || x.containsKey(K_SUAVE)) d.put(K_SUAVE, !x.containsKey(K_SUAVE) || bool(x, K_SUAVE));
    }

    /** Pontos [x, y] presos a uma margem em volta do mapa; a forma diz quantos precisa (e o excesso cai). */
    private static ArrayNode pontos(ObjectNode d, Object v, String forma, Mapa m) {
        double w = Math.max(1, m.getLargura());
        double h = Math.max(1, m.getAltura());
        int minimo = switch (forma) { case POLIGONO -> 3; case MARCA, TRACO -> 1; default -> 2; };
        int maximo = switch (forma) { case POLIGONO, PAREDE, TRACO -> MAX_PONTOS; case MARCA -> 1; default -> 2; };
        ArrayNode out = d.arrayNode();
        if (v instanceof Collection<?> c) {
            for (Object o : c) {
                if (out.size() >= maximo) break;
                if (!(o instanceof List<?> p) || p.size() < 2 || !(p.get(0) instanceof Number a) || !(p.get(1) instanceof Number b)) {
                    throw new IllegalArgumentException("ponto inválido");
                }
                ArrayNode pt = out.addArray();
                pt.add(Math.round(Math.clamp(a.doubleValue(), -w, w * 2) * 10) / 10.0);
                pt.add(Math.round(Math.clamp(b.doubleValue(), -h, h * 2) * 10) / 10.0);
            }
        }
        if (out.size() < minimo) throw new IllegalArgumentException("faltam pontos no desenho");
        return out;
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

    /** de onde o token veio (ficha ou NPC) so se define ao nascer por aqui (ligar a outra ficha depois e MapaFichas);
     *  o vinculo com a ficha liga e desliga */
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
