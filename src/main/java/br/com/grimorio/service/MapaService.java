package br.com.grimorio.service;

import br.com.grimorio.config.AppProps;
import br.com.grimorio.model.Ficha;
import br.com.grimorio.model.Mapa;
import br.com.grimorio.model.MapaElemento;
import br.com.grimorio.model.Papel;
import br.com.grimorio.repo.FichaRepo;
import br.com.grimorio.repo.MapaElementoRepo;
import br.com.grimorio.repo.MapaHistoricoRepo;
import br.com.grimorio.repo.MapaRepo;
import br.com.grimorio.repo.UsuarioRepo;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

import static br.com.grimorio.service.MapaBase.K_ATIVO;
import static br.com.grimorio.service.MapaBase.K_CRIAR;
import static br.com.grimorio.service.MapaBase.K_FICHA;
import static br.com.grimorio.service.MapaBase.K_ID;
import static br.com.grimorio.service.MapaBase.K_MARCAS;
import static br.com.grimorio.service.MapaBase.K_MUDAR;
import static br.com.grimorio.service.MapaBase.K_REMOVER;
import static br.com.grimorio.service.MapaBase.K_SEQ;
import static br.com.grimorio.service.MapaBase.K_TRANCADAS;
import static br.com.grimorio.service.MapaBase.MSG_TRANCADO;

/**
 * Tabletop: mapas, o que esta em cima deles e o log de operacoes.
 *
 * Toda mudanca passa por aqui, uma por vez por mapa (a trava mora em MapaBase), sobe o {@code seq} do
 * mapa, entra no historico e sai para quem esta com o mapa aberto (MapaAvisos). O corte mestre/jogador
 * de quem pede e feito aqui e so aqui: mapa que nao esta ativo, elemento oculto e o vinculo com o guia
 * nunca saem para o jogador. As partes maiores moram ao lado: MapaMovimento (paredes e deslocamento),
 * MapaDesfazer (desfazer e historico), MapaIniciativa (turnos) e MapaVida (token e ficha).
 */
@Service
public class MapaService {

    public static class NaoAchado extends RuntimeException {
        public NaoAchado() { super("não encontrado"); }
    }

    /** Bloqueio de movimento: o token passaria do deslocamento do turno e o mapa esta em modo "bloqueio". */
    public static class LimiteDeMovimento extends RuntimeException {
        public LimiteDeMovimento(String msg) { super(msg); }
    }

    /** O jogador nao tem por onde ir: ha parede (ou porta fechada) fechando todos os caminhos ate o ponto escolhido. */
    public static class ParedeNoCaminho extends RuntimeException {
        public ParedeNoCaminho(String msg) { super(msg); }
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

    /** O turno da iniciativa como o navegador do mestre o informa; {@code ini} e o espelho publico da ordem, repassado aos jogadores. */
    public static class CorpoTurno {
        public Boolean ativo;
        public Integer rodada;
        public String vez;
        /** ids do elenco de quem esta na ordem e tem vinculo; {@code vez} e o id de quem tem a vez */
        public List<String> ids;
        public Map<String, Object> ini;
    }

    /** O que a tela manda para criar ou mudar um elemento. Campo nulo nao muda; {@code dados} mescla. */
    public static class CorpoElemento {
        public String tipo;
        public Long dono;
        public Boolean visivel;
        public Boolean bloqueado;
        public String camada;
        public Map<String, Object> dados;
        /** o caminho que o jogador andou (pontos [x, y]); vale quando o mapa mede pelo trajeto */
        public List<List<Double>> trajeto;
    }

    /** Um item de operacao em grupo: muda (como {@link CorpoElemento}) ou, com {@code remover}, tira o elemento. */
    public static class ItemLote extends CorpoElemento {
        public Long id;
        public Boolean remover;
        /** "frente" ou "tras": vai para cima ou para baixo de tudo o que esta no mapa (dentro da camada pesa a ordem) */
        public String ordem;
    }

    /** Para onde o jogador esta arrastando o token, e o caminho que ele fez ate ali. */
    public static class CorpoRota {
        public Long id;
        public double x;
        public double y;
        public List<List<Double>> trajeto;
    }

