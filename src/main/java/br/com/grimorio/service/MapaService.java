package br.com.grimorio.service;

import br.com.grimorio.config.AppProps;
import br.com.grimorio.model.Ficha;
import br.com.grimorio.model.Mapa;
import br.com.grimorio.model.MapaElemento;
import br.com.grimorio.model.MapaHistorico;
import br.com.grimorio.model.Papel;
import br.com.grimorio.repo.FichaRepo;
import br.com.grimorio.repo.MapaElementoRepo;
import br.com.grimorio.repo.MapaHistoricoRepo;
import br.com.grimorio.repo.MapaRepo;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * Tabletop: mapas, o que esta em cima deles e o log de operacoes.
 *
 * Toda mudanca passa por aqui, uma por vez por mapa (trava em memoria: a instancia e unica),
 * sobe o {@code seq} do mapa, entra no historico e sai para quem esta com o mapa aberto
 * (MapaEventos). O corte mestre/jogador e feito aqui e so aqui: mapa que nao esta ativo,
 * elemento oculto e o vinculo com o guia nunca saem para o jogador.
 */
@Service
public class MapaService {

    public static class NaoAchado extends RuntimeException {
        public NaoAchado() { super("não encontrado"); }
    }

    /** O que a tela manda para criar ou mudar um mapa. Campo nulo nao muda. */
    public static class CorpoMapa {
        public String nome;
        public String imagem;
        public Map<String, Object> grid;
        public Map<String, Object> regras;
        public String cenaId;
        /** so valem num mapa sem imagem (com imagem, o tamanho e o dela) */
        public Integer largura;
        public Integer altura;
    }

    /** O que a tela manda para criar ou mudar um elemento. Campo nulo nao muda; {@code dados} mescla. */
    public static class CorpoElemento {
        public String tipo;
        public Long dono;
        public Boolean visivel;
        public Map<String, Object> dados;
    }

    /** o elemento e o mapa como ficaram ao fim da operacao, ja fora da transacao, e se o
     *  jogador via o elemento antes dela (so quem via recebe o aviso de que ele sumiu) */
    private record Feito(MapaElemento e, Mapa m, boolean eraVisivel) { }

    private static final int MAX_MAPAS = 100;
    private static final int MAX_ELEMENTOS = 1000;
    private static final int LADO_MIN = 200;
    private static final int LADO_MAX = 16000;
    private static final int LADO_PADRAO_L = 2100;
    private static final int LADO_PADRAO_A = 1400;
    private static final String K_TIPO = "tipo";
    private static final String K_ATIVO = "ativo";
    private static final String K_DADOS = "dados";
    private static final String K_LIVRE = "livre";
    private static final String K_FICHA = "fichaId";
    /** o que o jogador recebe de um token: o vinculo com ficha e com o elenco fica com o mestre */
    private static final Set<String> DADOS_DO_JOGADOR = Set.of("x", "y", "tam", "rot", "nome", "img");

    private final MapaRepo mapas;
    private final MapaElementoRepo elementos;
    private final MapaHistoricoRepo historico;
    private final FichaRepo fichas;
    private final CampanhaService camp;
    private final MapaEventos eventos;
    private final TransactionTemplate tx;
    private final Path raizMidia;
    private final ObjectMapper om = JsonMapper.builder().build();
    private final Map<Long, Object> travas = new ConcurrentHashMap<>();

    public MapaService(MapaRepo mapas, MapaElementoRepo elementos, MapaHistoricoRepo historico, FichaRepo fichas,
                       CampanhaService camp, MapaEventos eventos, PlatformTransactionManager ptm, AppProps props) {
        this.mapas = mapas;
        this.elementos = elementos;
        this.historico = historico;
        this.fichas = fichas;
        this.camp = camp;
        this.eventos = eventos;
        this.tx = new TransactionTemplate(ptm);
        this.raizMidia = Paths.get(props.getMidiaDir()).toAbsolutePath().normalize();
    }

    // ---------- leitura ----------

    /** Mestre: todos os mapas. Jogador: so o ativo, se houver. */
    public List<Map<String, Object>> listar(long cid, long uid) {
        boolean mestre = camp.exigeMembro(cid, uid) == Papel.MESTRE;
        List<Map<String, Object>> out = new ArrayList<>();
        for (Mapa m : mapas.findByCampanhaIdOrderByOrdemAscIdAsc(cid)) {
            if (mestre || m.isAtivo()) out.add(mapaJson(m, mestre));
        }
        return out;
    }

