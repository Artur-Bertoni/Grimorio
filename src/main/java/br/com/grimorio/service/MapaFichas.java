package br.com.grimorio.service;

import br.com.grimorio.model.Ficha;
import br.com.grimorio.model.Mapa;
import br.com.grimorio.model.MapaElemento;
import br.com.grimorio.model.Papel;
import br.com.grimorio.repo.FichaRepo;
import br.com.grimorio.repo.MapaElementoRepo;
import br.com.grimorio.repo.MapaRepo;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.util.*;
import java.util.regex.Pattern;

import static br.com.grimorio.service.MapaBase.K_CRIAR;
import static br.com.grimorio.service.MapaBase.K_FICHA;
import static br.com.grimorio.service.MapaBase.K_MUDAR;
import static br.com.grimorio.service.MapaBase.K_ORDEM;
import static br.com.grimorio.service.MapaBase.K_VIDA_MAX;
import static br.com.grimorio.service.MapaBase.K_VINCULO;
import static br.com.grimorio.service.MapaBase.MSG_TRANCADO;

/**
 * Os tokens de uma ficha vistos da propria ficha: quais pecas estao ligadas a ela em cada mapa, pôr a ficha num
 * mapa e ligar ou desligar uma peca que ja esta posta. O mestre mexe em qualquer mapa; o dono da ficha so no mapa
 * ativo e so nas pecas que ele controla. Ficha que a pessoa nao pode ver responde 404, como no FichaController.
 */
@Service
public class MapaFichas {

    private static final String K_IMG = "img";
    private static final String K_TOKEN = "token";
    private static final String K_TOKENS = "tokens";
    static final String K_VARS = "vars";
    static final String K_VARIANTE = "variante";
    private static final int MAX_VARIANTES = 8;
    /* a coluna de dados do token tem 4000; a folga e para o que o mapa ainda grava nele (posicao, marcas, vida) */
    private static final int MAX_DADOS = 3200;
    private static final Pattern ID_VARIANTE = Pattern.compile("[A-Za-z0-9_-]{1,16}");
    private static final String K_VIDA_CAMPO = "vidaCampo";
    private static final String CAMADA_PERSONAGENS = "personagens";
    /* a barra que vira a vida do token: de preferencia a que se chama vida (mesma regra da tela, mpVidaDaFicha) */
    private static final Pattern VIDA = Pattern.compile("vida|pv|hp", Pattern.CASE_INSENSITIVE);

    private final MapaRepo mapas;
    private final MapaElementoRepo elementos;
    private final FichaRepo fichas;
    private final CampanhaService camp;
    private final MapaBase base;
    private final MapaAvisos avisos;
    private final TransactionTemplate tx;
    private final ObjectMapper om = JsonMapper.builder().build();

    MapaFichas(MapaRepo mapas, MapaElementoRepo elementos, FichaRepo fichas, CampanhaService camp, MapaBase base,
               MapaAvisos avisos, PlatformTransactionManager ptm) {
        this.mapas = mapas;
        this.elementos = elementos;
        this.fichas = fichas;
        this.camp = camp;
        this.base = base;
        this.avisos = avisos;
        this.tx = new TransactionTemplate(ptm);
    }

    // ---------- leitura ----------

    /**
     * As pecas ligadas a esta ficha. O jogador ve so as que estao a vista (nao ocultas) e, delas, as do mapa ativo
     * ou as que ele controla; o nome de um mapa que nao esta ativo nao sai para ele.
     */
    public List<Map<String, Object>> tokens(long cid, long uid, long fichaId) {
        boolean mestre = ehMestre(cid, uid);
        ficha(cid, uid, fichaId, mestre);
        Map<Long, Mapa> ms = mapasDa(cid);
        List<Map<String, Object>> out = new ArrayList<>();
        for (MapaElemento e : tokensDa(cid)) {
            Mapa m = ms.get(e.getMapaId());
            ObjectNode d = base.ler(e.getDados());
            if (m == null || d.path(K_FICHA).asLong(-1) != fichaId || !aVista(e, m, mestre, uid)) continue;
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("id", e.getId());
            r.put("mapa", m.getId());
            r.put("mapaNome", mestre || m.isAtivo() ? m.getNome() : null);
            r.put("ativo", m.isAtivo());
            r.put("nome", d.path("nome").asString(""));
            r.put(K_IMG, d.path(K_IMG).asString(""));
            r.put("visivel", e.isVisivel());
            r.put(K_VINCULO, d.path(K_VINCULO).asBoolean(false));
            r.put("podeSoltar", mestre || e.getDono() == uid);
            r.put(K_ORDEM, m.getOrdem());
            out.add(r);
        }
        out.sort(Comparator.comparingInt((Map<String, Object> r) -> (Integer) r.get(K_ORDEM))
                .thenComparingLong(r -> (Long) r.get("id")));
        out.forEach(r -> r.remove(K_ORDEM));
        return out;
    }