    /** Varios elementos de uma vez (mover ou organizar a selecao): uma operacao so, um desfazer so. */
    public static class CorpoLote {
        public List<ItemLote> itens;
    }

    private static final int MAX_MAPAS = 100;
    private static final int MAX_ELEMENTOS = 1000;
    private static final int MAX_LOTE = 300;
    private static final int LADO_MIN = 200;
    private static final int LADO_MAX = 16000;
    private static final int LADO_PADRAO_L = 2100;
    private static final int LADO_PADRAO_A = 1400;
    private static final String K_ENCAIXE = "encaixe";

    private final MapaRepo mapas;
    private final MapaElementoRepo elementos;
    private final MapaHistoricoRepo historico;
    private final FichaRepo fichas;
    private final UsuarioRepo usuarios;
    private final MapaTurnos turnos;
    private final CampanhaService camp;
    private final MapaEventos eventos;
    private final MapaVisao visao;
    private final MapaPartes partes;
    private final TransactionTemplate tx;
    private final Path raizMidia;
    private final ObjectMapper om = JsonMapper.builder().build();
    private final Map<Long, Long> ultimoPing = new ConcurrentHashMap<>();

    /** As partes do mapa que moram em classes proprias, num pacote so para o construtor nao crescer sem fim. */
    record MapaPartes(MapaBase base, MapaAvisos avisos, MapaMovimento movimento, MapaDesfazer desfazer,
                      MapaIniciativa iniciativa, MapaVida vida) { }

    public MapaService(MapaRepo mapas, MapaElementoRepo elementos, MapaHistoricoRepo historico, FichaRepo fichas, // NOSONAR: uma dependencia por tabela e servico do mapa, de proposito
                       UsuarioRepo usuarios, MapaTurnos turnos, CampanhaService camp, MapaEventos eventos, MapaVisao visao,
                       MapaBase base, MapaAvisos avisos, MapaMovimento movimento, MapaDesfazer desfazer,
                       MapaIniciativa iniciativa, MapaVida vida, PlatformTransactionManager ptm, AppProps props) {
        this.mapas = mapas;
        this.elementos = elementos;
        this.historico = historico;
        this.fichas = fichas;
        this.usuarios = usuarios;
        this.turnos = turnos;
        this.camp = camp;
        this.eventos = eventos;
        this.visao = visao;
        this.partes = new MapaPartes(base, avisos, movimento, desfazer, iniciativa, vida);
        this.tx = new TransactionTemplate(ptm);
        this.raizMidia = Paths.get(props.getMidiaDir()).toAbsolutePath().normalize();
    }

    private MapaBase base() { return partes.base(); }
    private MapaAvisos avisos() { return partes.avisos(); }

    // ---------- leitura ----------

    /** Mestre: todos os mapas. Jogador: so o ativo, se houver. */
    public List<Map<String, Object>> listar(long cid, long uid) {
        boolean mestre = ehMestre(cid, uid);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Mapa m : mapas.findByCampanhaIdOrderByOrdemAscIdAsc(cid)) {
            if (mestre || m.isAtivo()) out.add(base().mapaJson(m, mestre));
        }
        return out;
    }

    /**
     * Estado inteiro do mapa como aquela pessoa pode ver. Com {@code desde} igual ao seq atual
     * devolve so o seq: e o polling de quem ficou sem SSE.
     */
    public Map<String, Object> estado(long cid, long uid, long mid, Long desde) {
        boolean mestre = ehMestre(cid, uid);
        Mapa m = base().visivelPara(cid, mid, mestre);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("seq", m.getSeq());
        if (desde != null && desde == m.getSeq()) {
            r.put("igual", true);
            return r;
        }
        r.put("mapa", base().mapaJson(m, mestre));
        List<MapaElemento> todos = elementos.findByMapaIdOrderByOrdemAscIdAsc(mid);
        MapaVisao.Vista vi = mestre ? null : visao.de(m, () -> todos, uid);
        List<Map<String, Object>> els = new ArrayList<>();
        for (MapaElemento e : todos) {
            if (mestre || chegaAoJogador(e, vi, uid)) els.add(base().elJson(e, m, mestre, uid));
        }
        r.put("elementos", els);
        if (vi != null) r.put("vista", vi.json());
        return r;
    }