    /**
     * Estado inteiro do mapa como aquela pessoa pode ver. Com {@code desde} igual ao seq atual
     * devolve so o seq: e o polling de quem ficou sem SSE.
     */
    public Map<String, Object> estado(long cid, long uid, long mid, Long desde) {
        boolean mestre = camp.exigeMembro(cid, uid) == Papel.MESTRE;
        Mapa m = visivelPara(cid, mid, mestre);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("seq", m.getSeq());
        if (desde != null && desde == m.getSeq()) {
            r.put("igual", true);
            return r;
        }
        r.put("mapa", mapaJson(m, mestre));
        List<Map<String, Object>> els = new ArrayList<>();
        for (MapaElemento e : elementos.findByMapaIdOrderByOrdemAscIdAsc(mid)) {
            if (mestre || e.isVisivel()) els.add(elJson(e, m, mestre, uid));
        }
        r.put("elementos", els);
        return r;
    }

    public SseEmitter inscrever(long cid, long uid) {
        camp.exigeMembro(cid, uid);
        Long ativo = mapas.findFirstByCampanhaIdAndAtivoTrue(cid).map(Mapa::getId).orElse(null);
        return eventos.inscrever(cid, uid, ativo);
    }

    // ---------- mapa (so mestre) ----------

    public Map<String, Object> criar(long cid, long uid, CorpoMapa c) {
        camp.exigeMestre(cid, uid);
        if (mapas.countByCampanhaId(cid) >= MAX_MAPAS) throw new IllegalArgumentException("mapas demais nesta campanha");
        Mapa m = new Mapa();
        m.setCampanhaId(cid);
        m.setNome("Mapa sem nome");
        m.setGrid(om.writeValueAsString(MapaRegras.grid(null)));
        m.setRegras(om.writeValueAsString(MapaRegras.regras(null)));
        m.setOrdem((int) mapas.countByCampanhaId(cid));
        aplicaMapa(m, c, cid);
        if (m.getLargura() <= 0) { m.setLargura(LADO_PADRAO_L); m.setAltura(LADO_PADRAO_A); }
        Mapa salvo = tx.execute(s -> mapas.save(m));
        eventos.publicar(cid, (p, u) -> p == Papel.MESTRE ? evento("lista", null) : null);
        return mapaJson(Objects.requireNonNull(salvo), true);
    }

    public Map<String, Object> editar(long cid, long uid, long mid, CorpoMapa c) {
        camp.exigeMestre(cid, uid);
        Mapa m = travado(mid, () -> tx.execute(s -> {
            Mapa x = doMestre(cid, mid);
            String antes = om.writeValueAsString(mapaJson(x, true));
            aplicaMapa(x, c, cid);
            x.setSeq(x.getSeq() + 1);
            x.setAtualizadoEm(Instant.now());
            mapas.save(x);
            registra(x, uid, "mapa", 0, om.writeValueAsString(mapaJson(x, true)), antes);
            return x;
        }));
        eventos.publicar(cid, (p, u) -> {
            boolean mestre = p == Papel.MESTRE;
            if (!mestre && !m.isAtivo()) return null;
            Map<String, Object> ev = evento("mapa", m.getSeq());
            ev.put("mapa", mapaJson(m, mestre));
            return ev;
        });
        return mapaJson(m, true);
    }

    /** Liga (ou desliga) o mapa que os jogadores veem. So um fica ativo por campanha. */
    public Map<String, Object> ativar(long cid, long uid, long mid, boolean ligar) {
        camp.exigeMestre(cid, uid);
        Long ativo = tx.execute(s -> {
            Mapa alvo = doMestre(cid, mid);
            for (Mapa m : mapas.findByCampanhaIdOrderByOrdemAscIdAsc(cid)) {
                boolean fica = ligar && Objects.equals(m.getId(), alvo.getId());
                if (m.isAtivo() != fica) { m.setAtivo(fica); mapas.save(m); }
            }
            return ligar ? alvo.getId() : null;
        });
        publicaAtivo(cid, ativo);
        return Collections.singletonMap(K_ATIVO, ativo);
    }