    /**
     * A imagem de token de cada ficha, para a lista de fichas mostrar quando a ficha nao tem icone proprio. Vale a
     * mesma regra de quem ve o que em {@link #tokens}; com mais de uma peca, a do mapa ativo ganha.
     */
    public Map<Long, String> imagens(long cid, long uid) {
        boolean mestre = ehMestre(cid, uid);
        Map<Long, Mapa> ms = mapasDa(cid);
        Map<Long, String> out = new HashMap<>();
        Set<Long> doAtivo = new HashSet<>();
        for (MapaElemento e : tokensDa(cid)) {
            Mapa m = ms.get(e.getMapaId());
            ObjectNode d = base.ler(e.getDados());
            String img = d.path(K_IMG).asString("");
            long f = d.path(K_FICHA).asLong(-1);
            if (m == null || f < 0 || img.isEmpty() || !aVista(e, m, mestre, uid) || doAtivo.contains(f)) continue;
            if (m.isAtivo()) doAtivo.add(f);
            if (m.isAtivo() || !out.containsKey(f)) out.put(f, img);
        }
        return out;
    }

    // ---------- pôr, ligar e soltar ----------

    /**
     * Cria uma peca desta ficha no mapa: nome, imagem do token (ou o icone), vida e alcance da visao vem da ficha, o dono e o da ficha e o
     * vinculo nasce ligado. O jogador so poe no mapa ativo, uma peca por ficha, ao lado de uma peca que ja e dele;
     * sem nenhuma e com nevoa, quem poe a primeira e o mestre (no meio do mapa ele enxergaria o que a nevoa esconde).
     */
    public Map<String, Object> por(long cid, long uid, long fichaId, long mid) {
        boolean mestre = ehMestre(cid, uid);
        Ficha f = ficha(cid, uid, fichaId, mestre);
        ObjectNode conteudo = base.ler(f.getConteudo());
        MapaFeito feito = Objects.requireNonNull(base.travado(mid, () -> tx.execute(s -> {
            Mapa m = base.visivelPara(cid, mid, mestre);
            if (elementos.countByMapaId(mid) >= MapaService.MAX_ELEMENTOS) throw new IllegalArgumentException("elementos demais neste mapa");
            List<MapaElemento> doMapa = elementos.findByMapaIdAndTipo(mid, MapaElemento.Tipo.TOKEN);
            Map<String, Object> in = new HashMap<>(daFicha(f, conteudo));
            in.put(K_FICHA, fichaId);
            in.put(K_VINCULO, true);
            if (!mestre) in.putAll(lugarDoJogador(m, doMapa, uid, fichaId));
            MapaElemento x = new MapaElemento();
            x.setMapaId(mid);
            x.setCampanhaId(cid);
            x.setTipo(MapaElemento.Tipo.TOKEN);
            x.setCamada(CAMADA_PERSONAGENS);
            x.setDono(f.getUsuarioId());
            x.setOrdem((int) elementos.countByMapaId(mid));
            ObjectNode novo = MapaRegras.dadosToken(om.createObjectNode(), in, m);
            vesteToken(novo, conteudo);
            x.setDados(om.writeValueAsString(novo));
            elementos.save(x);
            m.setSeq(m.getSeq() + 1);
            mapas.save(m);
            base.registra(m, uid, K_CRIAR, x.getId(), base.elCruTexto(x), "");
            return new MapaFeito(x, m, false);
        })));
        avisos.publicaElemento(cid, feito);
        return base.elJson(feito.e(), feito.m(), mestre, uid);
    }