    /**
     * O corte da nevoa: parede e area de nevoa nunca saem para o jogador (a mascara da vista ja diz o que ele
     * ve); token, so o dele ou o que esta a vista agora; desenho, so o que toca o que ele ve ou lembra.
     */
    private boolean chegaAoJogador(MapaElemento e, MapaVisao.Vista vi, long uid) {
        if (!e.isVisivel() || MapaBase.sempreVisivel(e.getTipo())) return false;
        ObjectNode d = base().ler(e.getDados());
        if (e.getTipo() == MapaElemento.Tipo.TOKEN) return e.getDono() == uid || vi.ve(d.path("x").asDouble(0), d.path("y").asDouble(0));
        double[] c = caixa(d);
        return vi.toca(c[0], c[1], c[2], c[3]);
    }

    /** a caixa dos pontos de um desenho, com uma casa de folga para o rotulo da marcacao */
    private static double[] caixa(ObjectNode d) {
        double[] c = {Double.MAX_VALUE, Double.MAX_VALUE, -Double.MAX_VALUE, -Double.MAX_VALUE};
        for (double[] p : MapaNevoa.pontos(d.path("pts"))) {
            c[0] = Math.min(c[0], p[0]);
            c[1] = Math.min(c[1], p[1]);
            c[2] = Math.max(c[2], p[0]);
            c[3] = Math.max(c[3], p[1]);
        }
        if (c[0] > c[2]) return new double[]{0, 0, 0, 0};
        return c;
    }

    /** As imagens usadas por mapas da campanha (o catalogo do jogador as esconde). */
    public Set<String> imagensDeMapa(long cid) {
        Set<String> out = new HashSet<>();
        for (Mapa m : mapas.findByCampanhaIdOrderByOrdemAscIdAsc(cid)) {
            if (!m.getImagem().isEmpty()) out.add(m.getImagem());
        }
        return out;
    }

    /** Um pedaco da imagem do mapa: e so assim que o jogador recebe a imagem (o caminho dela nao sai para ele). */
    public MapaVisao.Pedaco pedaco(long cid, long uid, long mid, int tx, int ty, String versao) {
        boolean mestre = ehMestre(cid, uid);
        Mapa m = base().visivelPara(cid, mid, mestre);
        return visao.pedaco(m, () -> elementos.findByMapaIdOrderByOrdemAscIdAsc(mid), uid, mestre, tx, ty, versao);
    }

    /** A rota que o servidor cobraria se o token fosse arrastado ate (x, y). So para quem pode mover o token. */
    public Map<String, Object> rota(long cid, long uid, long mid, CorpoRota c) {
        boolean mestre = ehMestre(cid, uid);
        Mapa m = base().visivelPara(cid, mid, mestre);
        if (c == null || c.id == null) throw new IllegalArgumentException("qual token?");
        MapaElemento e = achaElemento(mid, c.id, mestre);
        if (!mestre && !base().podeMoverPelasRegras(e, m, uid)) throw new CampanhaService.SemAcessoException("este token não é seu para mover");
        return partes.movimento().rota(m, e, c, mestre);
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
        avisos().publicaLista(cid);
        return base().mapaJson(Objects.requireNonNull(salvo), true);
    }

    public Map<String, Object> editar(long cid, long uid, long mid, CorpoMapa c) {
        camp.exigeMestre(cid, uid);
        Mapa m = base().travado(mid, () -> tx.execute(s -> {
            Mapa x = base().doMestre(cid, mid);
            String antes = om.writeValueAsString(base().mapaJson(x, true));
            aplicaMapa(x, c, cid);
            x.setSeq(x.getSeq() + 1);
            x.setAtualizadoEm(Instant.now());
            mapas.save(x);
            base().registra(x, uid, "mapa", 0, om.writeValueAsString(base().mapaJson(x, true)), antes);
            return x;
        }));
        avisos().publicar(cid, (p, u) -> {
            boolean mestre = p == Papel.MESTRE;
            if (!mestre && !m.isAtivo()) return null;
            Map<String, Object> ev = MapaAvisos.evento("mapa", m.getSeq());
            ev.put("mapa", base().mapaJson(m, mestre));
            return ev;
        });
        return base().mapaJson(m, true);
    }