    public void apagar(long cid, long uid, long mid) {
        camp.exigeMestre(cid, uid);
        boolean eraAtivo = Boolean.TRUE.equals(travado(mid, () -> tx.execute(s -> {
            Mapa m = doMestre(cid, mid);
            elementos.deleteByMapaId(mid);
            historico.deleteByMapaId(mid);
            mapas.delete(m);
            return m.isAtivo();
        })));
        travas.remove(mid);
        eventos.publicar(cid, (p, u) -> p == Papel.MESTRE ? evento("lista", null) : null);
        if (eraAtivo) publicaAtivo(cid, null);
    }

    /** Campanha apagada: chamado dentro da transacao de CampanhaController. */
    public void apagarDaCampanha(long cid) {
        historico.deleteByCampanhaId(cid);
        elementos.deleteByCampanhaId(cid);
        mapas.deleteByCampanhaId(cid);
    }

    // ---------- elementos ----------

    public Map<String, Object> criarElemento(long cid, long uid, long mid, CorpoElemento c) {
        camp.exigeMestre(cid, uid);
        Feito f = feito(travado(mid, () -> tx.execute(s -> {
            Mapa m = doMestre(cid, mid);
            if (elementos.countByMapaId(mid) >= MAX_ELEMENTOS) throw new IllegalArgumentException("elementos demais neste mapa");
            MapaElemento x = new MapaElemento();
            x.setMapaId(mid);
            x.setCampanhaId(cid);
            x.setTipo(tipo(c.tipo));
            x.setCamada("personagens");
            ObjectNode d = MapaRegras.dadosToken(om.createObjectNode(), c.dados, m);
            x.setDono(donoInicial(cid, c, d));
            if (c.visivel != null) x.setVisivel(c.visivel);
            x.setOrdem((int) elementos.countByMapaId(mid));
            x.setDados(om.writeValueAsString(d));
            elementos.save(x);
            m.setSeq(m.getSeq() + 1);
            mapas.save(m);
            registra(m, uid, "criar", x.getId(), om.writeValueAsString(elCru(x)), "");
            return new Feito(x, m, false);
        })));
        publicaElemento(cid, f);
        return elJson(f.e(), f.m(), true, uid);
    }

    /**
     * Mestre muda tudo. Jogador so move (x e y), e so o token que pode mover: o dele, o liberado
     * pelo mestre, ou qualquer um quando o mapa libera para todos. Elemento oculto e mapa que nao
     * esta ativo respondem 404 para ele, como ficha de outra pessoa.
     */
    public Map<String, Object> mudarElemento(long cid, long uid, long mid, long eid, CorpoElemento c) {
        boolean mestre = camp.exigeMembro(cid, uid) == Papel.MESTRE;
        Feito f = feito(travado(mid, () -> tx.execute(s -> {
            Mapa m = visivelPara(cid, mid, mestre);
            MapaElemento x = elementos.findById(eid)
                    .filter(e -> Objects.equals(e.getMapaId(), mid))
                    .filter(e -> mestre || e.isVisivel())
                    .orElseThrow(NaoAchado::new);
            if (!mestre && !podeMover(x, m, uid)) throw new CampanhaService.SemAcessoException("este token não é seu para mover");
            String antes = om.writeValueAsString(elCru(x));
            boolean via = x.isVisivel();
            aplicaElemento(x, c, m, mestre);
            elementos.save(x);
            m.setSeq(m.getSeq() + 1);
            mapas.save(m);
            registra(m, uid, "mudar", eid, om.writeValueAsString(elCru(x)), antes);
            return new Feito(x, m, via);
        })));
        publicaElemento(cid, f);
        return elJson(f.e(), f.m(), mestre, uid);
    }

    public void removerElemento(long cid, long uid, long mid, long eid) {
        camp.exigeMestre(cid, uid);
        Feito f = feito(travado(mid, () -> tx.execute(s -> {
            Mapa m = doMestre(cid, mid);
            MapaElemento x = elementos.findById(eid)
                    .filter(e -> Objects.equals(e.getMapaId(), mid))
                    .orElseThrow(NaoAchado::new);
            String antes = om.writeValueAsString(elCru(x));
            elementos.delete(x);
            m.setSeq(m.getSeq() + 1);
            mapas.save(m);
            registra(m, uid, "remover", eid, "", antes);
            return new Feito(x, m, x.isVisivel());
        })));
        eventos.publicar(cid, (p, u) -> {
            if (p == Papel.MESTRE) return some(f);
            return f.m().isAtivo() && f.eraVisivel() ? some(f) : null;
        });
    }