    /**
     * Liga uma peca que ja esta no mapa a esta ficha: ela passa a seguir a vida e o alcance da ficha, e quem a
     * controla passa a ser o dono da ficha. O jogador so liga peca que ele controla, no mapa ativo, e nunca tira
     * uma peca da ficha de outra pessoa.
     */
    public Map<String, Object> vincular(long cid, long uid, long fichaId, long mid, long eid) {
        boolean mestre = ehMestre(cid, uid);
        Ficha f = ficha(cid, uid, fichaId, mestre);
        ObjectNode conteudo = base.ler(f.getConteudo());
        MapaFeito feito = Objects.requireNonNull(base.travado(mid, () -> tx.execute(s -> {
            Mapa m = base.visivelPara(cid, mid, mestre);
            MapaElemento x = elementos.findById(eid)
                    .filter(e -> Objects.equals(e.getMapaId(), mid) && e.getTipo() == MapaElemento.Tipo.TOKEN)
                    .filter(e -> mestre || (e.isVisivel() && e.getDono() == uid))
                    .orElseThrow(MapaService.NaoAchado::new);
            if (base.trancado(x, m)) throw new IllegalStateException(MSG_TRANCADO);
            ObjectNode d = base.ler(x.getDados());
            long antiga = d.path(K_FICHA).asLong(-1);
            if (!mestre && antiga >= 0 && antiga != fichaId && !fichaDe(antiga, uid)) {
                throw new CampanhaService.SemAcessoException("Este token está ligado à ficha de outra pessoa.");
            }
            String antes = base.elCruTexto(x);
            boolean via = x.isVisivel();
            d.put(K_FICHA, fichaId);
            d.put(K_VINCULO, true);
            aplicaFicha(d, daFicha(f, conteudo));
            vesteToken(d, conteudo);
            x.setDados(om.writeValueAsString(d));
            x.setDono(f.getUsuarioId());
            elementos.save(x);
            m.setSeq(m.getSeq() + 1);
            mapas.save(m);
            base.registra(m, uid, K_MUDAR, x.getId(), base.elCruTexto(x), antes);
            return new MapaFeito(x, m, via);
        })));
        avisos.publicaElemento(cid, feito);
        return base.elJson(feito.e(), feito.m(), mestre, uid);
    }

    /** Desliga a peca desta ficha: ela fica no mapa como estava, com a vida propria, e para de seguir a ficha. */
    public void soltar(long cid, long uid, long fichaId, long eid) {
        boolean mestre = ehMestre(cid, uid);
        ficha(cid, uid, fichaId, mestre);
        long mid = elementos.findById(eid).filter(e -> Objects.equals(e.getCampanhaId(), cid))
                .map(MapaElemento::getMapaId).orElseThrow(MapaService.NaoAchado::new);
        MapaFeito feito = base.travado(mid, () -> tx.execute(s -> {
            Mapa m = base.doMestre(cid, mid);
            MapaElemento x = elementos.findById(eid)
                    .filter(e -> e.getTipo() == MapaElemento.Tipo.TOKEN && base.ler(e.getDados()).path(K_FICHA).asLong(-1) == fichaId)
                    .filter(e -> mestre || (e.isVisivel() && e.getDono() == uid))
                    .orElseThrow(MapaService.NaoAchado::new);
            if (base.trancado(x, m)) throw new IllegalStateException(MSG_TRANCADO);
            String antes = base.elCruTexto(x);
            ObjectNode d = base.ler(x.getDados());
            for (String k : List.of(K_FICHA, K_VINCULO, K_VIDA_CAMPO, MapaRegras.K_VISAO_FICHA, K_VARS, K_VARIANTE)) d.remove(k);
            x.setDados(om.writeValueAsString(d));
            elementos.save(x);
            m.setSeq(m.getSeq() + 1);
            mapas.save(m);
            base.registra(m, uid, K_MUDAR, x.getId(), base.elCruTexto(x), antes);
            return new MapaFeito(x, m, x.isVisivel());
        }));
        if (feito != null) avisos.publicaElemento(cid, feito);
    }

    // ---------- regras internas ----------

    private boolean ehMestre(long cid, long uid) {
        return camp.exigeMembro(cid, uid) == Papel.MESTRE;
    }

    /* ficha de outra pessoa nao existe para o jogador: 404, como no FichaController */
    private Ficha ficha(long cid, long uid, long fichaId, boolean mestre) {
        return fichas.findById(fichaId)
                .filter(f -> Objects.equals(f.getCampanhaId(), cid))
                .filter(f -> mestre || Objects.equals(f.getUsuarioId(), uid))
                .orElseThrow(MapaService.NaoAchado::new);
    }