    /** Liga (ou desliga) o mapa que os jogadores veem. So um fica ativo por campanha. */
    public Map<String, Object> ativar(long cid, long uid, long mid, boolean ligar) {
        camp.exigeMestre(cid, uid);
        Long ativo = tx.execute(s -> {
            Mapa alvo = base().doMestre(cid, mid);
            for (Mapa m : mapas.findByCampanhaIdOrderByOrdemAscIdAsc(cid)) {
                boolean fica = ligar && Objects.equals(m.getId(), alvo.getId());
                if (m.isAtivo() != fica) { m.setAtivo(fica); mapas.save(m); }
            }
            return ligar ? alvo.getId() : null;
        });
        avisos().publicaAtivo(cid, ativo);
        return Collections.singletonMap(K_ATIVO, ativo);
    }

    public void apagar(long cid, long uid, long mid) {
        camp.exigeMestre(cid, uid);
        boolean eraAtivo = Boolean.TRUE.equals(base().travado(mid, () -> tx.execute(s -> {
            Mapa m = base().doMestre(cid, mid);
            elementos.deleteByMapaId(mid);
            historico.deleteByMapaId(mid);
            visao.apagaMapa(mid);
            mapas.delete(m);
            return m.isAtivo();
        })));
        base().esqueceTrava(mid);
        visao.esquece(mid);
        avisos().publicaLista(cid);
        if (eraAtivo) avisos().publicaAtivo(cid, null);
    }

    /** Campanha apagada: chamado dentro da transacao de CampanhaController. */
    public void apagarDaCampanha(long cid) {
        historico.deleteByCampanhaId(cid);
        visao.apagaCampanha(cid);
        elementos.deleteByCampanhaId(cid);
        mapas.deleteByCampanhaId(cid);
        turnos.apaga(cid);
    }

    // ---------- elementos ----------

    public Map<String, Object> criarElemento(long cid, long uid, long mid, CorpoElemento c) {
        camp.exigeMestre(cid, uid);
        MapaFeito f = feito(base().travado(mid, () -> tx.execute(s -> {
            Mapa m = base().doMestre(cid, mid);
            if (elementos.countByMapaId(mid) >= MAX_ELEMENTOS) throw new IllegalArgumentException("elementos demais neste mapa");
            MapaElemento x = new MapaElemento();
            x.setMapaId(mid);
            x.setCampanhaId(cid);
            MapaElemento.Tipo t = tipo(c.tipo);
            x.setTipo(t);
            ObjectNode d = dadosDoTipo(t, om.createObjectNode(), c.dados, m);
            x.setCamada(MapaRegras.camada(c.camada, camadaPadrao(t, d)));
            x.setDono(t == MapaElemento.Tipo.TOKEN ? donoInicial(cid, c, d) : 0);
            if (c.bloqueado != null) x.setBloqueado(c.bloqueado);
            if (c.visivel != null && !MapaBase.sempreVisivel(t)) x.setVisivel(c.visivel);
            x.setOrdem((int) elementos.countByMapaId(mid));
            x.setDados(om.writeValueAsString(d));
            elementos.save(x);
            m.setSeq(m.getSeq() + 1);
            mapas.save(m);
            base().registra(m, uid, K_CRIAR, x.getId(), base().elCruTexto(x), "");
            return new MapaFeito(x, m, false);
        })));
        avisos().publicaElemento(cid, f);
        return base().elJson(f.e(), f.m(), true, uid);
    }

    /**
     * Mestre muda tudo. Jogador so move (x e y), e so o token que pode mover: o dele, o liberado
     * pelo mestre, ou qualquer um quando o mapa libera para todos. Elemento oculto e mapa que nao
     * esta ativo respondem 404 para ele, como ficha de outra pessoa.
     */
    public Map<String, Object> mudarElemento(long cid, long uid, long mid, long eid, CorpoElemento c) {
        boolean mestre = ehMestre(cid, uid);
        MapaFeito f = feito(base().travado(mid, () -> tx.execute(s -> {
            Mapa m = base().visivelPara(cid, mid, mestre);
            return mudaUm(m, achaElemento(mid, eid, mestre), c, mestre, uid, true);
        })));
        avisos().publicaElemento(cid, f);
        if (f.ordem()) avisos().publicaOrdem(cid, f.m());
        Map<String, Object> r = base().elJson(f.e(), f.m(), mestre, uid);
        /* so na resposta de quem moveu: os outros nao precisam saber que alguem passou do limite */
        if (f.passou()) r.put("passou", true);
        return r;
    }