    // ---------- regras internas ----------

    private void aplicaElemento(MapaElemento x, CorpoElemento c, Mapa m, boolean mestre) {
        ObjectNode d = ler(x.getDados());
        if (!mestre) {
            MapaRegras.posicao(d, c.dados, m);
        } else {
            MapaRegras.dadosToken(d, c.dados, m);
            if (c.dono != null) x.setDono(Math.max(0, c.dono));
            if (c.visivel != null) x.setVisivel(c.visivel);
        }
        x.setDados(om.writeValueAsString(d));
    }

    private static Feito feito(Feito f) {
        return Objects.requireNonNull(f, "operação sem resultado");
    }

    private <T> T travado(long mid, Supplier<T> f) {
        Object t = travas.computeIfAbsent(mid, k -> new Object());
        synchronized (t) {
            return f.get();
        }
    }

    private Mapa doMestre(long cid, long mid) {
        return mapas.findById(mid).filter(m -> Objects.equals(m.getCampanhaId(), cid)).orElseThrow(NaoAchado::new);
    }

    /** Jogador so enxerga o mapa ativo; os outros nao existem para ele. */
    private Mapa visivelPara(long cid, long mid, boolean mestre) {
        Mapa m = doMestre(cid, mid);
        if (!mestre && !m.isAtivo()) throw new NaoAchado();
        return m;
    }

    private boolean podeMover(MapaElemento e, Mapa m, long uid) {
        if (!e.isVisivel() || e.isBloqueado()) return false;
        if (e.getDono() == uid) return true;
        if (ler(e.getDados()).path(K_LIVRE).asBoolean(false)) return true;
        return "todos".equals(ler(m.getRegras()).path("quem").asString(""));
    }

    private static MapaElemento.Tipo tipo(String t) {
        if (t == null || t.isBlank()) return MapaElemento.Tipo.TOKEN;
        MapaElemento.Tipo x = MapaElemento.Tipo.valueOf(t.trim().toUpperCase(Locale.ROOT));
        /* desenho, parede e fog chegam nas fases seguintes, com as regras deles */
        if (x != MapaElemento.Tipo.TOKEN) throw new IllegalArgumentException("tipo de elemento ainda não suportado");
        return x;
    }

    /** Token que nasce de ficha e de quem e dono da ficha; a ficha precisa ser desta campanha. */
    private long donoInicial(long cid, CorpoElemento c, ObjectNode d) {
        if (d.hasNonNull(K_FICHA)) {
            Ficha f = fichas.findById(d.get(K_FICHA).asLong())
                    .filter(x -> Objects.equals(x.getCampanhaId(), cid))
                    .orElseThrow(() -> new IllegalArgumentException("ficha não encontrada nesta campanha"));
            if (c.dono == null) return f.getUsuarioId();
        }
        return c.dono == null ? 0 : Math.max(0, c.dono);
    }

    private void aplicaMapa(Mapa m, CorpoMapa c, long cid) {
        if (c == null) return;
        if (c.nome != null) {
            String n = c.nome.trim();
            m.setNome(n.isEmpty() ? "Mapa sem nome" : MapaRegras.corta(n, 120));
        }
        if (c.imagem != null && !c.imagem.equals(m.getImagem())) {
            String img = MapaRegras.caminhoImagem(c.imagem);
            m.setImagem(img);
            int[] wh = img.isEmpty() ? null : dimensoes(cid, img);
            if (wh != null) { m.setLargura(wh[0]); m.setAltura(wh[1]); }
        }
        if (m.getImagem().isEmpty() && c.largura != null && c.altura != null) {
            m.setLargura(Math.clamp(c.largura, LADO_MIN, LADO_MAX));
            m.setAltura(Math.clamp(c.altura, LADO_MIN, LADO_MAX));
        }
        if (c.grid != null) m.setGrid(om.writeValueAsString(MapaRegras.grid(c.grid)));
        if (c.regras != null) m.setRegras(om.writeValueAsString(MapaRegras.regras(c.regras)));
        if (c.cenaId != null) m.setCenaId(MapaRegras.corta(c.cenaId.trim(), 80));
    }