    private boolean fichaDe(long fichaId, long uid) {
        return fichas.findById(fichaId).map(f -> Objects.equals(f.getUsuarioId(), uid)).orElse(true);
    }

    private Map<Long, Mapa> mapasDa(long cid) {
        Map<Long, Mapa> ms = new HashMap<>();
        for (Mapa m : mapas.findByCampanhaIdOrderByOrdemAscIdAsc(cid)) ms.put(m.getId(), m);
        return ms;
    }

    private List<MapaElemento> tokensDa(long cid) {
        return elementos.findByCampanhaIdAndTipo(cid, MapaElemento.Tipo.TOKEN);
    }

    /** o mestre ve tudo; o jogador, a peca nao oculta do mapa ativo ou a que ele controla */
    private static boolean aVista(MapaElemento e, Mapa m, boolean mestre, long uid) {
        return mestre || (e.isVisivel() && (m.isAtivo() || e.getDono() == uid));
    }

    /** Onde nasce a peca que o jogador poe: uma casa a direita de uma peca dele; sem nenhuma, no meio (so sem nevoa). */
    private Map<String, Object> lugarDoJogador(Mapa m, List<MapaElemento> doMapa, long uid, long fichaId) {
        MapaElemento perto = null;
        for (MapaElemento e : doMapa) {
            if (base.ler(e.getDados()).path(K_FICHA).asLong(-1) == fichaId) {
                throw new IllegalStateException("Esta ficha já tem um token neste mapa.");
            }
            if (perto == null && e.getDono() == uid && e.isVisivel()) perto = e;
        }
        if (perto != null) {
            ObjectNode d = base.ler(perto.getDados());
            double casa = base.ler(m.getGrid()).path("tam").asDouble(70);
            return Map.of("x", d.path("x").asDouble(0) + casa, "y", d.path("y").asDouble(0));
        }
        if (!MapaNevoa.NENHUM.equals(base.ler(m.getRegras()).path("fog").asString(MapaNevoa.NENHUM))) {
            throw new IllegalStateException("Este mapa tem névoa: peça ao mestre para pôr o primeiro token.");
        }
        return Map.of();
    }

    /** Nome, imagem do token, vida e alcance da visao como a ficha os tem, no formato dos dados do token. */
    private static Map<String, Object> daFicha(Ficha f, ObjectNode conteudo) {
        Map<String, Object> in = new HashMap<>();
        in.put("nome", f.getNome());
        in.put(K_IMG, imagemDoToken(conteudo));
        JsonNode barra = barraDeVida(conteudo);
        if (barra != null) {
            in.put(K_VIDA_MAX, numero(barra.path("max").asString("")));
            in.put("vida", numero(barra.path("val").asString("")));
            in.put(K_VIDA_CAMPO, barra.path("rot").asString(""));
        }
        JsonNode v = conteudo.path("visao");
        if (v.isNumber() || (v.isString() && !v.asString("").isBlank())) in.put(MapaRegras.K_VISAO_FICHA, v.isNumber() ? v.asDouble() : numero(v.asString("")));
        return in;
    }

    /** Na peca que ja existia, a ficha so traz o que ela tem: sem barra, a peca fica com a vida dela (a imagem e de vesteToken). */
    private static void aplicaFicha(ObjectNode d, Map<String, Object> in) {
        if (in.containsKey(K_VIDA_CAMPO) && ((Number) in.get(K_VIDA_MAX)).doubleValue() > 0) {
            double max = (double) Math.round(Math.clamp(((Number) in.get(K_VIDA_MAX)).doubleValue(), 1, 99999));
            d.put(K_VIDA_MAX, max);
            d.put("vida", Math.round(Math.clamp(((Number) in.get("vida")).doubleValue(), 0, max)));
            d.put(K_VIDA_CAMPO, String.valueOf(in.get(K_VIDA_CAMPO)));
        } else {
            d.remove(K_VIDA_CAMPO);
        }
        if (in.get(MapaRegras.K_VISAO_FICHA) instanceof Number n) {
            d.put(MapaRegras.K_VISAO_FICHA, Math.round(Math.clamp(n.doubleValue(), 0, 100) * 10) / 10.0);
        } else {
            d.remove(MapaRegras.K_VISAO_FICHA);
        }
    }