    private MapaElemento achaElemento(long mid, long eid, boolean mestre) {
        return elementos.findById(eid)
                .filter(e -> Objects.equals(e.getMapaId(), mid))
                .filter(e -> mestre || e.isVisivel())
                .orElseThrow(NaoAchado::new);
    }

    /**
     * Uma mudanca de elemento, dentro da transacao de quem chamou. {@code sobeSeq} falso e o item de um
     * grupo: o grupo sobe o seq uma vez e todas as linhas do historico levam o mesmo, que e o que faz o
     * desfazer tratar o grupo como uma acao so.
     */
    private MapaFeito mudaUm(Mapa m, MapaElemento x, CorpoElemento c, boolean mestre, long uid, boolean sobeSeq) {
        if (mestre) exigeSolto(x, m, c); else exigeDoJogador(x, m, c, uid);
        String antes = base().elCruTexto(x);
        boolean via = x.isVisivel();
        ObjectNode d0 = base().ler(x.getDados());
        double x0 = d0.path("x").asDouble(0);
        double y0 = d0.path("y").asDouble(0);
        int ordem0 = x.getOrdem();
        aplicaElemento(x, c, m, mestre, uid);
        boolean passou = !mestre && partes.movimento().gastaDeslocamento(x, m, x0, y0, c);
        /* o jogador que so reenvia o que ja era nao deixa rastro no historico: nao haveria o que desfazer */
        if (!mestre && base().elCruTexto(x).equals(antes)) return new MapaFeito(x, m, via, false, false);
        elementos.save(x);
        partes.vida().vidaParaFicha(m.getCampanhaId(), d0, base().ler(x.getDados()));
        if (sobeSeq) { m.setSeq(m.getSeq() + 1); mapas.save(m); }
        base().registra(m, uid, K_MUDAR, x.getId(), base().elCruTexto(x), antes);
        return new MapaFeito(x, m, via, passou, ordem0 != x.getOrdem(), partes.movimento().caminhoAndado(m, c, x0, y0, x, mestre));
    }

    /**
     * O jogador mexe em duas coisas: na posicao (token que ele pode mover, na vez dele) e na vida atual
     * e nas marcas (so o dono do token, a qualquer hora). Nao se mistura permissao de uma com a da outra.
     */
    private void exigeDoJogador(MapaElemento x, Mapa m, CorpoElemento c, long uid) {
        Map<String, Object> d = c.dados == null ? Map.of() : c.dados;
        boolean marca = d.containsKey("vida") || d.containsKey(K_MARCAS);
        boolean mexe = d.containsKey("x") || d.containsKey("y");
        if (marca && !(x.getTipo() == MapaElemento.Tipo.TOKEN && x.getDono() == uid && x.isVisivel() && !base().trancado(x, m))) {
            throw new CampanhaService.SemAcessoException("só o dono do token muda a vida e as marcas dele");
        }
        if (mexe || !marca) {
            if (!base().podeMoverPelasRegras(x, m, uid)) throw new CampanhaService.SemAcessoException("este token não é seu para mover");
            if (base().esperaAVez(x, m)) throw new CampanhaService.SemAcessoException("Ainda não é a vez de " + base().nomeDe(x) + ".");
        }
    }

    /** O mestre so mexe no que esta solto; o unico pedido aceito num elemento do proprio bloqueio e destranca-lo. */
    private void exigeSolto(MapaElemento x, Mapa m, CorpoElemento c) {
        boolean soDestranca = Boolean.FALSE.equals(c.bloqueado) && x.isBloqueado();
        if (base().trancado(x, m) && !(soDestranca && !base().camadaTrancada(x, m))) throw new IllegalStateException(MSG_TRANCADO);
    }