    private int[] dimensoes(long cid, String img) {
        Path raiz = raizMidia.resolve("c" + cid);
        Path arq = raiz.resolve(img).normalize();
        if (!arq.startsWith(raiz.resolve("img"))) throw new IllegalArgumentException("imagem fora da campanha");
        return Miniaturas.dimensoes(arq).orElseThrow(() -> new IllegalArgumentException("não consegui ler essa imagem"));
    }

    private void registra(Mapa m, long uid, String op, long eid, String depois, String antes) {
        MapaHistorico h = new MapaHistorico();
        h.setMapaId(m.getId());
        h.setCampanhaId(m.getCampanhaId());
        h.setSeq(m.getSeq());
        h.setUsuarioId(uid);
        h.setOperacao(op);
        h.setElementoId(eid);
        h.setDepois(MapaRegras.corta(depois, 8000));
        h.setAntes(MapaRegras.corta(antes, 8000));
        historico.save(h);
    }

    private void publicaAtivo(long cid, Long ativo) {
        eventos.publicar(cid, (p, u) -> {
            Map<String, Object> ev = evento(K_ATIVO, null);
            ev.put(K_ATIVO, ativo);
            return ev;
        });
    }

    /** Cada um recebe o elemento como pode ver: o jogador que perde a vista recebe "some". */
    private void publicaElemento(long cid, Feito f) {
        eventos.publicar(cid, (p, u) -> {
            boolean mestre = p == Papel.MESTRE;
            if (!mestre && !f.m().isAtivo()) return null;
            /* oculto: quem via fica sabendo que sumiu; quem nunca viu nao recebe nada, nem o id */
            if (!mestre && !f.e().isVisivel()) return f.eraVisivel() ? some(f) : null;
            Map<String, Object> ev = evento("elemento", f.m().getSeq());
            ev.put("mapa", f.m().getId());
            ev.put("el", elJson(f.e(), f.m(), mestre, u));
            return ev;
        });
    }

    private static Map<String, Object> some(Feito f) {
        Map<String, Object> ev = evento("some", f.m().getSeq());
        ev.put("mapa", f.m().getId());
        ev.put("id", f.e().getId());
        return ev;
    }

    private static Map<String, Object> evento(String tipo, Long seq) {
        Map<String, Object> ev = new LinkedHashMap<>();
        ev.put(K_TIPO, tipo);
        if (seq != null) ev.put("seq", seq);
        return ev;
    }

    private ObjectNode ler(String json) {
        try {
            JsonNode n = om.readTree(json == null || json.isBlank() ? "{}" : json);
            return n instanceof ObjectNode o ? o : om.createObjectNode();
        } catch (JacksonException _) {
            return om.createObjectNode();
        }
    }

    private Map<String, Object> mapaJson(Mapa m, boolean mestre) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", m.getId());
        r.put("nome", m.getNome());
        r.put("imagem", m.getImagem());
        r.put("largura", m.getLargura());
        r.put("altura", m.getAltura());
        r.put("grid", ler(m.getGrid()));
        r.put("regras", ler(m.getRegras()));
        r.put(K_ATIVO, m.isAtivo());
        r.put("ordem", m.getOrdem());
        r.put("seq", m.getSeq());
        if (mestre) r.put("cenaId", m.getCenaId());
        return r;
    }

    /** O elemento como esta no banco, para o historico. */
    private Map<String, Object> elCru(MapaElemento e) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", e.getId());
        r.put(K_TIPO, e.getTipo().name());
        r.put("camada", e.getCamada());
        r.put("dono", e.getDono());
        r.put("visivel", e.isVisivel());
        r.put("bloqueado", e.isBloqueado());
        r.put("ordem", e.getOrdem());
        r.put(K_DADOS, ler(e.getDados()));
        return r;
    }

    private Map<String, Object> elJson(MapaElemento e, Mapa m, boolean mestre, long uid) {
        Map<String, Object> r = elCru(e);
        if (!mestre) {
            ObjectNode d = ler(e.getDados());
            d.retain(DADOS_DO_JOGADOR);
            r.put(K_DADOS, d);
            r.remove("bloqueado");
            /* a ordem tem buraco onde ha elemento oculto: a lista ja vem na ordem, o numero nao vai */
            r.remove("ordem");
        }
        r.put("meu", e.getDono() == uid);
        r.put("podeMover", mestre || podeMover(e, m, uid));
        return r;
    }
}