    private static JsonNode barraDeVida(ObjectNode conteudo) {
        JsonNode primeira = null;
        for (JsonNode n : conteudo.path("campos")) {
            if (!"barra".equals(n.path("tipo").asString("")) || numero(n.path("max").asString("")) <= 0) continue;
            if (VIDA.matcher(n.path("rot").asString("")).find()) return n;
            if (primeira == null) primeira = n;
        }
        return primeira;
    }

    /**
     * As variacoes de token da ficha ({@code tokens} no JSON dela: id, nome e imagem), na ordem dela; a primeira e a
     * padrao. Ficha de antes delas, com uma imagem so de token ({@code token}), vira uma variacao. Variacao sem imagem
     * valida da campanha nao entra.
     */
    static List<ObjectNode> variantes(ObjectNode conteudo) {
        List<ObjectNode> out = new ArrayList<>();
        Set<String> ids = new HashSet<>();
        for (JsonNode v : conteudo.path(K_TOKENS)) {
            String id = v.path("id").asString("").trim();
            String img = imagem(v.path(K_IMG).asString(""));
            if (!ID_VARIANTE.matcher(id).matches() || img.isEmpty() || !ids.add(id) || out.size() >= MAX_VARIANTES) continue;
            out.add(JsonNodeFactory.instance.objectNode().put("id", id)
                    .put("nome", MapaRegras.corta(v.path("nome").asString("").trim(), 30)).put(K_IMG, img));
        }
        String antiga = imagem(conteudo.path(K_TOKEN).asString(""));
        if (out.isEmpty() && !antiga.isEmpty()) out.add(JsonNodeFactory.instance.objectNode().put("id", "t").put("nome", "").put(K_IMG, antiga));
        return out;
    }

    /** A imagem com que o token da ficha nasce: a da primeira variacao e, sem nenhuma, o icone. Vazio sem as duas. */
    static String imagemDoToken(ObjectNode conteudo) {
        List<ObjectNode> vs = variantes(conteudo);
        return vs.isEmpty() ? imagem(conteudo.path(K_IMG).asString("")) : vs.getFirst().path(K_IMG).asString("");
    }

    /**
     * Veste o token com as variacoes da ficha. Ele guarda a copia delas ({@code vars}): e dali que a troca no mapa tira a
     * imagem, sem aceitar caminho vindo do navegador. A variacao escolhida fica se ainda existe (senao, a primeira) e a
     * imagem e a dela. Sem variacao, a imagem e o icone; ficha sem imagem nenhuma deixa a do token como estava. A copia
     * cabe na coluna de dados do token: passando do limite, as ultimas variacoes ficam de fora. Devolve se algo mudou.
     */
    static boolean vesteToken(ObjectNode d, ObjectNode conteudo) {
        String antes = d.toString();
        List<ObjectNode> vs = variantes(conteudo);
        if (vs.isEmpty()) {
            d.remove(K_VARS);
            d.remove(K_VARIANTE);
            String icone = imagem(conteudo.path(K_IMG).asString(""));
            if (!icone.isEmpty()) d.put(K_IMG, icone);
            return !antes.equals(d.toString());
        }
        String atual = d.path(K_VARIANTE).asString("");
        ObjectNode escolhida = vs.stream().filter(v -> v.path("id").asString("").equals(atual)).findFirst().orElse(vs.getFirst());
        ArrayNode a = d.putArray(K_VARS);
        vs.forEach(a::add);
        d.put(K_VARIANTE, escolhida.path("id").asString(""));
        d.put(K_IMG, escolhida.path(K_IMG).asString(""));
        while (d.toString().length() > MAX_DADOS && a.size() > 1) a.remove(a.size() - 1);
        return !antes.equals(d.toString());
    }

    /** a imagem e texto livre do JSON da ficha: so entra no token se for um caminho de imagem da campanha */
    private static String imagem(String s) {
        try {
            return MapaRegras.caminhoImagem(s);
        } catch (IllegalArgumentException _) {
            return "";
        }
    }

    private static double numero(String s) {
        try {
            return Double.parseDouble(s == null ? "" : s.trim().replace(',', '.'));
        } catch (NumberFormatException _) {
            return 0;
        }
    }
}