    private MapaFeito removeUm(Mapa m, MapaElemento x, long uid, boolean sobeSeq) {
        if (base().trancado(x, m)) throw new IllegalStateException(MSG_TRANCADO);
        String antes = base().elCruTexto(x);
        elementos.delete(x);
        if (sobeSeq) { m.setSeq(m.getSeq() + 1); mapas.save(m); }
        base().registra(m, uid, K_REMOVER, x.getId(), "", antes);
        return new MapaFeito(x, m, x.isVisivel());
    }

    /**
     * Mover ou organizar a selecao: todos os itens numa transacao so (ou nenhum, se um estiver
     * trancado), com o mesmo seq no historico. So o mestre. A resposta traz o elemento de cada item,
     * ou {@code removido}.
     */
    public Map<String, Object> lote(long cid, long uid, long mid, CorpoLote c) {
        camp.exigeMestre(cid, uid);
        if (c == null || c.itens == null || c.itens.isEmpty()) throw new IllegalArgumentException("nada a fazer");
        if (c.itens.size() > MAX_LOTE) throw new IllegalArgumentException("itens demais de uma vez");
        List<MapaFeito.Desfeito> feitos = Objects.requireNonNull(base().travado(mid, () -> tx.execute(s -> aplicaLote(cid, uid, mid, c.itens))));
        avisos().publicaDesfeitos(cid, feitos);
        List<Object> itens = new ArrayList<>();
        for (MapaFeito.Desfeito d : feitos) {
            itens.add(d.removido() ? Map.of(K_ID, d.feito().e().getId(), "removido", true)
                    : base().elJson(d.feito().e(), d.feito().m(), true, uid));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put(K_SEQ, feitos.getFirst().feito().m().getSeq());
        out.put("itens", itens);
        return out;
    }

    /** os itens do grupo, dentro da transacao: um seq so para todos */
    private List<MapaFeito.Desfeito> aplicaLote(long cid, long uid, long mid, List<ItemLote> itens) {
        Mapa m = base().doMestre(cid, mid);
        m.setSeq(m.getSeq() + 1);
        mapas.save(m);
        List<MapaFeito.Desfeito> out = new ArrayList<>();
        for (ItemLote it : itens) {
            if (it == null || it.id == null) throw new IllegalArgumentException("item sem id");
            MapaElemento x = achaElemento(mid, it.id, true);
            boolean remove = Boolean.TRUE.equals(it.remover);
            out.add(new MapaFeito.Desfeito(remove ? removeUm(m, x, uid, false) : mudaUm(m, x, it, true, uid, false), remove));
        }
        return out;
    }

    /** Devolve o seq da operacao: e com ele que a tela pede para desfazer a remocao. */
    public long removerElemento(long cid, long uid, long mid, long eid) {
        camp.exigeMestre(cid, uid);
        MapaFeito f = feito(base().travado(mid, () -> tx.execute(s -> {
            Mapa m = base().doMestre(cid, mid);
            return removeUm(m, achaElemento(mid, eid, true), uid, true);
        })));
        avisos().publicaRemocao(cid, f);
        return f.m().getSeq();
    }

    // ---------- turno, desfazer e historico (MapaIniciativa e MapaDesfazer) ----------

    /** Novo turno a mao (a iniciativa nao esta rodando, ou o mestre quer): zera o gasto de todos no mapa ativo. So o mestre. */
    public Map<String, Object> novoTurno(long cid, long uid) {
        camp.exigeMestre(cid, uid);
        return partes.iniciativa().novoTurno(cid, uid);
    }

    /** A iniciativa mudou no navegador do mestre (MapaIniciativa.sincronizaTurno). So o mestre. */
    public Map<String, Object> sincronizaTurno(long cid, long uid, CorpoTurno c) {
        camp.exigeMestre(cid, uid);
        return partes.iniciativa().sincronizaTurno(cid, uid, c);
    }

    /** Desfaz a ultima operacao desta pessoa no mapa (ou a de {@code seqAlvo}); cada um desfaz so as proprias. */
    public Map<String, Object> desfazer(long cid, long uid, long mid, Long seqAlvo) {
        return partes.desfazer().desfazer(cid, uid, mid, seqAlvo, ehMestre(cid, uid));
    }

    /** O historico do mapa: o mestre ve tudo; o jogador, so o que ele mesmo fez. */
    public List<Map<String, Object>> historico(long cid, long uid, long mid, int limite) {
        return partes.desfazer().historico(cid, uid, mid, limite, ehMestre(cid, uid));
    }

    // ---------- token e ficha (MapaVida), e o ping ----------

    /** A barra da ficha mudou: os tokens vinculados a ela ficam com a mesma vida. Chamado depois de gravar a ficha. */
    public void vidaDaFicha(long cid, long fichaId, String conteudo) {
        partes.vida().vidaDaFicha(cid, fichaId, conteudo);
    }

    /** O alcance da visao da ficha mudou: os tokens vinculados a ela guardam a copia. Chamado depois de gravar a ficha. */
    public void visaoDaFicha(long cid, long fichaId, String conteudo) {
        partes.vida().visaoDaFicha(cid, fichaId, conteudo);
    }

    /** Aponta um ponto do mapa: todos que veem o mapa recebem na hora, e nada fica gravado. */
    public void ping(long cid, long uid, long mid, double x, double y) {
        boolean mestre = ehMestre(cid, uid);
        Mapa m = base().visivelPara(cid, mid, mestre);
        long agora = System.currentTimeMillis();
        Long ult = ultimoPing.put(uid, agora);
        if (ult != null && agora - ult < 400) return;
        double w = Math.max(1, m.getLargura());
        double h = Math.max(1, m.getAltura());
        String quem = usuarios.findById(uid).map(u -> u.getNome() == null || u.getNome().isBlank() ? u.getLogin() : u.getNome()).orElse("?");
        avisos().publicar(cid, (p, u) -> {
            if (p != Papel.MESTRE && !m.isAtivo()) return null;
            Map<String, Object> ev = MapaAvisos.evento("ping", null);
            ev.put("mapa", mid);
            ev.put("x", Math.round(Math.clamp(x, 0, w) * 10) / 10.0);
            ev.put("y", Math.round(Math.clamp(y, 0, h) * 10) / 10.0);
            ev.put("quem", quem);
            ev.put("meu", u == uid);
            return ev;
        });
    }

    // ---------- regras internas ----------

    private boolean ehMestre(long cid, long uid) {
        return camp.exigeMembro(cid, uid) == Papel.MESTRE;
    }

    private void aplicaElemento(MapaElemento x, CorpoElemento c, Mapa m, boolean mestre, long uid) {
        ObjectNode d = base().ler(x.getDados());
        if (!mestre) {
            MapaRegras.posicao(d, c.dados, m);
            if (x.getDono() == uid && x.getTipo() == MapaElemento.Tipo.TOKEN) MapaRegras.vidaEMarcas(d, c.dados);
        } else {
            dadosDoTipo(x.getTipo(), d, c.dados, m);
            aplicaDoMestre(x, c, m);
        }
        x.setDados(om.writeValueAsString(d));
    }

    /** o que so o mestre muda fora dos dados: dono, visibilidade, camada, trava e ordem */
    private void aplicaDoMestre(MapaElemento x, CorpoElemento c, Mapa m) {
        if (c.dono != null && x.getTipo() == MapaElemento.Tipo.TOKEN) x.setDono(Math.max(0, c.dono));
        if (c.visivel != null && !MapaBase.sempreVisivel(x.getTipo())) x.setVisivel(c.visivel);
        if (c.camada != null) x.setCamada(MapaRegras.camada(c.camada, x.getCamada()));
        if (c.bloqueado != null) x.setBloqueado(c.bloqueado);
        if (c instanceof ItemLote it && it.ordem != null) x.setOrdem(novaOrdem(m, it.ordem, x.getOrdem()));
    }

    /** "frente": uma acima de todos; "tras": uma abaixo de todos. A lista do mapa e lida por esse numero. */
    private int novaOrdem(Mapa m, String quer, int atual) {
        List<MapaElemento> todos = elementos.findByMapaIdOrderByOrdemAscIdAsc(m.getId());
        if (todos.isEmpty()) return atual;
        if ("frente".equals(quer)) return todos.getLast().getOrdem() + 1;
        if ("tras".equals(quer)) return todos.getFirst().getOrdem() - 1;
        return atual;
    }

    private static MapaFeito feito(MapaFeito f) {
        return Objects.requireNonNull(f, "operação sem resultado");
    }

    private static String camadaPadrao(MapaElemento.Tipo t, ObjectNode d) {
        return switch (t) {
            case DESENHO -> "decoracao";
            case PAREDE, FOG -> "cenario";
            case TOKEN -> d.hasNonNull("npcId") ? "npcs" : "personagens";
        };
    }

    /** Cada tipo de elemento tem as suas regras de dados; o que nao e conhecido cai. */
    private static ObjectNode dadosDoTipo(MapaElemento.Tipo t, ObjectNode d, Map<String, Object> in, Mapa m) {
        return switch (t) {
            case DESENHO -> MapaRegras.dadosDesenho(d, in, m);
            case PAREDE -> MapaRegras.dadosParede(d, in, m);
            case FOG -> MapaRegras.dadosFog(d, in, m);
            case TOKEN -> MapaRegras.dadosToken(d, in, m);
        };
    }

    private static MapaElemento.Tipo tipo(String t) {
        if (t == null || t.isBlank()) return MapaElemento.Tipo.TOKEN;
        return MapaElemento.Tipo.valueOf(t.trim().toUpperCase(Locale.ROOT));
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
        aplicaImagem(m, c, cid);
        if (c.grid != null) m.setGrid(om.writeValueAsString(MapaRegras.grid(c.grid)));
        if (c.regras != null) m.setRegras(om.writeValueAsString(MapaRegras.regras(regrasMescladas(m, c.regras))));
        if (c.cenaId != null) m.setCenaId(MapaRegras.corta(c.cenaId.trim(), 80));
    }

    /** imagem nova: o tamanho passa a ser o dela; sem imagem, o tamanho pedido (em pixels) */
    private void aplicaImagem(Mapa m, CorpoMapa c, long cid) {
        if (c.imagem != null && !c.imagem.equals(m.getImagem())) {
            String img = MapaRegras.caminhoImagem(c.imagem);
            m.setImagem(img);
            int[] wh = img.isEmpty() ? null : dimensoes(cid, img);
            if (wh != null) {
                m.setLargura(wh[0]);
                m.setAltura(wh[1]);
            }
        }
        if (m.getImagem().isEmpty() && c.largura != null && c.altura != null) {
            m.setLargura(Math.clamp(c.largura, LADO_MIN, LADO_MAX));
            m.setAltura(Math.clamp(c.altura, LADO_MIN, LADO_MAX));
        }
    }

    /**
     * As regras pedidas, com o que nao veio mantido como estava: quem edita so o "quem move" e o limite nao
     * destranca as camadas, nem desliga a nevoa, a memoria ou o encaixe sem querer.
     */
    private Map<String, Object> regrasMescladas(Mapa m, Map<String, Object> pedidas) {
        Map<String, Object> in = new LinkedHashMap<>(pedidas);
        JsonNode antes = base().ler(m.getRegras());
        in.putIfAbsent(K_ENCAIXE, antes.path(K_ENCAIXE).asBoolean(true));
        in.putIfAbsent("fog", antes.path("fog").asString(MapaNevoa.NENHUM));
        for (String k : List.of(MapaRegras.K_FOG_MEMORIA, MapaRegras.K_FOG_VER, MapaRegras.K_VISAO_PADRAO)) {
            JsonNode v = antes.get(k);
            if (v != null && !in.containsKey(k)) in.put(k, v.isBoolean() ? v.asBoolean() : v.asDouble());
        }
        if (!in.containsKey(K_TRANCADAS)) {
            List<String> t = new ArrayList<>();
            for (JsonNode n : antes.path(K_TRANCADAS)) t.add(n.asString(""));
            in.put(K_TRANCADAS, t);
        }
        return in;
    }

    private int[] dimensoes(long cid, String img) {
        Path raiz = raizMidia.resolve("c" + cid);
        Path arq = raiz.resolve(img).normalize();
        if (!arq.startsWith(raiz.resolve("img"))) throw new IllegalArgumentException("imagem fora da campanha");
        return Miniaturas.dimensoes(arq).orElseThrow(() -> new IllegalArgumentException("não consegui ler essa imagem"));
    }
}
